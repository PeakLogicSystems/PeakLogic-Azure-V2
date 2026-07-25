import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  compareContentVersions,
  needsBundleUpdate,
  buildBundle,
  verifyBundle,
  planHubSync,
} from './peakassist-sync';
import { PEAKASSIST_CONTENT, PEAKASSIST_CONTENT_VERSION } from './peakassist-content';

describe('compareContentVersions', () => {
  it('orders by year, month, then patch', () => {
    expect(compareContentVersions('2026.06.2', '2026.07.1')).toBe(-1); // older month
    expect(compareContentVersions('2026.07.1', '2026.07.10')).toBe(-1); // numeric patch, not string
    expect(compareContentVersions('2026.07.1', '2026.07.1')).toBe(0);
    expect(compareContentVersions('2027.01.0', '2026.12.9')).toBe(1);
  });
  it('zero-pads shorter versions and tolerates malformed components', () => {
    expect(compareContentVersions('2026.07', '2026.07.1')).toBe(-1);
    expect(compareContentVersions('2026.07.0', '2026.07')).toBe(0);
    expect(compareContentVersions('junk', '2026.07.1')).toBe(-1); // malformed never sorts ahead
  });
});

describe('needsBundleUpdate', () => {
  it('is true when the Hub has never synced', () => {
    expect(needsBundleUpdate(null, '2026.07.1')).toBe(true);
  });
  it('is true only when the Hub is behind the latest', () => {
    expect(needsBundleUpdate('2026.06.2', '2026.07.1')).toBe(true);
    expect(needsBundleUpdate('2026.07.1', '2026.07.1')).toBe(false);
    expect(needsBundleUpdate('2026.08.0', '2026.07.1')).toBe(false); // already ahead
  });
});

describe('buildBundle / verifyBundle', () => {
  it('stamps a checksum that round-trips', () => {
    const bundle = buildBundle(PEAKASSIST_CONTENT, PEAKASSIST_CONTENT_VERSION);
    expect(bundle.version).toBe(PEAKASSIST_CONTENT_VERSION);
    expect(bundle.checksum).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    expect(verifyBundle(bundle)).toBe(true);
  });

  it('rejects a corrupted bundle (truncated/tampered content)', () => {
    const bundle = buildBundle(PEAKASSIST_CONTENT, PEAKASSIST_CONTENT_VERSION);
    const tampered = { ...bundle, content: bundle.content.slice(0, -1) }; // dropped one item
    expect(verifyBundle(tampered)).toBe(false);
  });

  it('is order-independent — a reordered bundle still verifies (matches DB read order)', () => {
    const bundle = buildBundle(PEAKASSIST_CONTENT, PEAKASSIST_CONTENT_VERSION);
    const shuffled = buildBundle([...PEAKASSIST_CONTENT].reverse(), PEAKASSIST_CONTENT_VERSION);
    expect(shuffled.checksum).toBe(bundle.checksum);
    expect(verifyBundle({ ...bundle, content: [...bundle.content].reverse() })).toBe(true);
  });

  it('the bundle checksum matches the value recorded in the seed migration (cloud↔Hub integrity)', () => {
    const bundle = buildBundle(PEAKASSIST_CONTENT, PEAKASSIST_CONTENT_VERSION);
    const migration = readFileSync(
      path.resolve(__dirname, '..', '..', 'scripts', 'migrations', '1784142300000_peakassist-seed.sql'),
      'utf8',
    );
    expect(migration).toContain(`'${PEAKASSIST_CONTENT_VERSION}', '${bundle.checksum}'`);
  });
});

describe('planHubSync', () => {
  it('lists only Hubs behind the latest (incl. never-synced), with from→to', () => {
    const plan = planHubSync(
      [
        { id: 'a', peakassistContentVersion: '2026.07.1' }, // current — excluded
        { id: 'b', peakassistContentVersion: '2026.06.2' }, // behind
        { id: 'c', peakassistContentVersion: null }, // never synced
      ],
      '2026.07.1',
    );
    expect(plan).toEqual([
      { hubId: 'b', from: '2026.06.2', to: '2026.07.1' },
      { hubId: 'c', from: null, to: '2026.07.1' },
    ]);
  });
});
