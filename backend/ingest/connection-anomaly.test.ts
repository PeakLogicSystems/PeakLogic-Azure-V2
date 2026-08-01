import { describe, it, expect } from 'vitest';
import { computeConnectionIntervalSeconds, formatConnectionAnomalyMessage } from './connection-anomaly';
import type { AnomalyResult } from './anomaly';

describe('computeConnectionIntervalSeconds', () => {
  it('returns null when there is no prior reading (first-ever reading)', () => {
    expect(computeConnectionIntervalSeconds(null, new Date())).toBeNull();
  });

  it('computes the gap in seconds between the previous and current reading', () => {
    const prev = new Date('2026-08-01T00:00:00Z');
    const now = new Date('2026-08-01T00:01:00Z');
    expect(computeConnectionIntervalSeconds(prev, now)).toBe(60);
  });

  it('returns null for a zero or negative interval — out-of-order/clock-skewed delivery, not a real gap', () => {
    const t = new Date('2026-08-01T00:00:00Z');
    expect(computeConnectionIntervalSeconds(t, t)).toBeNull();
    expect(computeConnectionIntervalSeconds(new Date('2026-08-01T00:01:00Z'), new Date('2026-08-01T00:00:00Z'))).toBeNull();
  });
});

describe('formatConnectionAnomalyMessage', () => {
  const base: AnomalyResult = {
    metric: '__connection_interval_s',
    expected: [3000, 3600], // 50-60 min
    observed: 60, // 1 min
    deviationSigma: -4.2,
    severity: 'warning',
  };

  it('describes a compressed interval (negative sigma) as reporting more often — the flooding/beaconing framing', () => {
    const msg = formatConnectionAnomalyMessage(base);
    expect(msg).toMatch(/more often/);
    expect(msg).toMatch(/beaconing/);
  });

  it('describes a stretched interval (positive sigma) as reporting less often — the early-warning framing', () => {
    const msg = formatConnectionAnomalyMessage({ ...base, observed: 7200, deviationSigma: 4.2 });
    expect(msg).toMatch(/less often/);
    expect(msg).toMatch(/not yet silent/);
  });
});
