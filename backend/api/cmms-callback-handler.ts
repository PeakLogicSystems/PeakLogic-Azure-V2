import type { Pool, PoolClient } from 'pg';
import { getAdapter } from '../shared/cmms/adapters';
import { resolveConnectorSecret } from '../shared/cmms/credentials';
import { advanceWorkOrderStage } from '../shared/cmms/work-order-lifecycle-handler';
import type { CmmsConnector } from '../shared/cmms/types';

/**
 * Inbound CMMS webhook — "receive data from these systems" (2026-08-09),
 * the work-order-status half specifically (reporting-and-kpi-design.md
 * §2.3, §5's designed `POST /v1/cmms/callback/{connectorId}` surface,
 * built here). Runs OUTSIDE any authenticated session (the caller is a
 * CMMS vendor's server, not a logged-in PeakLogic user) — its own
 * signature verification IS the authentication, same posture as
 * ops/cost-killswitch's shared-secret auth.
 *
 * Deliberately connector-scoped, not tenant-scoped: this handler knows
 * only (connectorId, the vendor's own work-order id), not which PeakLogic
 * tenant that work order belongs to. Two narrow system-context reads
 * (cmms_connector's app.ingest_context — reused from ingest's own
 * cross-tenant connector lookup, same underlying need; service_tickets'
 * app.cmms_callback_context, migration 1784300180000) resolve that, then
 * the actual write switches into real tenant-scoped RLS via
 * advanceWorkOrderStage() — unchanged, already tenant-scoped and tested.
 *
 * Every branch commits (never leaves a transaction open) even on a
 * rejected/unrecognized request — this endpoint must never become a way
 * to hold a DB connection open by sending it garbage.
 */

export type CmmsCallbackStatus =
  | 'advanced'
  | 'noop'
  | 'unauthorized'
  | 'unknown_connector'
  | 'unknown_ticket'
  | 'unrecognized_event';

export interface CmmsCallbackResult {
  status: CmmsCallbackStatus;
  detail?: string;
}

interface ConnectorRow {
  id: string;
  vendor: CmmsConnector['vendor'];
  base_url: string | null;
  credential_ref: string | null;
  field_mapping: Record<string, unknown> | null;
  inbound_mode: CmmsConnector['inboundMode'];
}

export async function handleCmmsCallback(
  pool: Pick<Pool, 'connect'>,
  connectorId: string,
  rawBody: string,
  headers: Record<string, string | undefined>,
): Promise<CmmsCallbackResult> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query("SELECT set_config('app.ingest_context', 'true', true)");
    const { rows: [row] } = await client.query<ConnectorRow>(
      `SELECT id, vendor, base_url, credential_ref, field_mapping, inbound_mode
       FROM cmms_connectors WHERE id = $1 AND enabled = true`,
      [connectorId],
    );
    if (!row) {
      await client.query('COMMIT');
      return { status: 'unknown_connector' };
    }
    if (row.inbound_mode !== 'webhook') {
      await client.query('COMMIT');
      return { status: 'unauthorized', detail: 'connector is not configured for webhook inbound' };
    }

    const connector: CmmsConnector = {
      id: row.id,
      vendor: row.vendor,
      baseUrl: row.base_url,
      credentialRef: row.credential_ref,
      fieldMapping: row.field_mapping ?? {},
      inboundMode: row.inbound_mode,
    };
    const adapter = getAdapter(connector.vendor);
    if (!adapter?.verifyWebhookSignature || !adapter.mapWebhookEventToStage) {
      await client.query('COMMIT');
      return { status: 'unauthorized', detail: `adapter for vendor "${connector.vendor}" does not support inbound webhooks` };
    }
    if (!connector.credentialRef) {
      await client.query('COMMIT');
      return { status: 'unauthorized', detail: 'connector has no credential configured' };
    }

    const secret = await resolveConnectorSecret(connector.credentialRef);
    if (!adapter.verifyWebhookSignature(rawBody, headers, secret)) {
      await client.query('COMMIT');
      return { status: 'unauthorized', detail: 'signature verification failed' };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      await client.query('COMMIT');
      return { status: 'unrecognized_event', detail: 'payload is not valid JSON' };
    }

    const mapped = adapter.mapWebhookEventToStage(payload);
    if (!mapped) {
      await client.query('COMMIT');
      return { status: 'unrecognized_event' };
    }

    // cmms_callback_lookup (migration 1784300180000) — the one query that
    // genuinely needs cross-tenant shape, nothing else gated behind it.
    await client.query("SELECT set_config('app.cmms_callback_context', 'true', true)");
    const { rows: [ticket] } = await client.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM service_tickets WHERE cmms_connector_id = $1 AND external_ref = $2`,
      [connector.id, mapped.externalWorkOrderId],
    );
    if (!ticket) {
      await client.query('COMMIT');
      return {
        status: 'unknown_ticket',
        detail: `no ticket found for connector ${connector.id} / external_ref ${mapped.externalWorkOrderId}`,
      };
    }

    // Real tenant-scoped RLS context for the actual write.
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [ticket.tenant_id]);
    const outcome = await advanceWorkOrderStage(client, ticket.tenant_id, ticket.id, mapped.stage);
    await client.query('COMMIT');
    return { status: outcome.advanced ? 'advanced' : 'noop' };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
