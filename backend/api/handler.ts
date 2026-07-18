import type { HttpRequest } from '@azure/functions';
import { getAuth, getPartnerAuth, getStaffAuth } from '../shared/auth';
import { serverError, forbidden, badRequest } from '../shared/response';
import { toPeakRequest, type PeakResponse } from '../shared/http';
import { route } from './router';
import { partnerRoute } from './partner-router';
import { adminRoute } from './admin-router';

// The API orchestrator — cloud-boundary logic only. Branches by path,
// validates the Entra token via the correct tenant's get*Auth() (each now
// async, since this fork validates the JWT itself rather than relying on an
// API-Gateway-Cognito authorizer to inject claims — Security Architecture
// §2.1), and dispatches to one of three routers. Same three-way branch as
// the AWS version; the difference is that auth is now `await`ed and reads
// the raw HttpRequest (for the Authorization header), while the routers get
// the normalized PeakRequest.
export async function handleApiRequest(request: HttpRequest): Promise<PeakResponse> {
  try {
    const req = await toPeakRequest(request);

    if (req.path.startsWith('/v1/partner')) {
      const partnerAuth = await getPartnerAuth(request);
      return await partnerRoute(req, partnerAuth);
    }
    if (req.path.startsWith('/v1/admin')) {
      const staffAuth = await getStaffAuth(request);
      return await adminRoute(req, staffAuth);
    }
    const auth = await getAuth(request);
    return await route(req, auth);
  } catch (err: unknown) {
    if (err instanceof Error) {
      const status = (err as Error & { statusCode?: number }).statusCode;
      if (status === 401 || status === 403) return forbidden(err.message);
      if (status === 400) return badRequest(err.message);
      console.error('Unhandled error', err.message, err.stack);
    }
    return serverError();
  }
}
