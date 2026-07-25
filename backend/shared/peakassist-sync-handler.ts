import type { PoolClient } from 'pg';
import { buildBundle, needsBundleUpdate, type PeakAssistBundle } from './peakassist-sync';
import type { HelpContentItem, HelpType } from './peakassist';

type Queryable = Pick<PoolClient, 'query'>;

// help_content / help_content_bundles are GLOBAL reference tables (non-RLS,
// PeakLogic-authored), so these reads need no tenant context.

/** The latest published bundle, or null if none has been seeded. */
export async function latestBundle(client: Queryable): Promise<{ version: string; checksum: string } | null> {
  const { rows } = await client.query<{ version: string; checksum: string }>(
    `SELECT version, checksum FROM help_content_bundles ORDER BY published_at DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

/**
 * The bundle a Hub downloads for a version: read the global help_content, build
 * the bundle, and cross-check its computed checksum against the recorded bundle
 * checksum. They must match; if not, the catalog and the bundle row are out of
 * sync (a broken seed) and `matchesRecorded` is false so the caller can refuse
 * to serve it rather than ship a Hub content that fails its own integrity check.
 */
export async function bundleForVersion(
  client: Queryable,
  version: string,
): Promise<{ bundle: PeakAssistBundle; matchesRecorded: boolean } | null> {
  const bundleRow = await client.query<{ checksum: string }>(
    `SELECT checksum FROM help_content_bundles WHERE version = $1`,
    [version],
  );
  if (bundleRow.rows.length === 0) return null;

  const { rows } = await client.query<{
    help_context_key: string;
    type: string;
    title: string;
    body: string;
    alarm_type: string | null;
  }>(
    `SELECT help_context_key, type, title, body, alarm_type FROM help_content WHERE content_version = $1`,
    [version],
  );
  const content: HelpContentItem[] = rows.map((r, i) => ({
    id: `${version}#${i}`, // a stable-enough local id; the checksum is id-independent
    helpContextKey: r.help_context_key,
    type: r.type as HelpType,
    title: r.title,
    body: r.body,
    alarmType: r.alarm_type,
  }));

  const bundle = buildBundle(content, version);
  return { bundle, matchesRecorded: bundle.checksum === bundleRow.rows[0].checksum };
}

export interface HubSyncResponse {
  upToDate: boolean;
  latestVersion: string | null;
  bundle: PeakAssistBundle | null; // present only when the Hub is behind
}

/**
 * The full sync decision for one Hub: given the version it reported (via its
 * heartbeat), decide whether it's current and, if not, return the latest
 * bundle to install. The endpoint a Hub polls.
 */
export async function syncForHub(client: Queryable, hubVersion: string | null): Promise<HubSyncResponse> {
  const latest = await latestBundle(client);
  if (!latest) return { upToDate: true, latestVersion: null, bundle: null };
  if (!needsBundleUpdate(hubVersion, latest.version)) {
    return { upToDate: true, latestVersion: latest.version, bundle: null };
  }
  const result = await bundleForVersion(client, latest.version);
  return { upToDate: false, latestVersion: latest.version, bundle: result?.bundle ?? null };
}
