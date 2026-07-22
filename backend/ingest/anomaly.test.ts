import { describe, it, expect } from 'vitest';
import { scoreAnomaly, formatAnomalyMessage, MIN_SAMPLES_FOR_ANOMALY, ANOMALY_SEVERITY } from './anomaly';
import type { MetricBaseline } from '../shared/types';

const t0 = new Date('2026-07-01T00:00:00Z');

function baseline(overrides: Partial<MetricBaseline> = {}): MetricBaseline {
  return {
    tenant_id: 't1',
    device_id: 'd1',
    metric: 'power_kw',
    trailing_mean: 10,
    trailing_stddev: 1,
    window_start: t0,
    window_end: t0,
    sample_count: 50,
    ...overrides,
  };
}

describe('scoreAnomaly', () => {
  it('withholds a finding below the minimum sample count (cold-start guard)', () => {
    const b = baseline({ sample_count: MIN_SAMPLES_FOR_ANOMALY - 1 });
    expect(scoreAnomaly(b, 50)).toBeNull(); // wildly deviant value, but not enough history yet
  });

  it('scores normally once sample_count meets the minimum exactly', () => {
    const b = baseline({ sample_count: MIN_SAMPLES_FOR_ANOMALY });
    expect(scoreAnomaly(b, 50)).not.toBeNull();
  });

  it('withholds when the baseline is degenerate (near-zero stddev) to avoid flagging every reading of a flat signal', () => {
    const b = baseline({ trailing_stddev: 0 });
    expect(scoreAnomaly(b, 10.5)).toBeNull();
  });

  it('returns null when the reading is well within the sigma threshold', () => {
    const b = baseline(); // mean 10, stddev 1
    expect(scoreAnomaly(b, 11)).toBeNull(); // 1 sigma, default threshold is 3
  });

  it('flags a reading that clears the default 3-sigma threshold, with correct sign', () => {
    const b = baseline();
    const high = scoreAnomaly(b, 14); // +4 sigma
    expect(high).not.toBeNull();
    expect(high!.deviationSigma).toBeCloseTo(4);

    const low = scoreAnomaly(b, 6); // -4 sigma
    expect(low).not.toBeNull();
    expect(low!.deviationSigma).toBeCloseTo(-4);
  });

  it('respects a custom sigma threshold', () => {
    const b = baseline();
    expect(scoreAnomaly(b, 12, { sigmaThreshold: 3 })).toBeNull(); // 2 sigma, below a 3-sigma bar
    expect(scoreAnomaly(b, 12, { sigmaThreshold: 1.5 })).not.toBeNull(); // 2 sigma, clears a 1.5-sigma bar
  });

  it('always caps severity at warning — never critical (advisory-only, §1 principle)', () => {
    const b = baseline();
    const result = scoreAnomaly(b, 1000); // absurdly deviant
    expect(result!.severity).toBe(ANOMALY_SEVERITY);
    expect(result!.severity).toBe('warning');
  });

  it('computes an [expected lo, hi] band centered on the trailing mean', () => {
    const b = baseline({ trailing_mean: 10, trailing_stddev: 2 });
    const result = scoreAnomaly(b, 20, { sigmaThreshold: 3 });
    expect(result!.expected).toEqual([4, 16]); // 10 - 3*2, 10 + 3*2
  });
});

describe('formatAnomalyMessage', () => {
  it('produces a readable message including direction, metric, and magnitude', () => {
    const b = baseline();
    const result = scoreAnomaly(b, 14)!;
    const message = formatAnomalyMessage(result);
    expect(message).toContain('power_kw');
    expect(message).toContain('above');
    expect(message).toContain('4.0');
  });

  it('says "below" for a negative deviation', () => {
    const b = baseline();
    const result = scoreAnomaly(b, 6)!;
    expect(formatAnomalyMessage(result)).toContain('below');
  });
});
