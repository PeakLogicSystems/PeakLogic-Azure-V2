import type { PoolClient } from 'pg';
import { getPool, withTenant } from '../shared/db';
import { resolveConnector } from '../shared/cmms/dispatch';
import { getAdapter } from '../shared/cmms/adapters';
import { buildBillingRecord, dispatchBillingRecord } from '../shared/cmms/billing';

/**
 * Monthly CMMS billing export sweep (cmms-billing-export.main.ts). Same
 * two-phase tenant-sweep shape as every other scheduled job in this
 * codebase; the one wrinkle it shares with cmms-dispatch-sweep-handler.ts
 * is the same one — a tenant's connector is commonly partner-owned, so
 * reading it needs app.ingest_context set, not just app.current_tenant_id.
 *
 * A tenant with no completed service visits in the period is silently
 * skipped, not sent an empty billing record — never fabricate a record for
 * a period with nothing to bill (this codebase's "never fabricate, missing
 * data is a gap, not interpolated" discipline, applied here to invoicing
 * instead of telemetry).
 */

export interface BillingExportResult {
  tenantsScanned: number;
  tenantsSkipped: number;
  recordsQueued: number;
}

export async function runCmmsBillingExport(periodStart: Date, periodEnd: Date): Promise<BillingExportResult> {
  const tenantIds = await enumerateTenantIds();

  let tenantsScanned = 0;
  let tenantsSkipped = 0;
  let recordsQueued = 0;

  for (const tenantId of tenantIds) {
    try {
      const queued = await withTenant(tenantId, (client) => exportForTenant(client, tenantId, periodStart, periodEnd));
      if (queued) recordsQueued++;
      tenantsScanned++;
    } catch (err) {
      tenantsSkipped++;
      console.error(`CMMS billing export: skipped tenant ${tenantId}`, err);
    }
  }

  return { tenantsScanned, tenantsSkipped, recordsQueued };
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

async function exportForTenant(client: PoolClient, tenantId: string, periodStart: Date, periodEnd: Date): Promise<boolean> {
  // See cmms-dispatch-sweep-handler.ts's header for why this is needed —
  // the connector this tenant is attributed to is very often partner-owned.
  await client.query("SELECT set_config('app.ingest_context', 'true', true)");

  const { connector, channelPartnerId } = await resolveConnector(client, tenantId);
  if (!connector || !connector.id || !channelPartnerId) return false; // no persisted connector, or no partner attribution — nothing to export to

  const adapter = getAdapter(connector.vendor);
  if (!adapter?.sendBilling) return false; // this vendor doesn't support a billing export (e.g. generic_webhook)

  const { rows: [tenant] } = await client.query<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [tenantId]);
  if (!tenant) return false;

  const { rows: visits } = await client.query<{ ticket_id: string; completed_at: Date | null }>(
    `SELECT ticket_id, completed_at FROM service_visits
     WHERE tenant_id = $1 AND completed_at >= $2 AND completed_at < $3`,
    [tenantId, periodStart, periodEnd],
  );
  if (visits.length === 0) return false; // nothing billable this period

  const record = buildBillingRecord({
    tenantId,
    tenantName: tenant.name,
    channelPartnerId,
    periodStart,
    periodEnd,
    visits: visits.map((v) => ({ ticketId: v.ticket_id, completedAt: v.completed_at })),
  });

  await dispatchBillingRecord(client, record, connector.id);
  return true;
}
