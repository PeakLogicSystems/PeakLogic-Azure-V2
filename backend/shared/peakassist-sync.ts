/**
 * PeakAssist Hub bundle-sync — the delta decision and integrity check, pure.
 *
 * PeakAssist Help System Architecture §5 (delivery). A Hub carries an offline
 * PeakAssist bundle and reports its `peakassist_content_version` on each
 * heartbeat (shared/hubs.ts). This module decides whether a Hub needs a newer
 * bundle, assembles the bundle a Hub downloads, and verifies a downloaded
 * bundle against its recorded checksum (PA-5). No I/O — see
 * peakassist-sync-handler.ts for the DB reads.
 */

import type { HelpContentItem } from './peakassist';
import { contentChecksum } from './peakassist-seed';

/**
 * Compare two content versions ('YYYY.MM.N', e.g. '2026.07.1'). Numeric,
 * component-wise; shorter versions are zero-padded ('2026.07' < '2026.07.1').
 * A non-numeric component is treated as 0, so a malformed version never sorts
 * ahead of a real one. Returns -1 / 0 / 1 (a<b / a==b / a>b).
 */
export function compareContentVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.');
  const pb = b.split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = Number.parseInt(pa[i] ?? '0', 10);
    const y = Number.parseInt(pb[i] ?? '0', 10);
    const xn = Number.isNaN(x) ? 0 : x;
    const yn = Number.isNaN(y) ? 0 : y;
    if (xn < yn) return -1;
    if (xn > yn) return 1;
  }
  return 0;
}

/**
 * Does a Hub need a newer bundle? True when it has never synced (null version)
 * or its version is older than the latest published one. An equal or (defensively)
 * newer version needs no update.
 */
export function needsBundleUpdate(hubVersion: string | null, latestVersion: string): boolean {
  if (!hubVersion) return true;
  return compareContentVersions(hubVersion, latestVersion) < 0;
}

export interface PeakAssistBundle {
  version: string;
  checksum: string;
  content: HelpContentItem[];
}

/** Assemble the bundle a Hub downloads for a version, stamping its checksum. */
export function buildBundle(content: HelpContentItem[], version: string): PeakAssistBundle {
  return { version, checksum: contentChecksum(content, version), content };
}

/**
 * Verify a downloaded/synced bundle: recompute the content checksum and compare
 * it to the bundle's stamped value (PA-5). A Hub rejects a bundle that fails
 * this — a truncated or corrupted sync must never replace good offline help.
 * Order- and id-independent (see contentChecksum), so it holds regardless of
 * how the content was serialized on the wire.
 */
export function verifyBundle(bundle: PeakAssistBundle): boolean {
  return contentChecksum(bundle.content, bundle.version) === bundle.checksum;
}

export interface HubSyncState {
  id: string;
  peakassistContentVersion: string | null;
}

export interface HubSyncPlan {
  hubId: string;
  from: string | null;
  to: string;
}

/**
 * Which Hubs are behind the latest bundle and should pull it. The fleet-side
 * view of "content current" (the Hubs console KPI) — a Hub that has never
 * synced or is on an older version appears here.
 */
export function planHubSync(hubs: HubSyncState[], latestVersion: string): HubSyncPlan[] {
  return hubs
    .filter((h) => needsBundleUpdate(h.peakassistContentVersion, latestVersion))
    .map((h) => ({ hubId: h.id, from: h.peakassistContentVersion, to: latestVersion }));
}
