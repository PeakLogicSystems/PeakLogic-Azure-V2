import { PoolClient } from 'pg';
import { resolveConnector, buildWorkOrder } from './cmms/dispatch';
import { getAdapter } from './cmms/adapters';
import type { AssetSpecs, Device, Alert, ServiceTicket } from './types';

// Extracted from backend/ingest/handler.ts (device-silence detection,
// backend/jobs/silence-detection-handler.ts, needed this same dedup → insert
// → maybe-ticket path as a SECOND consumer beyond ingest — the "extract once
// genuinely reused" rule of thumb this project applies elsewhere
// (evaluateRuleSet, baseline/anomaly, etc.). Behavior unchanged from the
// version that lived in ingest/handler.ts; this is a pure relocation, not a
// rewrite — ingest's own alert-creation tests continue to cover it.

export interface AlertParams {
  type: string; // 'threshold' | 'anomaly' | 'prediction' | 'device_silent' (only threshold/anomaly/device_silent actually emitted today)
  severity: Alert['severity'];
  metric: string;
  message: string;
  context: Record<string, unknown>;
  time: Date;
}

/**
 * The shared dedup → insert → maybe-ticket path every alert source (Policy
 * Engine/compiled-rules "threshold", AI Analytics "anomaly", device-silence
 * "device_silent") goes through — one alert PATH regardless of how many
 * alert SOURCES exist (AI Analytics Layer Design §1.3's principle, enforced
 * in code here, not just prose). Returns the created row (or none, if
 * deduped) so callers that need the alert id — e.g. Tier 1 anomaly scoring,
 * to link `ai_findings.alert_id` — have it without a second query.
 */
export async function createAlertAndMaybeTicket(
  client: PoolClient,
  device: Device & { category: string; specs: AssetSpecs | null },
  params: AlertParams,
): Promise<{ rows: [Alert] | [] }> {
  const { type, severity, metric, message, context, time } = params;

  // Skip if an open alert of the same type+severity already exists for this device+metric
  const { rows: [existing] } = await client.query(
    `SELECT id FROM alerts
     WHERE device_id = $1
       AND type      = $2
       AND severity  = $3
       AND context->>'metric' = $4
       AND status IN ('open', 'acknowledged')
     LIMIT 1`,
    [device.id, type, severity, metric],
  );

  if (existing) return { rows: [] }; // already alerted, skip

  const { rows: [alert] } = await client.query<Alert>(
    `INSERT INTO alerts (tenant_id, device_id, asset_id, severity, type, message, context, triggered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [device.tenant_id, device.id, device.asset_id, severity, type, message, JSON.stringify(context), time],
  );

  console.info(`Alert created: ${severity} (${type}) — ${message}`);

  // Auto-create a service ticket for critical alerts. Tier 1 anomaly alerts
  // never reach 'critical' (anomaly.ts caps them at 'warning'), and
  // device_silent alerts default to 'warning' too (silence-detection.ts) —
  // both by design, not yet proven safe to auto-dispatch on.
  if (severity === 'critical') {
    await createTicketForAlert(client, device, alert);
  }

  return { rows: [alert] };
}

export interface HubAlertParams {
  type: string; // 'hub_agent_unexpected_version' as of Water-Sector Security Hardening Strategy §5 Tier 2 item 1
  severity: Alert['severity'];
  message: string;
  context: Record<string, unknown>;
  time: Date;
}

/**
 * A hub-scoped sibling of createAlertAndMaybeTicket(), for findings that
 * aren't about a device/asset at all — the first of which is Tier 2 item
 * 1's agent-version integrity check (shared/hub-integrity.ts). `alerts`
 * already allows `device_id`/`asset_id` to be NULL (both are nullable FKs,
 * `docs/data-model.sql`) — no migration needed; the hub identity travels in
 * `context.hubId` instead of a dedicated column, the same way `context`
 * already carries source-specific detail for every other alert type.
 * Deliberately does NOT auto-create a service ticket the way a critical
 * device alert does: createTicketForAlert()'s CMMS dispatch is built around
 * a `Device` (thing_name, asset_id) a Hub finding doesn't have, and this
 * finding type is capped at 'warning' anyway (see the header comment on
 * where it's called) — same "no production track record yet, don't
 * auto-dispatch" posture as anomaly/device-silence alerts.
 *
 * Takes the same `{ query }`-only shape hubs-handler.ts's own `Queryable`
 * type already uses (not the full `PoolClient`) — this function only ever
 * calls `.query()`, and structural typing means hubs-handler.ts's
 * `Queryable` values already satisfy this without a cast.
 */
export async function createHubAlert(
  client: Pick<PoolClient, 'query'>,
  tenantId: string,
  hubId: string,
  params: HubAlertParams,
): Promise<{ rows: [Alert] | [] }> {
  const { type, severity, message, context, time } = params;

  const { rows: [existing] } = await client.query(
    `SELECT id FROM alerts
     WHERE tenant_id = $1
       AND context->>'hubId' = $2
       AND type = $3
       AND status IN ('open', 'acknowledged')
     LIMIT 1`,
    [tenantId, hubId, type],
  );

  if (existing) return { rows: [] }; // already alerted, skip

  const { rows: [alert] } = await client.query<Alert>(
    `INSERT INTO alerts (tenant_id, device_id, asset_id, severity, type, message, context, triggered_at)
     VALUES ($1, NULL, NULL, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, severity, type, message, JSON.stringify({ ...context, hubId }), time],
  );

  console.info(`Hub alert created: ${severity} (${type}) — ${message}`);

  return { rows: [alert] };
}

