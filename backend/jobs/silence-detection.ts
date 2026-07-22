/**
 * Device-silence detection — Enterprise Audit (2026-07-19) §3, P0 finding:
 * "no code path turns absence of telemetry into an alert... a dead freezer
 * sensor is indistinguishable from a healthy freezer." Closes that gap.
 *
 * Pure — no I/O (mirrors backend/ingest/rules.ts's own split: threshold
 * math stays testable in isolation from DB/RLS plumbing). See
 * silence-detection-handler.ts for the tenant-scoped orchestration that
 * calls this.
 */

// Placeholder engineering defaults — NOT sourced from real device datasheets
// (nothing has ever deployed; no real hardware has ever reported telemetry
// on a live schedule to measure against). Revisit once a real per-device-
// model provisioning runbook exists (device-onboarding artifact #27 §7's
// "no per-model runbook catalog" gap) or real fleet data is available.
// Seconds, not minutes, to match metric_baselines'/telemetry's own TIMESTAMPTZ
// granularity.
export const DEFAULT_REPORTING_INTERVAL_S: Record<string, number> = {
  pump: 300,
  hvac: 300,
  pool_system: 600,
  pool_chemistry: 900,
  gas_sensor: 120, // safety-critical, no warning tier on its real threshold either (rules.ts) — reports frequently
  refrigeration: 300,
  leak_sensor: 120, // safety-critical, same reasoning as gas_sensor
  energy_meter: 900,
};

// A device flagged silent immediately at 1x its expected interval would be
// noisy (ordinary network jitter, a retried publish, brief connectivity
// blips) — this grace multiplier means a device is only flagged after
// missing several expected reports in a row, not one.
export const DEFAULT_GRACE_MULTIPLIER = 3;

export interface DeviceLastSeen {
  deviceId: string;
  category: string | null; // null when the device has no linked asset — same "can't resolve, so skip" precedent as evaluateRules' unknown-category handling
  lastSeenAt: Date | null; // null when the device has never reported at all — a DIFFERENT gap (never onboarded correctly) than "was working, now silent"; deliberately out of scope here, see module doc
  status: string;
}

export interface SilentDeviceResult {
  deviceId: string;
  category: string;
  silentForSeconds: number;
  expectedIntervalS: number;
}

/**
 * Which of these devices should be flagged silent right now.
 *
 * Skipped, not flagged (each for a specific, disclosed reason — never
 * silently swallowed):
 * - `status IN ('decommissioned', 'provisioning')` — a decommissioned
 *   device is expected to be silent forever; a still-provisioning device
 *   was never expected to report yet.
 * - `lastSeenAt === null` — has never reported even once. That's an
 *   onboarding/connectivity gap, a different failure mode than "was alive,
 *   went dark," and out of scope for this pass (see module doc).
 * - `category` unknown or not in `intervals` — cannot determine an expected
 *   interval to compare against; matches `evaluateRuleSet`'s existing
 *   "skip what we can't evaluate" precedent rather than inventing a
 *   fallback interval.
 */
export function findSilentDevices(
  devices: DeviceLastSeen[],
  now: Date,
  opts: { intervals?: Record<string, number>; graceMultiplier?: number } = {},
): SilentDeviceResult[] {
  const intervals = opts.intervals ?? DEFAULT_REPORTING_INTERVAL_S;
  const graceMultiplier = opts.graceMultiplier ?? DEFAULT_GRACE_MULTIPLIER;
  const results: SilentDeviceResult[] = [];

  for (const d of devices) {
    if (d.status === 'decommissioned' || d.status === 'provisioning') continue;
    if (d.lastSeenAt === null) continue;
    if (!d.category) continue;

    const expectedIntervalS = intervals[d.category];
    if (expectedIntervalS === undefined) continue;

    const silentForSeconds = (now.getTime() - d.lastSeenAt.getTime()) / 1000;
    if (silentForSeconds >= expectedIntervalS * graceMultiplier) {
      results.push({ deviceId: d.deviceId, category: d.category, silentForSeconds, expectedIntervalS });
    }
  }

  return results;
}

/**
 * The human-readable message stored on the resulting `alerts` row — mirrors
 * rules.ts's Rule.message(value, threshold) shape and anomaly.ts's
 * formatAnomalyMessage, so every alert type reads consistently.
 */
export function formatSilenceMessage(result: SilentDeviceResult): string {
  const minutes = Math.round(result.silentForSeconds / 60);
  const expectedMinutes = Math.round(result.expectedIntervalS / 60);
  return (
    `No telemetry received for ${minutes} min (expected every ~${expectedMinutes} min) — ` +
    `this device may be offline, disconnected, or has physically failed.`
  );
}
