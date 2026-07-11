import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAuth, getPartnerAuth } from '../shared/auth';
import { serverError, forbidden } from '../shared/response';
import { route } from './router';
import { partnerRoute } from './partner-router';

// API Specification §4.5 (added v1.1) — a single Lambda, branching by path,
// same pattern as every other route dispatch decision in this codebase
// (router.ts's own METHOD+resource key lookup). Partner requests arrive
// through a completely separate Cognito authorizer (PartnerPool, Security
// Architecture §2.4) and need a different auth-context shape
// (PartnerAuthContext, not AuthContext) — kept as two parallel dispatchers
// rather than one dispatcher with a union type, so each stays as simple as
// the single-pool version was.
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (event.resource.startsWith('/v1/partner')) {
      const partnerAuth = getPartnerAuth(event);
      return await partnerRoute(event, partnerAuth);
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