export async function createTicketForAlert(
  client: PoolClient,
  device: Device & { category: string },
  alert: Alert,
): Promise<void> {
  const tenantId = device.tenant_id!; // non-null here — callers only reach this with an already-resolved tenant

  // Resolve the CMMS connector for this tenant's attributed partner (or the
  // legacy tenant webhook_url as an implicit generic_webhook) — CMMS Dispatch
  // §2. Runs inside the caller's tenant-scoped transaction; the connector
  // read uses the ingest_context read policy (migration 1783875900000) when
  // called from ingest, or normal tenant_isolation when called from a
  // tenant-scoped withTenant() transaction (e.g. the silence-detection sweep).
  const { connector, channelPartnerId } = await resolveConnector(client, tenantId);

  // Insert the ticket with dispatch attribution stamped transactionally: it's
  // an automated (alert-generated) ticket, dispatched to `channelPartnerId`
  // via `connector`. dispatched_at is set optimistically when there's a
  // connector to send to — matching the fire-and-forget delivery below; a
  // durable retry sweep for dispatches that never confirm is the next
  // increment (CMMS Dispatch §6 phase 1 outbox).
  const { rows: [ticket] } = await client.query<ServiceTicket>(
    `INSERT INTO service_tickets
       (tenant_id, alert_id, asset_id, title, description, priority, source,
        channel_partner_id, cmms_connector_id, dispatched_at, webhook_url)
     VALUES ($1, $2, $3, $4, $5, 'emergency', 'automated', $6, $7, $8, $9)
     RETURNING *`,
    [
      tenantId,
      alert.id,
      alert.asset_id,
      `Critical alert: ${alert.message}`,
      `Auto-generated from alert ${alert.id} — ${alert.type} on device ${device.thing_name}`,
      channelPartnerId,
      connector?.id ?? null,
      connector ? new Date() : null,
      connector?.vendor === 'generic_webhook' ? connector.baseUrl : null,
    ],
  );

  if (connector && ticket) {
    const adapter = getAdapter(connector.vendor);
    if (!adapter) {
      console.error(`No CMMS adapter for vendor "${connector.vendor}" — ticket ${ticket.id} not dispatched`);
      return;
    }
    const workOrder = buildWorkOrder({
      id: ticket.id,
      title: ticket.title,
      description: ticket.description ?? '',
      priority: ticket.priority,
      assetId: ticket.asset_id,
      deviceThingName: device.thing_name,
    });
    // Fire-and-forget — same non-blocking semantics as the prior direct
    // webhook post, so the external call never holds the caller's txn open.
    // generic_webhook needs no secret; credential-backed vendors resolve
    // connector.credentialRef from Key Vault when those adapters are added.
    adapter
      .send(connector, workOrder, null)
      .then((r) => {
        if (!r.ok) console.error(`CMMS dispatch failed for ticket ${ticket.id}: ${r.error}`);
      })
      .catch((err: unknown) => console.error('CMMS dispatch threw', err));
  }
}
