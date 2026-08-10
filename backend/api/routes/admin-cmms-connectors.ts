import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withStaffSession } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import { requireStaffRole } from '../../shared/auth';
import { writeAuditLog } from '../../shared/audit';
import { supportedVendors } from '../../shared/cmms/adapters';
import type { StaffAuthContext } from '../../shared/auth';
import type { CmmsVendor } from '../../shared/cmms/types';

// The management surface reporting-and-kpi-design.md §5 designed and named
// as a real gap ("GET/POST/PUT /v1/admin/channel-partners/{id}/cmms-
// connector") but never built — without it, nobody could actually
// configure a partner's CMMS connector at all, ServiceTitan or otherwise.
// Built 2026-08-09 alongside the servicetitan adapter itself, for exactly
// that reason: The Purple Standard needs somewhere to enter their
// ServiceTitan connection.
//
// Same disclosed RLS scope decision as admin-partners.ts: channel_partners
// has no RLS (Database Schema §4.5), so requireStaffRole() below is the
// only thing gating create/update, not a structural RLS guarantee.
// cmms_connectors ITSELF does carry RLS (its own partner/tenant/
// ingest_read/sync_context policies) — withStaffSession() alone doesn't set
// app.current_channel_partner_id, so these handlers query cmms_connectors
// directly by channel_partner_id rather than relying on that policy; the
// requireStaffRole() check is what actually authorizes the write.

