import type { PoolClient } from 'pg';
import { getPool, withTenant } from '../shared/db';
import { findSilentHubs, formatHubSilenceMessage } from '../shared/hubs';

/**
 * Hub-silence sweep — flips an online Hub to `offline` when it stops
 * heart-beating (Domain Model §2.11: "silence detection generalizes to the
 * edge fleet"). Same two-phase isolation as the device silence sweep
 * (silence-detection-handler.ts): a narrowly-scoped system read to enumerate
 * tenant ids, then per-tenant fan-out through the UNMODIFIED withTenant(). One
 * bad tenant never aborts the sweep.
 *
 * A silent Hub means the site keeps running on the Hub's local copy while cloud
 * sync is paused — so this flips status for fleet visibility (the Hubs view /
 * hubHealthSummary); it does not raise a device-style alert (a Hub is edge
 * infrastructure, not a monitored asset — a hub-offline notification is a
 * reasonable follow-up, not built here). Self-correcting: recordHeartbeat()
 * flips it back to `online` on the Hub's next check-in.
 *
 * (Tenant-id enumeration mirrors silence-detection-handler.ts's private helper;
 * a later simplify pass can lift a single enumerateTenantIds() into shared/db.)
 */

export interface HubSilenceSweepResult {
  tenantsScanned: number;
  tenantsSkipped: number;
  hubsFlagged: number;
}

export async function runHubSilenceSweep(now: Date = new Date()): Promise<HubSilenceSweepResult> {
  const tenantIds = await enumerateTenantIds();

  let tenantsScanned = 0;
  let tenantsSkipped = 0;
  let hubsFlagged = 0;

  for (const tenantId of tenantIds) {
    try {
      hubsFlagged += await withTenant(tenantId, (client) => scanTenant(client, now));
      tenantsScanned++;
    } catch (err) {
      tenantsSkipped++;
      console.error(`Hub silence sweep: skipped tenant ${tenantId}`, err);
    }
  }

  return { tenantsScanned, tenantsSkipped, hubsFlagged };
}

async function enumerateTenantIds(): Promise<string[]> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.system_sweep_context = 'true'");
    const { rows } = await client.query<{ id: string }>('SELECT id FROM tenants');
    await client.query('COMMIT');
    return rows.map((r) => r.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function scanTenant(client: PoolClient, now: Date): Promise<number> {
  const { rows } = await client.query<{ id: string; status: string; last_seen_at: Date | null }>(
    `SELECT id, status, last_seen_at FROM hubs WHERE status = 'online'`,
  );

  const silent = findSilentHubs(
    rows.map((r) => ({ id: r.id, status: r.status, lastSeenAt: r.last_seen_at })),
    now,
  );
  if (silent.length === 0) return 0;

  for (const s of silent) {
    console.warn(`Hub ${s.id}: ${formatHubSilenceMessage(s)}`);
    await client.query(`UPDATE hubs SET status = 'offline', updated_at = now() WHERE id = $1`, [s.id]);
  }
  return silent.length;
}
