import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withTenant } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import { requireRole } from '../../shared/auth';
import { createEntraUser } from '../../shared/identity';
import type { AuthContext } from '../../shared/auth';
import type { User } from '../../shared/types';

// API Specification §4.8 — SET-7.1. A product-facing equivalent of the
// admin-console user-provisioning process: creates the user in the
// PeakLogicCustomers Entra tenant and assigns the matching App Role, just
// invoked by a tenant admin from within the product. requireRole(auth,
// 'admin') gates every handler — 'operator' has no team-management access.
// (Azure port — createEntraUser replaces the AWS AdminCreateUser +
// AdminAddUserToGroup calls; see shared/identity.ts.)

interface CreateTeamMemberBody {
  email: string;
  display_name?: string;
  role: 'admin' | 'operator';
}

const USER_COLUMNS = 'id, tenant_id, cognito_sub, email, display_name, role, status, clock_format, timezone, theme, created_at';

export async function list(_event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  return withTenant(auth.tenantId, async (client) => {
    const { rows } = await client.query<User>(`SELECT ${USER_COLUMNS} FROM users ORDER BY email`);
    return ok(rows);
  });
}

// Same disclosed identity-provider/DB non-atomicity as every other
// createEntraUser call site in this codebase (API Specification §7 items
// 6/8): the Entra user and the DB row are not created in one transaction.
export async function create(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  const body = parseBody<CreateTeamMemberBody>(event.body, event.isBase64Encoded);

  if (!body.email?.trim()) return badRequest('email is required');
  if (body.role !== 'admin' && body.role !== 'operator') {
    return badRequest("role must be 'admin' or 'operator'");
  }

  // Create the Entra user + assign the App Role BEFORE the DB insert — the
  // returned oid is the stable subject the users.cognito_sub column stores
  // (Security Architecture §2.5). Mirrors the AWS ordering exactly.
  const { oid } = await createEntraUser('customers', {
    email: body.email.trim(),
    displayName: body.display_name,
    tenantId: auth.tenantId,
    appRole: body.role,
  });

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [user] } = await client.query<User>(
      `INSERT INTO users (tenant_id, cognito_sub, email, display_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${USER_COLUMNS}`,
      [auth.tenantId, oid, body.email.trim(), body.display_name ?? null, body.role],
    );
    return created(user);
  });
}

export async function update(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  const { userId } = event.pathParameters!;
  const body = parseBody<{ display_name?: string; role?: 'admin' | 'operator'; status?: string }>(
    event.body, event.isBase64Encoded,
  );

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [user] } = await client.query<User>(
      `UPDATE users
       SET display_name = COALESCE($2, display_name),
           role         = COALESCE($3, role),
           status       = COALESCE($4, status)
       WHERE id = $1
       RETURNING ${USER_COLUMNS}`,
      [userId, body.display_name ?? null, body.role ?? null, body.status ?? null],
    );
    return user ? ok(user) : notFound(`User ${userId} not found`);
  });
}

// Deliberately does not disable the Entra account (no Graph disable call) —
// same disclosed simplification as partner-users.ts's remove(): the DB row's
// tenant_isolation RLS scoping is what actually governs data access, not
// Entra account state, so removing the row alone already revokes meaningful
// access.
export async function remove(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  const { userId } = event.pathParameters!;

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [user] } = await client.query<User>('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    return user ? ok(user) : notFound(`User ${userId} not found`);
  });
}
