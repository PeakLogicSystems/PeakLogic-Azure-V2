import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withTenant } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import { requireRole } from '../../shared/auth';
import { createEntraUser } from '../../shared/identity';
import { writeAuditLog } from '../../shared/audit';
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

    await writeAuditLog(client, {
      scope: 'tenant', tenantId: auth.tenantId, actorId: auth.sub,
      action: 'team_member.create', targetEntity: 'user', targetId: user.id,
      newValue: { email: user.email, role: user.role },
    });
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
    if (!user) return notFound(`User ${userId} not found`);

    await writeAuditLog(client, {
      scope: 'tenant', tenantId: auth.tenantId, actorId: auth.sub,
      action: 'team_member.update', targetEntity: 'user', targetId: user.id, newValue: body,
    });
    return ok(user);
  });
}

// CORRECTED 2026-08-01 (Water-Sector Security Hardening Strategy §5 Tier
// 0.2, TD-45) — this comment previously claimed removing the DB row alone
// "already revokes meaningful access" because RLS governs data access.
// That's wrong: getAuth() (shared/auth.ts) derives tenantId/role PURELY from
// the Entra JWT's claims, with NO database lookup of this users row at all —
// RLS only checks `tenant_id` on the data itself, never whether the calling
// user's own row still exists. Unlike partner-users.ts's remove()
// (withChannelPartner() DOES re-look-up the calling channel-partner-user row
// on every request — see that file's parallel correction), there is NO
// equivalent per-request check for tenant users at all: withTenant() only
// takes a bare tenantId, not the caller's identity, so it has no way to.
//
// The new force-logout endpoint (shared/session-revocation.ts, wired at
// POST /v1/admin/tenants/{tenantId}/users/{userId}/revoke-sessions, Graph's
// revokeSignInSessions) is real defense-in-depth but is honestly NOT a full
// fix: this backend validates JWTs offline (signature + issuer + audience +
// expiry only, no Continuous Access Evaluation), so revokeSignInSessions
// stops a removed/compromised user from obtaining a NEW access token but
// does not retroactively invalidate one already issued and still inside its
// expiry window. The complete fix — a per-request users-row existence/
// status check inside withTenant(), mirroring withChannelPartner()'s
// existing pattern exactly — needs a signature change touching every
// withTenant() call site (~30+) and is tracked as TD-45, not rushed into
// this pass.
export async function remove(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  const { userId } = event.pathParameters!;

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [user] } = await client.query<User>('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    if (!user) return notFound(`User ${userId} not found`);

    await writeAuditLog(client, {
      scope: 'tenant', tenantId: auth.tenantId, actorId: auth.sub,
      action: 'team_member.remove', targetEntity: 'user', targetId: user.id,
    });
    return ok(user);
  });
}
