import type { Pool } from 'pg';
import { getPool } from '../shared/db';
import { getAdapter } from '../shared/cmms/adapters';
import { resolveConnectorSecret } from '../shared/cmms/credentials';
import type { CmmsConnector } from '../shared/cmms/types';

/**
 * CMMS account-data sync — "receive data from these systems... customer
 * accounts, proposals, and billings" (2026-08-09). Pulls whatever a
 * connector's adapter can read (ServiceTitan: CRM/Sales/Accounting
 * Customers/Locations/Estimates/Invoices) into cmms_account_records.
 *
 * Not a tenant sweep — a connector-scoped sync, with no natural per-tenant
 * iteration boundary the way the dispatch sweep has (a partner-owned
 * connector's synced records aren't mapped to any one PeakLogic tenant
 * until an admin confirms the match). Runs entirely under
 * app.cmms_sync_context (migration 1784300180000) rather than
 * withTenant() — the correct isolation shape for this job's actual data
 * boundary (per-connector, not per-tenant), not a workaround.
 *
 * tenant_id is never overwritten on an existing cmms_account_records row —
 * once an admin has mapped a record to a tenant, a resync must not clobber
 * that mapping (see the upsert's ON CONFLICT clause).
 */

export interface AccountSyncResult {
  connectorsScanned: number;
  connectorsSkipped: number;
  recordsUpserted: number;
}

interface ConnectorRow {
  id: string;
  vendor: CmmsConnector['vendor'];
  base_url: string | null;
  credential_ref: string | null;
  field_mapping: Record<string, unknown> | null;
  inbound_mode: CmmsConnector['inboundMode'];
}

export async function runCmmsAccountSync(): Promise<AccountSyncResult> {
  const pool = await getPool();
  const connectors = await enumerateEnabledConnectors(pool);

  let connectorsScanned = 0;
  let connectorsSkipped = 0;
  let recordsUpserted = 0;

  for (const row of connectors) {
    try {
      recordsUpserted += await syncConnector(pool, row);
      connectorsScanned++;
    } catch (err) {
      connectorsSkipped++;
      console.error(`CMMS account sync: skipped connector ${row.id}`, err);
    }
  }

  return { connectorsScanned, connectorsSkipped, recordsUpserted };
}

async function enumerateEnabledConnectors(pool: Pool): Promise<ConnectorRow[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.cmms_sync_context = 'true'");
    const { rows } = await client.query<ConnectorRow>(
      `SELECT id, vendor, base_url, credential_ref, field_mapping, inbound_mode
       FROM cmms_connectors WHERE enabled = true`,
    );
    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function syncConnector(pool: Pool, row: ConnectorRow): Promise<number> {
  const adapter = getAdapter(row.vendor);
  if (!adapter?.syncAccountData) return 0; // this vendor has no readable account API (or none built yet)

  const connector: CmmsConnector = {
    id: row.id,
    vendor: row.vendor,
    baseUrl: row.base_url,
    credentialRef: row.credential_ref,
    fieldMapping: row.field_mapping ?? {},
    inboundMode: row.inbound_mode,
  };
  const secret = connector.credentialRef ? await resolveConnectorSecret(connector.credentialRef) : null;
  const records = await adapter.syncAccountData(connector, secret);
  if (records.length === 0) return 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.cmms_sync_context = 'true'");
    for (const rec of records) {
      await client.query(
        `INSERT INTO cmms_account_records (connector_id, record_type, external_id, data, synced_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (connector_id, record_type, external_id)
         DO UPDATE SET data = EXCLUDED.data, synced_at = now()`,
        [connector.id, rec.recordType, rec.externalId, JSON.stringify(rec.data)],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return records.length;
}
