/**
 * PeakLogic Hub fleet — registration, heartbeat, and silence, pure.
 *
 * Domain Model §2.11 (`hubs`, migration 1784142000000) + PRD §5.19 / SRS §3.21.
 * A Hub is the on-prem edge unit bound to one Site. This module is the pure
 * logic behind three operations — building a registration, applying a
 * heartbeat, and detecting a Hub that has gone silent — with no I/O. See
 * hubs-handler.ts (request-scoped register/heartbeat) and
 * jobs/hub-silence-handler.ts (the scheduled sweep) for the DB wiring.
 *
 * A Hub reports online/offline the same way a device does (Domain Model §2.11),
 * so silence detection generalizes to the edge fleet — the same discipline as
 * jobs/silence-detection.ts, at the Hub grain.
 */

export type HubStatus = 'online' | 'offline' | 'provisioning';

/**
 * Expected heartbeat cadence. A placeholder engineering default (nothing has
 * ever deployed a real Hub to measure against), Revisit once a real Hub agent
 * reports on a known interval. Seconds, to match TIMESTAMPTZ granularity.
 */
export const HUB_HEARTBEAT_INTERVAL_S = 60;

/** A Hub is only flagged silent after missing several heartbeats — absorbs ordinary jitter, same as device silence. */
export const HUB_GRACE_MULTIPLIER = 3;

// ── Registration ───────────────────────────────────────────────────────────

export interface HubRegistrationInput {
  siteId: string;
  name: string;
  hardwareSerial?: string | null;
  agentVersion?: string | null;
  protocolConfig?: Record<string, unknown>;
}

export interface HubRegistration {
  siteId: string;
  name: string;
  hardwareSerial: string | null;
  agentVersion: string | null;
  status: 'provisioning'; // a freshly-registered Hub starts provisioning; its first heartbeat flips it online
  protocolConfig: Record<string, unknown>;
}

/**
 * Validate + normalize a Hub registration. A new Hub starts `provisioning`
 * (matching the schema default and the console) — it is not "online" until it
 * actually checks in (`applyHeartbeat`). Rejects a missing name or site rather
 * than writing a half-formed row.
 */
export function buildHubRegistration(input: HubRegistrationInput): HubRegistration {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('hub registration requires a name');
  if (!input.siteId) throw new Error('hub registration requires a siteId');
  return {
    siteId: input.siteId,
    name,
    hardwareSerial: input.hardwareSerial ?? null,
    agentVersion: input.agentVersion ?? null,
    status: 'provisioning',
    protocolConfig: input.protocolConfig ?? {},
  };
}

// ── Heartbeat ──────────────────────────────────────────────────────────────

export interface HubHeartbeatReport {
  at: Date;
  agentVersion?: string | null;
  peakassistContentVersion?: string | null;
}

export interface HubHeartbeatUpdate {
  status: 'online';
  lastSeenAt: Date;
  /** null means "not reported this heartbeat" — the handler keeps the existing value (COALESCE), never nulls it. */
  agentVersion: string | null;
  peakassistContentVersion: string | null;
}

/**
 * Normalize a heartbeat into the fields to write. A heartbeat always means the
 * Hub is `online` right now and sets `last_seen_at`; agent/PeakAssist-content
 * versions are updated only when the report carries them (the handler COALESCEs
 * a null to keep the current value).
 */
export function applyHeartbeat(report: HubHeartbeatReport): HubHeartbeatUpdate {
  return {
    status: 'online',
    lastSeenAt: report.at,
    agentVersion: report.agentVersion ?? null,
    peakassistContentVersion: report.peakassistContentVersion ?? null,
  };
}

// ── Silence detection ──────────────────────────────────────────────────────

export interface HubHeartbeatState {
  id: string;
  status: string;
  lastSeenAt: Date | null;
}

export interface SilentHubResult {
  id: string;
  silentForSeconds: number;
  expectedIntervalS: number;
}

/**
 * Which online Hubs have gone silent and should be flipped to `offline`.
 *
 * Skipped, not flagged (each disclosed, never silently swallowed):
 *  - status not `online` — a `provisioning` Hub was never expected to report
 *    yet, and an `offline` one is already flagged;
 *  - `lastSeenAt === null` — has never checked in at all (an onboarding/
 *    connectivity gap, a different failure mode than "was alive, went dark"),
 *    out of scope here — same precedent as device silence.
 */
export function findSilentHubs(
  hubs: HubHeartbeatState[],
  now: Date,
  opts: { intervalS?: number; graceMultiplier?: number } = {},
): SilentHubResult[] {
  const intervalS = opts.intervalS ?? HUB_HEARTBEAT_INTERVAL_S;
  const graceMultiplier = opts.graceMultiplier ?? HUB_GRACE_MULTIPLIER;
  const results: SilentHubResult[] = [];

  for (const h of hubs) {
    if (h.status !== 'online') continue;
    if (h.lastSeenAt === null) continue;
    const silentForSeconds = (now.getTime() - h.lastSeenAt.getTime()) / 1000;
    if (silentForSeconds >= intervalS * graceMultiplier) {
      results.push({ id: h.id, silentForSeconds, expectedIntervalS: intervalS });
    }
  }
  return results;
}

/** Human-readable note for logs/audit when a Hub is flipped offline. */
export function formatHubSilenceMessage(result: SilentHubResult): string {
  const minutes = Math.round(result.silentForSeconds / 60);
  const expectedMinutes = Math.max(1, Math.round(result.expectedIntervalS / 60));
  return (
    `Hub has not checked in for ${minutes} min (expected every ~${expectedMinutes} min) — ` +
    `the site keeps running on the Hub's local copy; cloud sync is paused until it reconnects.`
  );
}

// ── Fleet summary ──────────────────────────────────────────────────────────

export interface HubHealthSummary {
  total: number;
  online: number;
  offline: number;
  provisioning: number;
}

/** Roll a set of Hubs into online/offline/provisioning counts (a fleet KPI). */
export function hubHealthSummary(hubs: { status: string }[]): HubHealthSummary {
  const summary: HubHealthSummary = { total: hubs.length, online: 0, offline: 0, provisioning: 0 };
  for (const h of hubs) {
    if (h.status === 'online') summary.online++;
    else if (h.status === 'offline') summary.offline++;
    else if (h.status === 'provisioning') summary.provisioning++;
  }
  return summary;
}
