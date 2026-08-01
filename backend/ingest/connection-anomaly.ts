import type { AnomalyResult } from './anomaly';

/**
 * Water-Sector Security Hardening Strategy §5 Tier 2 item 2 — "fleet/
 * connection-behavior anomalies," the second, complementary half of Tier 2
 * item 1's Hub-agent-integrity check. That one asks "is this Hub running
 * software we recognize"; this one asks "is this device connecting the way
 * it normally does" — a genuine gap named in the original audit pass
 * ("the anomaly layer is purely telemetry-value statistics, not network/
 * security telemetry").
 *
 * DELIBERATELY REUSES baseline.ts/anomaly.ts UNCHANGED, not a parallel
 * statistics implementation: `metric_baselines` is already keyed generically
 * on (device_id, metric) — nothing about updateBaseline()/scoreAnomaly()
 * assumes "metric" means a real telemetry reading. Treating the interval
 * BETWEEN a device's readings as one more "metric" (this file's whole job is
 * computing that one pure value) gets the exact same EWMA baseline, cold-
 * start withholding, and 3-sigma scoring for free — no new table, no new
 * statistical code, "near-zero incremental cost" in the same sense Tier 2
 * item 1 was.
 *
 * Real-world relevance: an unusually SHORT interval (reporting far more
 * often than normal) is a beaconing/flooding/replay-style signal — a
 * device pattern this incident's own playbook doesn't literally include,
 * but the general "something is connecting differently than the real
 * device does" class of signal is exactly what host/network intrusion
 * detection uses connection-timing analysis for. An unusually LONG interval
 * that hasn't yet crossed the full silence threshold (jobs/silence-
 * detection.ts) is a softer, earlier warning of the same failure mode that
 * detector only catches once it's total.
 */

export const CONNECTION_INTERVAL_METRIC = '__connection_interval_s';

/**
 * Pure. Returns null (nothing to score) when there is no prior reading to
 * compare against (a device's first-ever reading) or when the computed
 * interval isn't a genuine forward-moving gap (zero or negative — an
 * out-of-order or clock-skewed delivery; scoring a bogus negative interval
 * into the baseline would corrupt it for every real reading after).
 */
export function computeConnectionIntervalSeconds(previousLastSeenAt: Date | null, now: Date): number | null {
  if (!previousLastSeenAt) return null;
  const seconds = (now.getTime() - previousLastSeenAt.getTime()) / 1000;
  if (seconds <= 0) return null;
  return seconds;
}

/**
 * Connection-cadence-specific phrasing — formatAnomalyMessage()'s generic
 * "reading of X is Nσ above/below trailing average" wording is technically
 * correct but doesn't convey what a compressed-vs-stretched INTERVAL
 * actually means operationally, unlike a real metric reading. Direction is
 * inverted from a normal metric: a NEGATIVE deviationSigma here means the
 * interval was shorter than usual, i.e. the device connected MORE often.
 */
export function formatConnectionAnomalyMessage(result: AnomalyResult): string {
  const observedMinutes = (result.observed / 60).toFixed(1);
  const expectedLowMinutes = (result.expected[0] / 60).toFixed(1);
  const expectedHighMinutes = (result.expected[1] / 60).toFixed(1);

  if (result.deviationSigma < 0) {
    return (
      `Device connected after only ${observedMinutes} min (usually ${expectedLowMinutes}–${expectedHighMinutes} min) — ` +
      `reporting significantly more often than its own established pattern. Possible causes: a misconfiguration, ` +
      `a replayed/duplicated device identity, or a compromised device beaconing.`
    );
  }
  return (
    `Device took ${observedMinutes} min to report again (usually ${expectedLowMinutes}–${expectedHighMinutes} min) — ` +
    `reporting significantly less often than its own established pattern, though not yet silent. An early sign of ` +
    `degraded connectivity or tampering, worth watching before it escalates to a full silence alert.`
  );
}
