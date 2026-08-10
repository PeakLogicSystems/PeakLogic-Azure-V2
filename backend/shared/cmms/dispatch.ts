import type { PoolClient } from 'pg';
import type { CmmsConnector, WorkOrder } from './types';

// Accept either a PoolClient or a plain pg Client (both have .query).
type Queryable = Pick<PoolClient, 'query'>;

export interface TicketForDispatch {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  priority: string;
  assetId: string | null;
  deviceThingName: string | null;
}

/** PURE — map a PeakLogic ticket to a normalized work order. */
export function buildWorkOrder(
  ticket: TicketForDispatch,
  source: WorkOrder['source'] = 'automated',
): WorkOrder {
  return {
    peaklogicTicketId: ticket.id,
    tenantId: ticket.tenantId,
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    source,
    assetId: ticket.assetId,
    deviceThingName: ticket.deviceThingName,
    createdAt: new Date().toISOString(),
  };
}

/**
 * PURE — choose the effective connector. A configured CMMS connector wins;
 * otherwise a legacy tenant webhook_url is treated as an implicit
 * generic_webhook connector, so existing behaviour is preserved exactly. No
 * connector and no legacy URL ⇒ nothing to dispatch to (null).
 */
export function selectConnector(
  partnerConnector: CmmsConnector | null,
  legacyWebhookUrl: string | null,
): CmmsConnector | null {
  if (partnerConnector) return partnerConnector;
  if (legacyWebhookUrl) {
    return {
      id: null,
      vendor: 'generic_webhook',
      baseUrl: legacyWebhookUrl,
      credentialRef: null,
      fieldMapping: {},
      inboundMode: 'none',
    };
  }
  return null;
}

interface TenantRow {
  channel_partner_id: string | null;
  settings: { webhook_url?: string } | null;
}
interface ConnectorRow {
  id: string;
  vendor: CmmsConnector['vendor'];
  base_url: string | null;
  credential_ref: string | null;
  field_mapping: Record<string, unknown> | null;
  inbound_mode: CmmsConnector['inboundMode'];
}

/**
 * Resolve the effective connector for a tenant from the DB, within the ingest
 * transaction. Reads the tenant's attributed partner + legacy webhook_url
 * (tenant RLS, own row) and that partner's enabled connector (ingest read
 * policy). Returns the connector to dispatch through plus the partner id to
 * stamp on the ticket for attribution.
 */
export async function resolveConnector(
  client: Queryable,
  tenantId: string,
): Promise<{ connector: CmmsConnector | null; channelPartnerId: string | null }> {
  const { rows: [tenant] } = await client.query<TenantRow>(
    'SELECT channel_partner_id, settings FROM tenants WHERE id = $1',
    [tenantId],
  );
  const channelPartnerId = tenant?.channel_partner_id ?? null;
  const legacyWebhookUrl = tenant?.settings?.webhook_url ?? null;

  let partnerConnector: CmmsConnector | null = null;
  if (channelPartnerId) {
    const { rows: [row] } = await client.query<ConnectorRow>(
      `SELECT id, vendor, base_url, credential_ref, field_mapping, inbound_mode
         FROM cmms_connectors
        WHERE channel_partner_id = $1 AND enabled = true
        LIMIT 1`,
      [channelPartnerId],
    );
    if (row) {
      partnerConnector = {
        id: row.id,
        vendor: row.vendor,
        baseUrl: row.base_url,
        credentialRef: row.credential_ref,
        fieldMapping: row.field_mapping ?? {},
        inboundMode: row.inbound_mode,
      };
    }
  }

  return { connector: selectConnector(partnerConnector, legacyWebhookUrl), channelPartnerId };
}