interface CmmsConnectorRow {
  id: string;
  channel_partner_id: string | null;
  tenant_id: string | null;
  vendor: CmmsVendor;
  base_url: string | null;
  credential_ref: string | null;
  field_mapping: Record<string, unknown>;
  inbound_mode: 'webhook' | 'poll' | 'none';
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface UpsertConnectorBody {
  vendor: CmmsVendor;
  baseUrl?: string;
  // The Key Vault SECRET NAME an operator has already created out of band
  // (az keyvault secret set) — never the secret value itself. Matches
  // every other credential_ref in this codebase (docs/data-model.sql's own
  // comment on the column: "Key Vault secret NAME, never the secret").
  credentialRef?: string;
  inboundMode?: 'webhook' | 'poll' | 'none';
  enabled?: boolean;
}

export async function getOne(event: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  const { partnerId } = event.pathParameters!;
  return withStaffSession(auth, async (client) => {
    const { rows: [connector] } = await client.query<CmmsConnectorRow>(
      `SELECT * FROM cmms_connectors WHERE channel_partner_id = $1`,
      [partnerId],
    );
    return connector ? ok(connector) : notFound(`No CMMS connector configured for channel partner ${partnerId}`);
  });
}

export async function upsert(event: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  requireStaffRole(auth, 'superadmin');
  const { partnerId } = event.pathParameters!;
  const body = parseBody<UpsertConnectorBody>(event.body, event.isBase64Encoded);

  if (!body.vendor) return badRequest('vendor is required');
  if (!supportedVendors().includes(body.vendor)) {
    return badRequest(`vendor "${body.vendor}" has no adapter registered — supported: ${supportedVendors().join(', ')}`);
  }

  return withStaffSession(auth, async (client, session) => {
    const { rows: [partner] } = await client.query('SELECT id FROM channel_partners WHERE id = $1', [partnerId]);
    if (!partner) return notFound(`Channel partner ${partnerId} not found`);

    const { rows: [existing] } = await client.query<{ field_mapping: Record<string, unknown> }>(
      `SELECT field_mapping FROM cmms_connectors WHERE channel_partner_id = $1`,
      [partnerId],
    );

    const { rows: [connector] } = await client.query<CmmsConnectorRow>(
      `INSERT INTO cmms_connectors (channel_partner_id, vendor, base_url, credential_ref, field_mapping, inbound_mode, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (channel_partner_id) WHERE enabled AND channel_partner_id IS NOT NULL
       DO UPDATE SET vendor = EXCLUDED.vendor, base_url = EXCLUDED.base_url,
                      credential_ref = EXCLUDED.credential_ref, inbound_mode = EXCLUDED.inbound_mode,
                      enabled = EXCLUDED.enabled, updated_at = now()
       RETURNING *`,
      [
        partnerId,
        body.vendor,
        body.baseUrl ?? null,
        body.credentialRef ?? null,
        JSON.stringify(existing?.field_mapping ?? {}), // preserve tenantMappings across a config update
        body.inboundMode ?? 'none',
        body.enabled ?? true,
      ],
    );

    await writeAuditLog(client, {
      scope: 'channel_partner', channelPartnerId: partnerId, actorChannelPartnerUserId: null, actorStaffUserId: session.staffUserId,
      action: existing ? 'cmms_connector.update' : 'cmms_connector.create',
      targetEntity: 'cmms_connector', targetId: connector.id,
      newValue: { vendor: connector.vendor, inboundMode: connector.inbound_mode, enabled: connector.enabled },
    });

    return created(connector);
  });
}

interface TenantMappingBody {
  servicetitanCustomerId?: string;
  servicetitanLocationId?: string;
}

/**
 * Sets the per-tenant ServiceTitan Customer/Location mapping the adapter
 * actually reads for dispatch/billing (servicetitan.ts's
 * resolveTenantMapping) — the step that makes cmms-account-sync.main.ts's
 * synced customer/location data actionable rather than just visible. An
 * admin reviews GET .../cmms-account-records first, then confirms the
 * match here.
 */
export async function setTenantMapping(event: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  requireStaffRole(auth, 'superadmin');
  const { partnerId, tenantId } = event.pathParameters!;
  const body = parseBody<TenantMappingBody>(event.body, event.isBase64Encoded);

  if (!body.servicetitanCustomerId && !body.servicetitanLocationId) {
    return badRequest('At least one of servicetitanCustomerId or servicetitanLocationId is required');
  }

  return withStaffSession(auth, async (client, session) => {
    const { rows: [tenant] } = await client.query('SELECT id, channel_partner_id FROM tenants WHERE id = $1', [tenantId]);
    if (!tenant) return notFound(`Tenant ${tenantId} not found`);

    const { rows: [connector] } = await client.query<{ id: string; field_mapping: { tenantMappings?: Record<string, unknown> } }>(
      `SELECT id, field_mapping FROM cmms_connectors WHERE channel_partner_id = $1`,
      [partnerId],
    );
    if (!connector) return notFound(`No CMMS connector configured for channel partner ${partnerId}`);

    const tenantMappings = { ...(connector.field_mapping.tenantMappings ?? {}) };
    tenantMappings[tenantId] = {
      ...(tenantMappings[tenantId] as Record<string, unknown> | undefined),
      ...(body.servicetitanCustomerId ? { servicetitanCustomerId: body.servicetitanCustomerId } : {}),
      ...(body.servicetitanLocationId ? { servicetitanLocationId: body.servicetitanLocationId } : {}),
    };
    const newFieldMapping = { ...connector.field_mapping, tenantMappings };

    await client.query(`UPDATE cmms_connectors SET field_mapping = $1, updated_at = now() WHERE id = $2`, [
      JSON.stringify(newFieldMapping),
      connector.id,
    ]);

    await writeAuditLog(client, {
      scope: 'channel_partner', channelPartnerId: partnerId, actorChannelPartnerUserId: null, actorStaffUserId: session.staffUserId,
      action: 'cmms_connector.set_tenant_mapping', targetEntity: 'cmms_connector', targetId: connector.id,
      newValue: { tenantId, ...body },
    });

    return ok({ tenantId, mapping: tenantMappings[tenantId] });
  });
}

export async function listAccountRecords(event: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  const { partnerId } = event.pathParameters!;
  const recordType = event.queryStringParameters?.recordType;

  return withStaffSession(auth, async (client) => {
    const { rows: [connector] } = await client.query<{ id: string }>(
      `SELECT id FROM cmms_connectors WHERE channel_partner_id = $1`,
      [partnerId],
    );
    if (!connector) return notFound(`No CMMS connector configured for channel partner ${partnerId}`);

    const { rows } = await client.query(
      recordType
        ? `SELECT * FROM cmms_account_records WHERE connector_id = $1 AND record_type = $2 ORDER BY synced_at DESC`
        : `SELECT * FROM cmms_account_records WHERE connector_id = $1 ORDER BY record_type, synced_at DESC`,
      recordType ? [connector.id, recordType] : [connector.id],
    );
    return ok(rows);
  });
}
