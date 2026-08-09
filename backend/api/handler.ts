import type { HttpRequest } from '@azure/functions';
import { getAuth, getPartnerAuth, getStaffAuth } from '../shared/auth';
import { serverError, forbidden, badRequest } from '../shared/response';
import { toPeakRequest, type PeakResponse } from '../shared/http';
import { isDirectBackendCallAllowed } from '../shared/apim-guard';
import { extractOrCreateCorrelationId, getCorrelationId, withCorrelationId } from '../shared/correlation';
import { route } from './router';
import { partnerRoute } from './partner-router';
import { adminRoute } from './admin-router';

// Water-Sector Security Hardening Strategy §5 Tier 0.5 — checked before
// anything else, including auth: apim.bicep's rate limit can be bypassed
// entirely by a caller who discovers the Function App's raw hostname
// (Consumption-tier APIM has no static outbound IP to lock the backend to —
// see apim.bicep's own header comment). Not enforced until
// APIM_SHARED_SECRET is actually configured for this stage — see
// shared/apim-guard.ts's header comment for why that's the right default,
// not a silent gap.
const APIM_SHARED_SECRET_HEADER = 'x-peaklogic-apim-secret';

// The API orchestrator — cloud-boundary logic only. Branches by path,
// validates the Entra token via the correct tenant's get*Auth() (each now
// async, since this fork validates the JWT itself rather than relying on an
// API-Gateway-Cognito authorizer to inject claims — Security Architecture
// §2.1), and dispatches to one of three routers. Same three-way branch as
// the AWS version; the difference is that auth is now `await`ed and reads
// the raw HttpRequest (for the Authorization header), while the routers get
// the normalized PeakRequest.
export async function handleApiRequest(request: HttpRequest): Promise<PeakResponse> {
  if (!isDirectBackendCallAllowed(request.headers.get(APIM_SHARED_SECRET_HEADER), process.env.APIM_SHARED_SECRET)) {
    return forbidden();
  }

  // Architecture-review Gap 13 — one correlation ID per request, available
  // to every writeAuditLog() call in this request's async call chain (see
  // shared/correlation.ts), and echoed back below so a caller (or a support
  // ticket quoting it) can find this exact request's audit trail/logs later.
  const correlationId = extractOrCreateCorrelationId(request);
  const res = await withCorrelationId(correlationId, () => handleRoutedRequest(request));
  // A NEW object, never a mutation of res.headers — response.ts's json()
  // helper returns the SAME shared CORS_HEADERS object reference on every
  // call; mutating it here would leak one request's correlation id into
  // every other concurrent request's response.
  return { ...res, headers: { ...res.headers, 'x-correlation-id': correlationId } };
}

async function handleRoutedRequest(request: HttpRequest): Promise<PeakResponse> {
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
      console.error(`Unhandled error [correlationId=${getCorrelationId()}]`, err.message, err.stack);
    }
    return serverError();
  }
}
