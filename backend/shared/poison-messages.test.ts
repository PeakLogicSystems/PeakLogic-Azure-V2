import { describe, it, expect } from 'vitest';
import { extractThingName } from './poison-messages';

describe('extractThingName', () => {
  it('extracts thingName from a well-formed IoTIngestEvent payload', () => {
    expect(extractThingName(JSON.stringify({ thingName: 'device-123', ts: 1, metrics: {} }))).toBe('device-123');
  });

  it('returns null for a payload that is not valid JSON at all — the primary case this exists to handle', () => {
    expect(extractThingName('{not valid json at all')).toBeNull();
  });

  it('returns null for valid JSON that has no thingName field', () => {
    expect(extractThingName(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('returns null when thingName is present but not a string', () => {
    expect(extractThingName(JSON.stringify({ thingName: 12345 }))).toBeNull();
  });

  it('returns null for valid JSON that is not even an object (e.g. a bare number or array)', () => {
    expect(extractThingName('42')).toBeNull();
    expect(extractThingName('[1,2,3]')).toBeNull();
  });

  it('returns null for an empty string payload', () => {
    expect(extractThingName('')).toBeNull();
  });
});
