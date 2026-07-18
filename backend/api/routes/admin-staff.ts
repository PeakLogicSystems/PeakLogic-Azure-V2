import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withStaffSession } from '../../shared/db';
import { ok, created, badRequest, parseBody } from '../../shared/response';
import { requireStaffRole } from '../../shared/auth';
import { createEntraUser } from '../../shared/identity';
import type { StaffAuthContext } from '../../shared/auth';
import type { PeakLogicStaffUser } from '../../shared/types';

// API Specification §4.7 — IA-1/IA-2. Every operation here is superadmin-only
// (IA-2.1): only a superadmin may create new staff accounts, tenant/channel-
// partner creation authority, or account-manager assignments.
// (Azure port — staff users live in PeakLogic's OWN corporate Entra ID
// workforce tenant, and their role is an App Role; createEntraUser('staff',
// ...) replaces the AWS AdminCreateUser + AdminAddUserToGroup calls.)

interface CreateStaffBody {
  email: string;
  display_name?: string;
  role: 'superadmin' | 'account_manager';
}

export async function list(_event: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  return withStaffSession(auth, async (client) => {
    const { rows } = await client.query<PeakLogicStaffUser>(
      'SELECT id, cognito_sub, email, display_name, role, status, created_at, updated_at FROM peaklogic_staff_users ORDER BY email',
    );
    return ok(rows);
  });
}

// Creates a staff user in PeakLogic's corporate Entra ID tenant, assigning
// the matching App Role (superadmin/account_manager) — App Roles are how
// staff roles are resolved (Security Architecture §2.5, read from the token's
// `roles` claim by getStaffAuth()), so unlike partner-users.ts this DOES pass
// an appRole. NOT atomic across Entra + DB, the same disclosed shape as the
// other createEntraUser call sites (API Specification §7 items 6/8).
export async function create(event: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  requireStaffRole(auth, 'superadmin');
  const body = parseBody<CreateStaffBody>(event.body, event.isBase64Encoded);

  if (!body.email?.trim()) return badRequest('email is required');
  if (body.role !== 'superadmin' && body.role !== 'account_manager') {
    return badRequest("role must be 'superadmin' or 'account_manager'");
  }

  const { oid } = await createEntraUser('staff', {
    email: body.email.trim(),
    displayName: body.display_name,
    appRole: body.role,
  });

  return withStaffSession(auth, async (client) => {
    const { rows: [staffUser] } = await client.query<PeakLogicStaffUser>(
      `INSERT INTO peaklogic_staff_users (cognito_sub, email, display_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, cognito_sub, email, display_name, role, status, created_at, updated_at`,
      [oid, body.email.trim(), body.display_name ?? null, body.role],
    );
    return created(staffUser);
  });
}
