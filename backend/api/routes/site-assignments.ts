import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withTenant } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import { requireRole } from '../../shared/auth';
import { writeAuditLog } from '../../shared/audit';
import type { AuthContext } from '../../shared/auth';

// Architecture-review Gap 2/ADR-002 (2026-08-09) — management surface for
// site_assignments (migration 1784300060000), the mechanism that closes the
// confirmed asymmetry between the two portals: the channel-partner side
// already scopes a technician to their assigned territory's sites; the
// tenant side had no equivalent per-site/per-device ACL at all.
//
// Admin-only by design: assigning access IS a form of granting access, the
// same reasoning `remove()` in devices.ts already applies to decommission.
// A user with zero rows here keeps full tenant access — creating the FIRST
// assignment for a user is the moment they become scoped, not before.

interface SiteAssignment {
  id: string;
  tenant_id: string;
  user_id: string;
  site_id: string;
  created_at: string;
}

export async function listForUser(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  const { userId } = event.pathParameters!;

  return withTenant(auth.tenantId, async (client) => {
    const { rows } = await client.query<SiteAssignment & { site_name: string }>(
      `SELECT sa.*, s.name AS site_name
       FROM site_assignments sa
       JOIN sites s ON s.id = sa.site_id
       WHERE sa.user_id = $1
       ORDER BY s.name`,
      [userId],
    );
    return ok(rows);
  });
}

export async function create(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  const body = parseBody<{ userId: string; siteId: string }>(event.body, event.isBase64Encoded);

  if (!body.userId?.trim()) return badRequest('userId is required');
  if (!body.siteId?.trim()) return badRequest('siteId is required');

  return withTenant(auth.tenantId, async (client) => {
    // Both users(id) and sites(id) are tenant-scoped via RLS already —
    // an admin cannot assign a site outside their own tenant to a user
    // inside it (or vice versa), enforced at the database layer, not just
    // trusted from the request body, the same defense-in-depth reasoning
    // devices.ts's claim() uses for tenant_id.
    const { rows: [user] } = await client.query('SELECT id FROM users WHERE id = $1', [body.userId]);
    if (!user) return notFound(`User ${body.userId} not found`);
    const { rows: [site] } = await client.query('SELECT id FROM sites WHERE id = $1', [body.siteId]);
    if (!site) return notFound(`Site ${body.siteId} not found`);

    const { rows: [assignment] } = await client.query<SiteAssignment>(
      `INSERT INTO site_assignments (tenant_id, user_id, site_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, site_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING *`,
      [auth.tenantId, body.userId, body.siteId],
    );

    await writeAuditLog(client, {
      scope: 'tenant', tenantId: auth.tenantId, actorId: auth.sub,
      action: 'site_assignment.create', targetEntity: 'site_assignment', targetId: assignment.id,
      newValue: { userId: body.userId, siteId: body.siteId },
    });

    return created(assignment);
  });
}

export async function remove(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  const { assignmentId } = event.pathParameters!;

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [assignment] } = await client.query<SiteAssignment>(
      'DELETE FROM site_assignments WHERE id = $1 RETURNING *',
      [assignmentId],
    );
    if (!assignment) return notFound(`Site assignment ${assignmentId} not found`);

    await writeAuditLog(client, {
      scope: 'tenant', tenantId: auth.tenantId, actorId: auth.sub,
      action: 'site_assignment.remove', targetEntity: 'site_assignment', targetId: assignment.id,
      priorValue: { userId: assignment.user_id, siteId: assignment.site_id },
    });

    return ok(assignment);
  });
}
