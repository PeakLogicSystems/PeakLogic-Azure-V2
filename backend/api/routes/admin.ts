import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withStaffSession } from '../../shared/db';
import { ok } from '../../shared/response';
import type { StaffAuthContext } from '../../shared/auth';
import type { PeakLogicStaffUser } from '../../shared/types';

// API Specification §4.7 — GET /v1/admin. Confirms the caller's own staff
// identity/role, the same self-read shape as GET /v1/partner.
export async function getSelf(_event: APIGatewayProxyEvent, auth: StaffAuthContext): Promise<APIGatewayProxyResult> {
  return withStaffSession(auth, async (client, session) => {
    const { rows: [self] } = await client.query<PeakLogicStaffUser>(
      'SELECT id, cognito_sub, email, display_name, role, status, created_at, updated_at FROM peaklogic_staff_users WHERE id = $1',
      [session.staffUserId],
    );
    return ok(self);
  });
}
