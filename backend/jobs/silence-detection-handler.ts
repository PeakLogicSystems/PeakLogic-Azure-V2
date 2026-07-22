import type { PoolClient } from 'pg';
import { getPool, withTenant } from '../shared/db';
import { findSilentDevices, formatSilenceMessage } from './silence-detection';
import { createAlertAndMaybeTicket } from '../shared/alerts';
import type { Device, AssetSpecs } from '../shared/types';

/**
 * Device-silence detection orchestrator (Enterprise Audit 2026-07-19 §3, P0
 * finding). Runs as a scheduled sweep (Timer-triggered, see
 * silence-detection.main.ts) — NOT in response to a request or a device
 * event, so it can't reuse withTenant()'s single-tenant-id entry point
 * directly. Two phases, matching the isolation rule this whole project
 * enforces ("N per-org scoped reads, never one cross-tenant query" — Target
 * Reference Architecture):
 *
 * 1. A narrowly-scoped system read (app.system_sweep_context, migration
 *    1784051700000) to enumerate tenant ids — the ONE step that needs
 *    cross-tenant visibility, and it only ever reads `id`.
 * 2. A per-tenant fan-out using the EXISTING, unmodified withTenant() — the
 *    real work (find silent devices, create alerts) is fully RLS-scoped,
 *    identical to any other tenant-scoped operation in this codebase.
 *
 * One tenant erroring (suspended, deleted mid-sweep, a transient DB issue)
 * must never abort the whole sweep — caught and logged per tenant, same
 * resilience principle as ingest/main.ts's per-message try/catch.
 */

interface SilenceDeviceRow {
  id: string;
  tenant_id: string;
  asset_id: string | null;
  serial: string;
  thing_name: string;
  firmware_version: string | null;
  status: Device['status'];
  last_seen_at: Date | null;
  provisioned_at: Date | null;
  created_at: Date;
  updated_at: Date;
  category: string | null;
  specs: AssetSpecs | null;
}

export interface SilenceSweepResult {
  tenantsScanned: number;
  tenantsSkipped: number;
  devicesFlagged: number;
}

export async function runSilenceSweep(now: Date = new Date()): Promise<SilenceSweepResult> {
  const tenantIds = await enumerateTenantIds();

  let tenantsScanned = 0;
  let tenantsSkipped = 0;
  let devicesFlagged = 0;

  for (const tenantId of tenantIds) {
    try {
      devicesFlagged += await withTenant(tenantId, (client) => scanTenant(client, now));
      tenantsScanned++;
    } catch (err) {
      // Most common real cause: the tenant is suspended (withTenant() itself
      // throws for that — Multi-Tenant Architecture §3.3, unchanged
      // behavior). A suspended tenant's devices legitimately don't need
      // silence alerts. Any other error is logged and the sweep continues —
      // one bad tenant must never block every other tenant's check.
      tenantsSkipped++;
      console.error(`Silence sweep: skipped tenant ${tenantId}`, err);
    }
  }

  return { tenantsScanned, tenantsSkipped, devicesFlagged };
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

// A distinct, non-telemetry metric key for dedup purposes (createAlertAndMaybeTicket
// dedupes on context->>'metric') — never collides with a real device metric name.
const SILENCE_METRIC_KEY = 'device_silence';

async function scanTenant(client: PoolClient, now: Date): Promise<number> {
  const { rows } = await client.query<SilenceDeviceRow>(
    `SELECT d.*, a.category, a.specs
     FROM devices d
     LEFT JOIN assets a ON a.id = d.asset_id
     WHERE d.status != 'decommissioned'`,
  );

  const silent = findSilentDevices(
    rows.map((r) => ({ deviceId: r.id, category: r.category, lastSeenAt: r.last_seen_at, status: r.status })),
    now,
  );
  if (silent.length === 0) return 0;

  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const result of silent) {
    const row = byId.get(result.deviceId)!;
    const device: Device & { category: string; specs: AssetSpecs | null } = {
      id: row.id,
      tenant_id: row.tenant_id,
      asset_id: row.asset_id,
      serial: row.serial,
      thing_name: row.thing_name,
      firmware_version: row.firmware_version,
      status: row.status,
      last_seen_at: row.last_seen_at,
      provisioned_at: row.provisioned_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      category: row.category!, // findSilentDevices already filtered out null categories
      specs: row.specs,
    };

    await createAlertAndMaybeTicket(client, device, {
      // 'warning', not 'critical', for the same reason anomaly.ts caps Tier
      // 1 AI findings at warning: this is a new, unproven-in-production
      // detection path. Unlike an AI model's statistical uncertainty,
      // "no telemetry received" is a deterministic signal — escalating
      // specific safety-critical categories (leak_sensor, gas_sensor) to
      // 'critical' once real operational data justifies it is a reasonable,
      // named follow-up, not done speculatively here.
      type: 'device_silent',
      severity: 'warning',
      metric: SILENCE_METRIC_KEY,
      message: formatSilenceMessage(result),
      context: {
        metric: SILENCE_METRIC_KEY,
        category: result.category,
        silent_for_seconds: Math.round(result.silentForSeconds),
        expected_interval_s: result.expectedIntervalS,
      },
      time: now,
    });

    // Reflects reality in devices.status, which the 'offline' enum value has
    // always allowed but nothing has ever actually set (verified by grep
    // before writing this) — the ingest handler already flips it back to
    // 'online' on the device's next real heartbeat, so this is naturally
    // self-correcting once the device reports again.
    if (row.status !== 'offline') {
      await client.query(`UPDATE devices SET status = 'offline', updated_at = now() WHERE id = $1`, [row.id]);
    }
  }

  return silent.length;
}
