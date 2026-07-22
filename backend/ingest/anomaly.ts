import type { MetricBaseline } from '../shared/types';

/**
 * AI Analytics Layer Design §2 Tier 1 — score a single reading against a
 * device's own learned baseline (`metric_baselines`, maintained by
 * baseline.ts). Pure — no I/O, no DB access, mirrors the existing
 * rules.ts/policy-resolver.ts split (evaluation logic stays testable in
 * isolation from the handler's transaction/RLS plumbing).
 *
 * Gated behind AI_ANALYTICS_ENABLED at the call site (handler.ts) — this
 * module itself has no opinion on the flag; it just scores whatever baseline
 * it's given. §1 principle: "advisory, never authoritative for safety" — a
 * finding from this module only ever produces an `alerts` row of severity
 * 'warning' (see ANOMALY_SEVERITY below), never 'critical'. Anomaly
 * detection has no measured precision/recall yet (that requires the CMMS
 * feedback loop — service_visits outcomes — which Tier 1 does not consume);
 * auto-creating a service ticket (which 'critical' does, per
 * handler.ts's createTicketForAlert) for an unproven statistical signal
 * would be a real behavior risk, not just an abundance of caution. Revisit
 * once real false-positive-rate data exists.
 */

// SRS §3.7 / schema comment: "withhold anomaly flag until a minimum history
// is met." 20 is a conservative starting default — enough to make trailing_
// stddev meaningful, not tuned against any real data yet (none exists; the
// baseline table was never populated before this change).
export const MIN_SAMPLES_FOR_ANOMALY = 20;

// Standard "3-sigma" convention — flags roughly the most extreme ~0.3% of
// readings for a normally-distributed metric. No real telemetry history
// exists yet to tune this against actual false-positive rates; treat as a
// starting default, not a validated threshold.
export const DEFAULT_SIGMA_THRESHOLD = 3;

// Every Tier 1 finding is capped at 'warning' — see module doc above. Not
// configurable per call site on purpose (this is a safety posture, not a
// tuning knob).
export const ANOMALY_SEVERITY = 'warning' as const;

export interface AnomalyResult {
  metric: string;
  expected: [number, number]; // [mean - k*stddev, mean + k*stddev]
  observed: number;
  deviationSigma: number;
  severity: typeof ANOMALY_SEVERITY;
}

/**
 * Returns null (no finding) when:
 * - there isn't enough history yet (sample_count < minSamples) — the
 *   documented cold-start withholding, not a bug;
 * - the baseline is degenerate (stddev ~0 — a perfectly flat signal so far,
 *   e.g. a device that has only ever reported one exact value) — scoring
 *   against a zero-width band would flag every subsequent reading, which is
 *   noise, not signal;
 * - the deviation doesn't clear the sigma threshold.
 */
export function scoreAnomaly(
  baseline: MetricBaseline,
  value: number,
  opts: { minSamples?: number; sigmaThreshold?: number } = {},
): AnomalyResult | null {
  const minSamples = opts.minSamples ?? MIN_SAMPLES_FOR_ANOMALY;
  const sigmaThreshold = opts.sigmaThreshold ?? DEFAULT_SIGMA_THRESHOLD;

  if (baseline.sample_count < minSamples) return null;
  if (baseline.trailing_stddev <= 1e-9) return null;

  const deviationSigma = (value - baseline.trailing_mean) / baseline.trailing_stddev;
  if (Math.abs(deviationSigma) < sigmaThreshold) return null;

  return {
    metric: baseline.metric,
    expected: [
      baseline.trailing_mean - sigmaThreshold * baseline.trailing_stddev,
      baseline.trailing_mean + sigmaThreshold * baseline.trailing_stddev,
    ],
    observed: value,
    deviationSigma,
    severity: ANOMALY_SEVERITY,
  };
}

/**
 * Formats an AnomalyResult into the human-readable message stored on the
 * resulting `alerts` row — mirrors rules.ts's Rule.message(value, threshold)
 * shape so anomaly alerts read consistently with threshold alerts in the
 * existing alert feed.
 */
export function formatAnomalyMessage(result: AnomalyResult): string {
  const direction = result.deviationSigma > 0 ? 'above' : 'below';
  return (
    `${result.metric} reading of ${result.observed.toFixed(2)} is ${Math.abs(result.deviationSigma).toFixed(1)}σ ` +
    `${direction} this device's own trailing average (expected roughly ${result.expected[0].toFixed(2)}–${result.expected[1].toFixed(2)}) — ` +
    `unusual for this specific unit, even though it may not cross a fixed threshold.`
  );
}
