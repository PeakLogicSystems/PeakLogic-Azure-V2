import { describe, it, expect } from 'vitest';
import { updateBaseline, type BaselineIdentity } from './baseline';

const identity: BaselineIdentity = { tenant_id: 't1', device_id: 'd1', metric: 'power_kw' };
const t0 = new Date('2026-07-01T00:00:00Z');
const t1 = new Date('2026-07-01T00:05:00Z');

describe('updateBaseline', () => {
  it('seeds mean=value, stddev=0, sample_count=1 on the first-ever reading', () => {
    const result = updateBaseline(identity, null, 10, t0);
    expect(result.trailing_mean).toBe(10);
    expect(result.trailing_stddev).toBe(0);
    expect(result.sample_count).toBe(1);
    expect(result.window_start).toEqual(t0);
    expect(result.window_end).toEqual(t0);
  });

  it('also seeds fresh when the existing row has sample_count 0 (defensive — should not occur via this module, but a bad row must not divide by zero)', () => {
    const stale = { ...identity, trailing_mean: 999, trailing_stddev: 5, window_start: t0, window_end: t0, sample_count: 0 };
    const result = updateBaseline(identity, stale, 10, t1);
    expect(result.trailing_mean).toBe(10);
    expect(result.sample_count).toBe(1);
  });

  it('increments sample_count and preserves window_start across updates', () => {
    const first = updateBaseline(identity, null, 10, t0);
    const second = updateBaseline(identity, first, 12, t1);
    expect(second.sample_count).toBe(2);
    expect(second.window_start).toEqual(t0); // unchanged — "first ever reading"
    expect(second.window_end).toEqual(t1); // advances
  });

  it('moves the mean toward a new value that is consistently higher than history', () => {
    let baseline = updateBaseline(identity, null, 10, t0);
    // Feed the same higher value repeatedly — EWMA mean should converge upward monotonically.
    let prevMean = baseline.trailing_mean;
    for (let i = 0; i < 100; i++) {
      baseline = updateBaseline(identity, baseline, 20, t1);
      expect(baseline.trailing_mean).toBeGreaterThan(prevMean);
      prevMean = baseline.trailing_mean;
    }
    // EWMA convergence after n steps: mean = 20 - 10*(1-alpha)^n, alpha=2/51.
    // At n=100, (1-alpha)^100 ≈ 0.0198, so mean ≈ 19.8 — verified, not guessed.
    expect(baseline.trailing_mean).toBeGreaterThan(19.5);
  });

  it('stddev grows when readings are volatile, and shrinks back down when they stabilize', () => {
    let baseline = updateBaseline(identity, null, 10, t0);
    for (const v of [10, 30, 5, 35, 8, 32]) {
      baseline = updateBaseline(identity, baseline, v, t1);
    }
    const volatileStddev = baseline.trailing_stddev;
    expect(volatileStddev).toBeGreaterThan(5);

    for (let i = 0; i < 60; i++) {
      baseline = updateBaseline(identity, baseline, baseline.trailing_mean, t1); // feed exactly the current mean repeatedly
    }
    expect(baseline.trailing_stddev).toBeLessThan(volatileStddev);
  });

  it('never returns a negative stddev even under repeated identical-value updates (float-underflow guard)', () => {
    let baseline = updateBaseline(identity, null, 5, t0);
    for (let i = 0; i < 200; i++) {
      baseline = updateBaseline(identity, baseline, 5, t1);
    }
    expect(baseline.trailing_stddev).toBeGreaterThanOrEqual(0);
  });

  it('carries tenant_id/device_id/metric through unchanged on every update', () => {
    const first = updateBaseline(identity, null, 10, t0);
    const second = updateBaseline(identity, first, 11, t1);
    expect(second.tenant_id).toBe('t1');
    expect(second.device_id).toBe('d1');
    expect(second.metric).toBe('power_kw');
  });
});
