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

  // Cognito passes groups as a comma-separated string
  const groups = (claims['cognito:groups'] ?? '').split(',').filter(Boolean);
  const role = groups[0] ?? 'operator';

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
