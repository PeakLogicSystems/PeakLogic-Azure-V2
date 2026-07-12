import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAuth, getPartnerAuth, getStaffAuth } from '../shared/auth';
import { serverError, forbidden } from '../shared/response';
import { route } from './router';
import { partnerRoute } from './partner-router';
import { adminRoute } from './admin-router';

// API Specification §4.5/§4.7 — a single Lambda, branching by path, same
// pattern as every other route dispatch decision in this codebase
// (router.ts's own METHOD+resource key lookup). Partner and admin requests
// each arrive through their own separate Cognito authorizer (PartnerPool,
// StaffPool — Security Architecture §2.4/§2.5) and need a different
// auth-context shape (PartnerAuthContext/StaffAuthContext, not
// AuthContext) — kept as three parallel dispatchers rather than one
// dispatcher with a union type, so each stays as simple as the
// single-pool version was.
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (event.resource.startsWith('/v1/partner')) {
      const partnerAuth = getPartnerAuth(event);
      return await partnerRoute(event, partnerAuth);
    }
    if (event.resource.startsWith('/v1/admin')) {
      const staffAuth = getStaffAuth(event);
      return await adminRoute(event, staffAuth);
    }
    const auth = getAuth(event);
    return await route(event, auth);
  } catch (err: unknown) {
    if (err instanceof Error) {
      const status = (err as Error & { statusCode?: number }).statusCode;
      if (status === 401 || status === 403) return forbidden(err.message);
      if (status === 400) {
        return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: err.message }) };
      }
      console.error('Unhandled error', err.message, err.stack);
    }
    return serverError();
  }
};
