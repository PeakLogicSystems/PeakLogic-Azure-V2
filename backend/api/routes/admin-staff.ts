import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { withStaffSession } from '../../shared/db';
import { ok, created, badRequest, parseBody } from '../../shared/response';
import { requireStaffRole } from '../../shared/auth';
import type { StaffAuthContext } from '../../shared/auth';
import type { PeakLogicStaffUser } from '../../shared/types';

// API Specification §4.7 — IA-1/IA-2. Every operation here is superadmin-only
// (IA-2.1): only a superadmin may create new staff accounts, tenant/channel-
// partner creation authority, or account-manager assignments.

interface CreateStaffBody {
  email: string;
  display_name?: string;
  role: 'superadmin' | 'account_manager';
}

const cognito = new CognitoIdentityProviderClient({});

export async function list(_event: APIGatewayProxyEvent, auth: StaffAuthContext): Promise<APIGatewayProxyResult> {
  return withStaffSession(auth, async (client) => {
    const { rows } = await client.query<PeakLogicStaffUser>(
      'SELECT id, cognito_sub, email, display_name, role, status, created_at, updated_at FROM peaklogic_staff_users ORDER BY email',
    );
    return ok(rows);
  });
}

// Creates a real Cognito account in StaffPool AND the matching DB row —
// NOT atomic across the two systems, the same disclosed shape already
// flagged for POST /v1/partner/users (API Specification §7 item 6) and
// POST /v1/admin/tenants/{tenantId}/users (§7 item 8). Explicitly adds the
// new user to the matching Cognito group (superadmin/account_manager) —
// StaffPool uses groups (Security Architecture §2.5 decision), unlike
// PartnerPool, so this step has no equivalent in partner-users.ts's create().
export async function create(event: APIGatewayProxyEvent, auth: StaffAuthContext): Promise<APIGatewayProxyResult> {
  requireStaffRole(auth, 'superadmin');
  const body = parseBody<CreateStaffBody>(event.body, event.isBase64Encoded);

  if (!body.email?.trim()) return badRequest('email is required');
  if (body.role !== 'superadmin' && body.role !== 'account_manager') {
    return badRequest("role must be 'superadmin' or 'account_manager'");
  }

  return withStaffSession(auth, async (client) => {
    const cognitoResult = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: process.env.STAFF_POOL_ID!,
      Username: body.email.trim(),
      UserAttributes: [
        { Name: 'email', Value: body.email.trim() },
        { Name: 'email_verified', Value: 'true' },
        ...(body.display_name ? [{ Name: 'name', Value: body.display_name }] : []),
      ],
      MessageAction: 'SUPPRESS',
    }));

    const cognitoSub = cognitoResult.User?.Attributes?.find(a => a.Name === 'sub')?.Value;
    if (!cognitoSub) {
      throw Object.assign(new Error('Cognito did not return a user sub'), { statusCode: 500 });
    }

    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: process.env.STAFF_POOL_ID!,
      Username: body.email.trim(),
      GroupName: body.role,
    }));

    const { rows: [staffUser] } = await client.query<PeakLogicStaffUser>(
      `INSERT INTO peaklogic_staff_users (cognito_sub, email, display_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, cognito_sub, email, display_name, role, status, created_at, updated_at`,
      [cognitoSub, body.email.trim(), body.display_name ?? null, body.role],
    );
    return created(staffUser);
  });
}
