import { describe, it, expect } from 'vitest';
import { resolveHelpForContext, listKnownContextKeys } from './resolver-bridge.js';

// These exercise the REAL backend/shared/peakassist.ts resolveHelp() against
// the REAL backend/shared/peakassist-content.ts corpus (imported via esbuild,
// not reimplemented) — this is the "floor" the architecture doc requires to
// always work independent of the LLM/RAG path.
describe('resolver-bridge (deterministic floor, no LLM involved)', () => {
  it('lists the real known screen-context keys from the shipped corpus', async () => {
    const keys = await listKnownContextKeys();
    // These are the platform's actual declared screen contexts (PA-7 gate) —
    // if this ever fails, the real corpus changed, which is worth noticing.
    expect(keys).toEqual(expect.arrayContaining(['fleet', 'pv360.overview', 'hubs', 'cmms', 'compliance']));
  });

  it('resolves a screen guide first for a known context key (PA-2.1 ordering)', async () => {
    const items = await resolveHelpForContext('pv360.overview');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].type).toBe('screen_guide');
  });

  it('returns an empty list, never throws, for an unknown context key (PA-2 error case)', async () => {
    const items = await resolveHelpForContext('not-a-real-context-key');
    expect(items).toEqual([]);
  });

  it('prepends the matching alarm explanation when opened from an active alarm (PA-3.1)', async () => {
    const items = await resolveHelpForContext('pv360.overview', { alarmType: 'threshold' });
    expect(items[0].type).toBe('alarm_explanation');
    expect(items[0].alarmType).toBe('threshold');
  });
});
