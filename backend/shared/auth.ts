import type { APIGatewayProxyEvent } from 'aws-lambda';

export interface AuthContext {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

/**
 * Extracts tenant + role from Cognito JWT claims injected by API Gateway.
 * Throws if required claims are missing — API GW should never reach Lambda
 * without a valid token, but we guard anyway.
 */
export function getAuth(event: APIGatewayProxyEvent): AuthContext {
  const claims = event.requestContext.authorizer?.claims as Record<string, string> | undefined;

  if (!claims?.sub) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }

  const tenantId = claims['custom:tenant_id'];
  if (!tenantId) {
    throw Object.assign(new Error('User has no tenant assigned'), { statusCode: 403 });
  }

  // Cognito passes groups as a comma-separated string. Fails closed, like the
  // tenant_id check above — a user with no group assigned gets rejected, not
  // silently defaulted to 'operator' (Multi-Tenant Architecture §2.3).
  const groups = (claims['cognito:groups'] ?? '').split(',').filter(Boolean);
  if (groups.length === 0) {
    throw Object.assign(new Error('User has no role assigned'), { statusCode: 403 });
  }
  const role = groups[0];

  return {
    sub:      claims.sub,
    email:    claims.email ?? '',
    tenantId,
    role,
  };
}

export function requireRole(auth: AuthContext, ...roles: string[]): void {
  if (!roles.includes(auth.role)) {
    throw Object.assign(
      new Error(`Role '${auth.role}' is not permitted — requires: ${roles.join(' | ')}`),
      { statusCode: 403 },
    );
  }
}

// ── Channel Partner Portal auth (Security Architecture §2.4, added v1.1) ──

export interface PartnerAuthContext {
  sub: string;
  email: string;
  channelPartnerId: string;
}

/**
 * Extracts channel-partner identity from a Cognito JWT issued by the
 * separate PartnerPool (infra/lib/auth-stack.ts), not the tenant UserPool
 * getAuth() above reads from. Deliberately does NOT resolve role or
 * channel_partner_user_id here — those come from a channel_partner_users
 * DB lookup in withChannelPartner() (db.ts), since that table is already
 * the source of truth for territory/route scoping and this pool carries no
 * Cognito groups (see auth-stack.ts's PartnerPool comment for why).
 */
export function getPartnerAuth(event: APIGatewayProxyEvent): PartnerAuthContext {
  const claims = event.requestContext.authorizer?.claims as Record<string, string> | undefined;

  if (!claims?.sub) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }

  const channelPartnerId = claims['custom:channel_partner_id'];
  if (!channelPartnerId) {
    throw Object.assign(new Error('User has no channel partner assigned'), { statusCode: 403 });
  }

  return {
    sub:   claims.sub,
    email: claims.email ?? '',
    channelPartnerId,
  };
}

// ── Internal Administration Console auth (Security Architecture §2.5, added v1.2) ──

export type StaffRole = 'superadmin' | 'account_manager';

export interface StaffAuthContext {
  sub: string;
  email: string;
  role: StaffRole;
}

/**
 * Extracts staff identity from a Cognito JWT issued by StaffPool
 * (infra/lib/auth-stack.ts) — the third, separate pool alongside userPool
 * and PartnerPool. Unlike getPartnerAuth() above, role IS read directly off
 * a Cognito group claim here, not resolved via a DB lookup — a deliberate
 * difference from the partner pool's pattern, not an oversight: an admin
 * console request needs to know superadmin-vs-account_manager BEFORE any
 * DB round-trip, since that's what decides whether withStaffActingOnTenant()
 * (db.ts) even needs to check account_assignments at all. Fails closed like
 * getAuth() — no group means no session, never a silent default role.
 */
export function getStaffAuth(event: APIGatewayProxyEvent): StaffAuthContext {
  const claims = event.requestContext.authorizer?.claims as Record<string, string> | undefined;

  if (!claims?.sub) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }

  const groups = (claims['cognito:groups'] ?? '').split(',').filter(Boolean);
  if (groups.length === 0) {
    throw Object.assign(new Error('Staff user has no role assigned'), { statusCode: 403 });
  }
  const role = groups[0];
  if (role !== 'superadmin' && role !== 'account_manager') {
    throw Object.assign(new Error(`Unrecognized staff role '${role}'`), { statusCode: 403 });
  }

  return {
    sub:   claims.sub,
    email: claims.email ?? '',
    role,
  };
}

export function requireStaffRole(auth: StaffAuthContext, ...roles: StaffRole[]): void {
  if (!roles.includes(auth.role)) {
    throw Object.assign(
      new Error(`Role '${auth.role}' is not permitted — requires: ${roles.join(' | ')}`),
      { statusCode: 403 },
    );
  }
}
