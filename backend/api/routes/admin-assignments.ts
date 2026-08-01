import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withStaffSession } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import { requireStaffRole } from '../../shared/auth';
import { writeAuditLog } from '../../shared/audit';
import type { StaffAuthContext } from '../../shared/auth';
import type { AccountAssignment } from '../../shared/types';

// API Specification §4.7 — IA-4/IA-6. Granting or revoking a book of
// business is superadmin-only, matching Domain Model §4 decision 9/10 —
// an account_manager can see their own assignment rows (via
// account_assignment_visibility RLS), but only a superadmin decides what
// those rows are.

interface CreateAssignmentBody {
  staff_user_id: string;
  tenant_id?: string;
  channel_partner_id?: string;
}

export async function list(_event: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  return withStaffSession(auth, async (client) => {
    const { rows } = await client.query<AccountAssignment>(
      'SELECT * FROM account_assignments ORDER BY assigned_at DESC',
    );
    return ok(rows);
  });
}

export async function create(event: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  requireStaffRole(auth, 'superadmin');
  const body = parseBody<CreateAssignmentBody>(event.body, event.isBase64Encoded);

  if (!body.staff_user_id) return badRequest('staff_user_id is required');
  const hasTenant = !!body.tenant_id;
  const hasPartner = !!body.channel_partner_id;
  if (hasTenant === hasPartner) {
    return badRequest('exactly one of tenant_id or channel_partner_id is required');
  }

  return withStaffSession(auth, async (client, session) => {
    const { rows: [assignment] } = await client.query<AccountAssignment>(
      `INSERT INTO account_assignments (staff_user_id, tenant_id, channel_partner_id, assigned_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [body.staff_user_id, body.tenant_id ?? null, body.channel_partner_id ?? null, session.staffUserId],
    );

    // Audit scope follows the assignment's own tenant_id/channel_partner_id
    // (exactly one is set — enforced above) — mirrors the constraint
    // audit_log_entries itself enforces (migration 1783728000000).
    if (assignment.tenant_id) {
      await writeAuditLog(client, {
        scope: 'tenant', tenantId: assignment.tenant_id, actorId: null, actorStaffUserId: session.staffUserId,
        action: 'account_assignment.create', targetEntity: 'account_assignment', targetId: assignment.id,
        newValue: { staffUserId: assignment.staff_user_id },
      });
    } else if (assignment.channel_partner_id) {
      await writeAuditLog(client, {
        scope: 'channel_partner', channelPartnerId: assignment.channel_partner_id, actorChannelPartnerUserId: null, actorStaffUserId: session.staffUserId,
        action: 'account_assignment.create', targetEntity: 'account_assignment', targetId: assignment.id,
        newValue: { staffUserId: assignment.staff_user_id },
      });
    }
    return created(assignment);
  });
}

export async function remove(event: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  requireStaffRole(auth, 'superadmin');
  const { assignmentId } = event.pathParameters!;

  return withStaffSession(auth, async (client, session) => {
    const { rows: [assignment] } = await client.query<AccountAssignment>(
      'DELETE FROM account_assignments WHERE id = $1 RETURNING id, tenant_id, channel_partner_id',
      [assignmentId],
    );
    if (!assignment) return notFound(`Assignment ${assignmentId} not found`);

    if (assignment.tenant_id) {
      await writeAuditLog(client, {
        scope: 'tenant', tenantId: assignment.tenant_id, actorId: null, actorStaffUserId: session.staffUserId,
        action: 'account_assignment.remove', targetEntity: 'account_assignment', targetId: assignment.id,
      });
    } else if (assignment.channel_partner_id) {
      await writeAuditLog(client, {
        scope: 'channel_partner', channelPartnerId: assignment.channel_partner_id, actorChannelPartnerUserId: null, actorStaffUserId: session.staffUserId,
        action: 'account_assignment.remove', targetEntity: 'account_assignment', targetId: assignment.id,
      });
    }
    return ok(assignment);
  });
}
