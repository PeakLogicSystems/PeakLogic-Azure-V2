import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ChangePasswordCommand,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { withTenant } from '../../shared/db';
import { ok, badRequest, parseBody } from '../../shared/response';
import type { AuthContext } from '../../shared/auth';
import type { User } from '../../shared/types';

// API Specification §4.8 — SET-3/SET-4/SET-5 (display preferences) and
// SET-2.1/SET-6.1 (password/MFA, proxied to Cognito's own APIs rather than
// building parallel credential handling — Security Architecture already
// established this "don't build a second credential store" posture for
// every identity surface in this project).

const cognito = new CognitoIdentityProviderClient({});

// Cognito's self-service ChangePassword/GetUser APIs need the caller's own
// access token, not an Admin* call scoped by an IAM grant — API Gateway's
// Cognito authorizer only forwards decoded claims to authorizer.claims
// (what getAuth() reads), not the raw token, so the token must come off
// the Authorization header directly here. No other route in this codebase
// has needed the raw token before now (every other write goes through
// Admin* IAM-scoped calls instead), so this is a new, narrow exception,
// not a pattern change to auth.ts's getAuth().
function bearerToken(event: APIGatewayProxyEvent): string {
  const raw = event.headers?.Authorization ?? event.headers?.authorization ?? '';
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Missing bearer token'), { statusCode: 401 });
  return token;
}

interface SettingsBody {
  display_name?: string;
  clock_format?: '12h' | '24h';
  timezone?: string;
  theme?: 'light' | 'dark';
}

export async function getSettings(_event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
  return withTenant(auth.tenantId, async (client) => {
    const { rows: [user] } = await client.query<User>(
      'SELECT id, tenant_id, cognito_sub, email, display_name, role, status, clock_format, timezone, theme, created_at FROM users WHERE cognito_sub = $1',
      [auth.sub],
    );
    return ok(user);
  });
}

// Partial update — only provided fields change (mirrors PUT /v1/partner/
// branding's merge-not-replace convention, API Specification §4.8).
export async function updateSettings(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const body = parseBody<SettingsBody>(event.body, event.isBase64Encoded);

  if (body.clock_format && body.clock_format !== '12h' && body.clock_format !== '24h') {
    return badRequest("clock_format must be '12h' or '24h'");
  }
  if (body.theme && body.theme !== 'light' && body.theme !== 'dark') {
    return badRequest("theme must be 'light' or 'dark'");
  }

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [user] } = await client.query<User>(
      `UPDATE users
       SET display_name = COALESCE($2, display_name),
           clock_format = COALESCE($3, clock_format),
           timezone     = COALESCE($4, timezone),
           theme        = COALESCE($5, theme)
       WHERE cognito_sub = $1
       RETURNING id, tenant_id, cognito_sub, email, display_name, role, status, clock_format, timezone, theme, created_at`,
      [auth.sub, body.display_name ?? null, body.clock_format ?? null, body.timezone ?? null, body.theme ?? null],
    );
    return ok(user);
  });
}

export async function changePassword(event: APIGatewayProxyEvent, _auth: AuthContext): Promise<APIGatewayProxyResult> {
  const body = parseBody<{ previous_password: string; new_password: string }>(event.body, event.isBase64Encoded);
  if (!body.previous_password || !body.new_password) {
    return badRequest('previous_password and new_password are required');
  }

  const accessToken = bearerToken(event);
  await cognito.send(new ChangePasswordCommand({
    AccessToken: accessToken,
    PreviousPassword: body.previous_password,
    ProposedPassword: body.new_password,
  }));

  return ok({ changed: true });
}

export async function getMfaStatus(event: APIGatewayProxyEvent, _auth: AuthContext): Promise<APIGatewayProxyResult> {
  const accessToken = bearerToken(event);
  const result = await cognito.send(new GetUserCommand({ AccessToken: accessToken }));

  return ok({
    enrolled: (result.UserMFASettingList ?? []).length > 0,
    methods: result.UserMFASettingList ?? [],
    preferred: result.PreferredMfaSetting ?? null,
  });
}
