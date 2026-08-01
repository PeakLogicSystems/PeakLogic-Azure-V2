/**
 * Hub agent-version integrity check — pure. Water-Sector Security Hardening
 * Strategy §5 Tier 2 item 1: repurposes the exact drift vocabulary the
 * on-device closed-loop reconciler already established
 * (windows-hub/src/PeakLogicEdge.Core/DesiredState/DesiredStateReconciler.cs's
 * `DriftStatus.Unexpected` — "reported a component that is NOT in the
 * desired set at all") as a cloud-side tamper-detection signal, at near-zero
 * incremental cost: the infrastructure (Hub heartbeat, the alert pipeline)
 * already exists for fleet-health reasons; this adds one new check on data
 * already flowing through it.
 *
 * SCOPE, DELIBERATELY NARROWER THAN THE FULL RECONCILER: the .NET reconciler
 * diffs a whole Release-Channel bundle (firmware/driver/app/config/security/
 * etc.) against a per-device desired state delivered via IoT Hub twins —
 * that whole delivery mechanism is infra-gated (no Azure IoT Hub exists;
 * Platform Control Center's cloud side needs it, per platform-control-
 * center-architecture.md D1/D2). What IS real and callable today is the
 * plain HTTP Hub heartbeat (hubs.ts/hubs-handler.ts, no Azure IoT Hub
 * needed) reporting `agentVersion`. This module answers one narrower, but
 * genuinely real, question with that one field: does this Hub claim to run
 * a version PeakLogic ever actually published? A version string outside the
 * known-published set is the same "Unexpected" concept, applied to the one
 * component this transport can see — not full config/firmware/security-
 * policy drift, which needs the Release-Channel/twin work to exist first.
 *
 * Direct relevance to the triggering incident: the 2026-07-26/27
 * water-sector attacks' playbook included attackers modifying software on
 * compromised OT devices. A Hub whose agent has been replaced or tampered
 * with is exactly the scenario this check is built to catch — cheaply,
 * against data already being reported.
 */

/**
 * Known-published PeakLogicEdge agent versions — the GitHub Release tags
 * `windows-hub/README.md` already documents as the real (if interim, non-
 * MSIX) distribution mechanism (`edge-v0.1.0`, `edge-v0.1.1`). DISCLOSED
 * PLACEHOLDER, same honesty as every other engineering-estimate constant in
 * this codebase (HUB_HEARTBEAT_INTERVAL_S, DEFAULT_REPORTING_INTERVAL_S):
 * the exact string format a running agent self-reports as `agentVersion`
 * has never been verified against a real release build in this environment
 * (no .NET build/run here) — confirm it matches this list's format (with or
 * without the `edge-v` prefix) before relying on this in production, and
 * keep this list current at each new edge-vX.Y.Z release the same way the
 * SysAdmin Guide's release process already requires for the platform's own
 * version.
 */
export const KNOWN_HUB_AGENT_VERSIONS: readonly string[] = ['edge-v0.1.0', 'edge-v0.1.1'];

export type HubAgentIntegrityStatus =
  | 'in_sync'      // reported version is in the known-published set
  | 'unreported'   // no agentVersion reported yet (nothing to check — a new/never-checked-in Hub, not tamper)
  | 'unexpected';  // reported a version PeakLogic never published — the DriftStatus.Unexpected equivalent

export interface HubAgentIntegrityResult {
  status: HubAgentIntegrityStatus;
  reportedVersion: string | null;
}

/**
 * Case-sensitive by design — a version string is an exact identifier, not
 * free text to normalize (same reasoning DottedVersion.Compare's callers
 * apply to real version comparisons elsewhere in this codebase).
 */
export function checkHubAgentIntegrity(
  reportedVersion: string | null | undefined,
  knownVersions: readonly string[] = KNOWN_HUB_AGENT_VERSIONS,
): HubAgentIntegrityResult {
  if (!reportedVersion) {
    return { status: 'unreported', reportedVersion: null };
  }
  const status: HubAgentIntegrityStatus = knownVersions.includes(reportedVersion) ? 'in_sync' : 'unexpected';
  return { status, reportedVersion };
}
