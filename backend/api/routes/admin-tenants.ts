import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withStaffSession } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import { requireStaffRole } from '../../shared/auth';
import { writeAuditLog } from '../../shared/audit';
import type { StaffAuthContext } from '../../shared/auth';
import type { Tenant } from '../../shared/types';

// API Specification §4.7 — IA-1/IA-2/IA-6. GET relies entirely on the
// staff_tenant_access RLS policy (Database Schema §4.5) to scope results:
// superadmin sees every tenant unconditionally, account_manager sees only
// tenants they hold an account_assignments row for — no application-level
// WHERE clause needed, the same structural principle MT-1.1 already
// established for tenant_isolation itself.

interface CreateTenantBody {
  name: string;
  slug: string;
  plan?: string;
  channel_partner_id?: string;
}

export async function list(_event: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  return withStaffSession(auth, async (client) => {
    const { rows } = await client.query<Tenant>('SELECT * FROM tenants ORDER BY name');
    return ok(rows);
  });
}

export async function getOne(event: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  const { tenantId } = event.pathParameters!;
  return withStaffSession(auth, async (client) => {
    const { rows: [tenant] } = await client.query<Tenant>('SELECT * FROM tenants WHERE id = $1', [tenantId]);
    return tenant ? ok(tenant) : notFound(`Tenant ${tenantId} not found`);
  });
}

// superadmin-only (IA-2.1): staff_tenant_access's USING-doubles-as-WITH-CHECK
// behavior (Database Schema §4.5) already structurally prevents an
// account_manager from inserting a new tenant at the RLS layer — this
// requireStaffRole() call is defense-in-depth, giving a clear 403 message
// instead of relying solely on the INSERT silently failing RLS.
export async function create(event: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  requireStaffRole(auth, 'superadmin');
  const body = parseBody<CreateTenantBody>(event.body, event.isBase64Encoded);

  if (!body.name?.trim()) return badRequest('name is required');
  if (!body.slug?.trim()) return badRequest('slug is required');

  return withStaffSession(auth, async (client, session) => {
    const { rows: [tenant] } = await client.query<Tenant>(
      `INSERT INTO tenants (name, slug, plan, channel_partner_id)
       VALUES ($1, $2, COALESCE($3, 'trial'), $4)
       RETURNING *`,
      [body.name.trim(), body.slug.trim(), body.plan ?? null, body.channel_partner_id ?? null],
    );

    await writeAuditLog(client, {
      scope: 'tenant', tenantId: tenant.id, actorId: null, actorStaffUserId: session.staffUserId,
      action: 'tenant.create', targetEntity: 'tenant', targetId: tenant.id,
      newValue: { name: tenant.name, slug: tenant.slug, plan: tenant.plan },
    });
    return created(tenant);
  });
}
