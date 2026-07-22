import type { MetricBaseline } from '../shared/types';

/**
 * Maintains `metric_baselines` — per-device-per-metric rolling statistics
 * (AI Analytics Layer Design §2 Tier 1; SRS §3.7). The table has existed
 * since the Policy Engine era (`docs/data-model.sql`, comment: "updated
 * incrementally as telemetry arrives, not recomputed from scratch") but
 * nothing in `backend/` ever wrote to it — verified by grep before writing
 * this module. This closes that gap.
 *
 * Runs UNCONDITIONALLY on every ingested reading, regardless of
 * AI_ANALYTICS_ENABLED — updating a device's own baseline has no coupling to
 * the alert pipeline and no visible behavior change, so there is no reason to
 * gate it. This is deliberate: it means the moment the flag is flipped on,
 * `sample_count`/`trailing_mean`/`trailing_stddev` already reflect real
 * history instead of starting from zero (Tier 1 scoring, by contrast, IS
 * gated — see anomaly.ts and handler.ts).
 *
 * Method: exponentially-weighted moving average/variance (EWMA), one of the
 * two methods §2 Tier 1 names ("z-score, or better MAD/EWMA for resilience
 * to outliers"). EWMA was chosen over a hard rolling window because it needs
 * no window-reset bookkeeping (window_end just tracks "last updated",
 * window_start tracks "first ever reading" for the min-history gate) and
 * decays old data smoothly rather than in a discontinuous jump when a window
 * rolls over.
 */

// Effective averaging window, expressed as a sample count (not wall-clock
// time — the reporting interval varies per device/category and isn't known
// here). alpha = 2/(N+1) is the standard EWMA-to-SMA-equivalent conversion.
// 50 is a starting default with no historical data to tune it against yet;
// revisit once real telemetry volume exists.
const EWMA_EFFECTIVE_SAMPLES = 50;
const ALPHA = 2 / (EWMA_EFFECTIVE_SAMPLES + 1);

export interface BaselineIdentity {
  tenant_id: string;
  device_id: string;
  metric: string;
}

/**
 * Pure — no I/O. `existing` is the current DB row (or null if this is the
 * first-ever reading for this device+metric); returns the row to upsert.
 *
 * Variance update follows the standard EWMA-variance recurrence:
 *   var' = (1 - alpha) * (var + alpha * (value - mean)^2)
 * (West, 1979 — the same formula used by streaming-stats libraries; not a
 * bespoke derivation). First reading seeds mean=value, stddev=0,
 * sample_count=1 — anomaly.ts's own minimum-sample gate is what actually
 * withholds scoring during this cold-start period (SRS §3.7's documented
 * requirement), not this function silently fudging a "reasonable" variance.
 */
export function updateBaseline(
  identity: BaselineIdentity,
  existing: MetricBaseline | null,
  value: number,
  now: Date,
): MetricBaseline {
  if (!existing || existing.sample_count === 0) {
    return {
      ...identity,
      trailing_mean: value,
      trailing_stddev: 0,
      window_start: now,
      window_end: now,
      sample_count: 1,
    };
  }

  const delta = value - existing.trailing_mean;
  const newMean = existing.trailing_mean + ALPHA * delta;
  const existingVariance = existing.trailing_stddev ** 2;
  const newVariance = (1 - ALPHA) * (existingVariance + ALPHA * delta * delta);

  return {
    ...identity,
    trailing_mean: newMean,
    trailing_stddev: Math.sqrt(Math.max(newVariance, 0)), // guard against float underflow producing a tiny negative
    window_start: existing.window_start,
    window_end: now,
    // Uncapped — used only as a >= MIN_SAMPLES gate (anomaly.ts), never
    // divided into anything, so it never needs to saturate or reset.
    sample_count: existing.sample_count + 1,
  };
}
