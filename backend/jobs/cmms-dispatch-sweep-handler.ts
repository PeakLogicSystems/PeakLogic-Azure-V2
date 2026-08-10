import type { PoolClient } from 'pg';
import { getPool, withTenant } from '../shared/db';
import { claimDueOutboxRows, attemptOutboxDispatch } from '../shared/cmms/outbox';
import type { CmmsConnector } from '../shared/cmms/types';

/**
 * CMMS dispatch outbox sweep — the scheduled retry/delivery mechanism the
 * outbox depends on (backend/shared/cmms/outbox.ts's own header: "the
 * scheduled sweep... is the sole dispatch path"). Same two-phase isolation
 * shape as silence-detection-handler.ts / pm-generation-handler.ts:
 *
 * 1. A narrowly-scoped system read (app.system_sweep_context, existing
 *    migration 1784051700000) to enumerate tenant ids.
 * 2. A per-tenant fan-out using the EXISTING, unmodified withTenant() — the
 *    outbox rows themselves are tenant-scoped (cmms_dispatch_outbox's own
 *    tenant_isolation policy), so claiming due rows is fully RLS-scoped
 *    like any other tenant-scoped read.
 *
 * One real wrinkle a plain tenant sweep doesn't have: an outbox row's
 * connector is very often PARTNER-owned (channel_partner_id, not
 * tenant_id) — cmms_connectors' own partner-scope policy keys on
 * app.current_channel_partner_id, which withTenant() never sets. Reading
 * that connector needs the SAME system-context marker ingest's own
 * cross-tenant connector lookup already uses (cmms_connector_ingest_read,
 * app.ingest_context) — reused here rather than inventing a second marker
 * for the identical underlying need ("a trusted backend process reads a
 * connector regardless of its ownership shape").
 *
 * One tenant erroring must never abort the whole sweep — same resilience
 * principle as every other sweep in this codebase.
 */

export interface DispatchSweepResult {
  tenantsScanned: number;
  tenantsSkipped: number;
  rowsAttempted: number;
}

export async function runCmmsDispatchSweep(now: Date = new Date()): Promise<DispatchSweepResult> {
  const tenantIds = await enumerateTenantIds();

  let tenantsScanned = 0;
  let tenantsSkipped = 0;
  let rowsAttempted = 0;

  for (const tenantId of tenantIds) {
    try {
      rowsAttempted += await withTenant(tenantId, (client) => sweepTenant(client, now));
      tenantsScanned++;
    } catch (err) {
      tenantsSkipped++;
      console.error(`CMMS dispatch sweep: skipped tenant ${tenantId}`, err);
    }
  }

  return { tenantsScanned, tenantsSkipped, rowsAttempted };
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

interface ConnectorRow {
  id: string;
  vendor: CmmsConnector['vendor'];
  base_url: string | null;
  credential_ref: string | null;
  field_mapping: Record<string, unknown> | null;
  inbound_mode: CmmsConnector['inboundMode'];
}

async function sweepTenant(client: PoolClient, now: Date): Promise<number> {
  const dueRows = await claimDueOutboxRows(client, now);
  if (dueRows.length === 0) return 0;

  // See this file's header — a due row's connector may be partner-owned,
  // invisible under plain tenant context without this.
  await client.query("SELECT set_config('app.ingest_context', 'true', true)");

  const connectorIds = [...new Set(dueRows.map((r) => r.connectorId))];
  const { rows: connectorRows } = await client.query<ConnectorRow>(
    `SELECT id, vendor, base_url, credential_ref, field_mapping, inbound_mode
     FROM cmms_connectors WHERE id = ANY($1)`,
    [connectorIds],
  );
  const connectorsById = new Map<string, CmmsConnector>(
    connectorRows.map((r) => [
      r.id,
      {
        id: r.id,
        vendor: r.vendor,
        baseUrl: r.base_url,
        credentialRef: r.credential_ref,
        fieldMapping: r.field_mapping ?? {},
        inboundMode: r.inbound_mode,
      },
    ]),
  );

  let attempted = 0;
  for (const row of dueRows) {
    const connector = connectorsById.get(row.connectorId);
    if (!connector) {
      // A due row whose connector was deleted/disabled since it was
      // enqueued — log and move on rather than retrying forever against a
      // connector that no longer resolves.
      console.error(`CMMS dispatch sweep: outbox row ${row.id} references missing connector ${row.connectorId}`);
      continue;
    }
    await attemptOutboxDispatch(client, row, connector);
    attempted++;
  }
  return attempted;
}
