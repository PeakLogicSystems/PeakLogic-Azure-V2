import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { withTenant } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import { requireRole } from '../../shared/auth';
import type { AuthContext } from '../../shared/auth';
import type { User } from '../../shared/types';

// API Specification §4.8 — SET-7.1. A product-facing equivalent of the
// AWS-Console process the SysAdmin Guide currently documents as a manual
// step: calls the same underlying Cognito AdminCreateUser/group-management
// APIs, just invoked by a tenant admin from within the product instead of
// by PeakLogic staff from the AWS Console. requireRole(auth, 'admin') gates
// every handler — 'operator' has no team-management access.

interface CreateTeamMemberBody {
  email: string;
  display_name?: string;
  role: 'admin' | 'operator';
}

const cognito = new CognitoIdentityProviderClient({});
const USER_COLUMNS = 'id, tenant_id, cognito_sub, email, display_name, role, status, clock_format, timezone, theme, created_at';

export async function list(_event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
  requireRole(auth, 'admin');
  return withTenant(auth.tenantId, async (client) => {
    const { rows } = await client.query<User>(`SELECT ${USER_COLUMNS} FROM users ORDER BY email`);
    return ok(rows);
  });
}

// Same disclosed Cognito/DB non-atomicity as every other AdminCreateUser
// call site in this codebase (API Specification §7 items 6/8).
export async function create(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
  requireRole(auth, 'admin');
  const body = parseBody<CreateTeamMemberBody>(event.body, event.isBase64Encoded);

  if (!body.email?.trim()) return badRequest('email is required');
  if (body.role !== 'admin' && body.role !== 'operator') {
    return badRequest("role must be 'admin' or 'operator'");
  }

  return withTenant(auth.tenantId, async (client) => {
    const cognitoResult = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: body.email.trim(),
      UserAttributes: [
        { Name: 'email', Value: body.email.trim() },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'custom:tenant_id', Value: auth.tenantId },
        ...(body.display_name ? [{ Name: 'name', Value: body.display_name }] : []),
      ],
      MessageAction: 'SUPPRESS',
    }));

    const cognitoSub = cognitoResult.User?.Attributes?.find(a => a.Name === 'sub')?.Value;
    if (!cognitoSub) {
      throw Object.assign(new Error('Cognito did not return a user sub'), { statusCode: 500 });
    }

    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: body.email.trim(),
      GroupName: body.role,
    }));

    const { rows: [user] } = await client.query<User>(
      `INSERT INTO users (tenant_id, cognito_sub, email, display_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${USER_COLUMNS}`,
      [auth.tenantId, cognitoSub, body.email.trim(), body.display_name ?? null, body.role],
    );
    return created(user);
  });
}

export async function update(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
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

// Deliberately does not deactivate the Cognito account (no
// AdminDisableUser call) — same disclosed simplification as
// partner-users.ts's remove(): the DB row's tenant_isolation RLS scoping
// is what actually governs data access, not Cognito account state, so
// removing the row alone already revokes meaningful access.
export async function remove(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
  requireRole(auth, 'admin');
  const { userId } = event.pathParameters!;

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [user] } = await client.query<User>('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    return user ? ok(user) : notFound(`User ${userId} not found`);
  });
}
