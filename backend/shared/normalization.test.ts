import { describe, it, expect } from 'vitest';
import { applyTag, normalizeReadings, type Tag, type RawSample } from './normalization';

const now = new Date('2026-07-25T12:00:00Z');
function tag(overrides: Partial<Tag> = {}): Tag {
  return { id: 't1', sourceRef: '40001', canonicalMetric: 'flow_mgd', unit: 'MGD', scale: 1, offset: 0, ...overrides };
}
function sample(overrides: Partial<RawSample> = {}): RawSample {
  return { sourceRef: '40001', value: 2.41, time: now, ...overrides };
}

describe('applyTag', () => {
  it('is identity when scale=1, offset=0', () => {
    expect(applyTag(tag(), 2.41)).toBe(2.41);
  });
  it('applies the linear transform value = raw*scale + offset', () => {
    // e.g. a raw 0–27648 Siemens word scaled to 0–100%: scale=100/27648, offset=0
    expect(applyTag(tag({ scale: 0.5, offset: 10 }), 40)).toBe(30);
    expect(applyTag(tag({ scale: 100 / 27648, offset: 0 }), 13824)).toBeCloseTo(50);
  });
  it('handles a negative offset (e.g. 4–20 mA → 0-based engineering units)', () => {
    expect(applyTag(tag({ scale: 1, offset: -4 }), 12)).toBe(8);
  });
});

describe('normalizeReadings', () => {
  it('maps a raw sample to its canonical metric with unit', () => {
    const { readings } = normalizeReadings([tag()], [sample()]);
    expect(readings).toEqual([{ metric: 'flow_mgd', value: 2.41, unit: 'MGD', sourceRef: '40001', time: now }]);
  });

  it('routes a sample with no matching tag to unmapped, not dropped', () => {
    const r = normalizeReadings([tag()], [sample({ sourceRef: '49999' })]);
    expect(r.readings).toEqual([]);
    expect(r.unmapped).toHaveLength(1);
    expect(r.unmapped[0].sourceRef).toBe('49999');
  });

  it('rejects a non-finite raw value (bad PLC read) — never a fabricated reading', () => {
    const r = normalizeReadings([tag()], [sample({ value: NaN }), sample({ value: Infinity })]);
    expect(r.readings).toEqual([]);
    expect(r.rejected).toHaveLength(2);
  });

  it('rejects when a misconfigured scale would produce a non-finite value', () => {
    const r = normalizeReadings([tag({ scale: NaN })], [sample({ value: 2.41 })]);
    expect(r.readings).toEqual([]);
    expect(r.rejected).toHaveLength(1);
  });

  it('on duplicate sourceRef, the FIRST tag wins deterministically (ordering-independent)', () => {
    const first = tag({ id: 'a', canonicalMetric: 'flow_mgd' });
    const second = tag({ id: 'b', canonicalMetric: 'WRONG' });
    const { readings } = normalizeReadings([first, second], [sample()]);
    expect(readings[0].metric).toBe('flow_mgd');
  });

  it('handles a mixed batch (mapped + unmapped + rejected) in one pass', () => {
    const tags = [tag({ sourceRef: '40001', canonicalMetric: 'flow_mgd' }), tag({ sourceRef: '40002', canonicalMetric: 'do_mgl', scale: 0.5, offset: 0, unit: 'mg/L' })];
    const samples = [
      sample({ sourceRef: '40001', value: 2.5 }), // mapped (identity) -> 2.5
      sample({ sourceRef: '40002', value: 4 }), // mapped (×0.5) -> 2.0
      sample({ sourceRef: '40099', value: 5 }), // unmapped
      sample({ sourceRef: '40001', value: NaN }), // rejected
    ];
    const r = normalizeReadings(tags, samples);
    expect(r.readings.map((x) => [x.metric, x.value])).toEqual([['flow_mgd', 2.5], ['do_mgl', 2]]);
    expect(r.unmapped).toHaveLength(1);
    expect(r.rejected).toHaveLength(1);
  });

  it('is a no-op on empty inputs', () => {
    expect(normalizeReadings([], [])).toEqual({ readings: [], unmapped: [], rejected: [] });
  });
});
