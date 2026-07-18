import type { PeakRequest, PeakResponse } from '../shared/http';
import type { PartnerAuthContext } from '../shared/auth';
import { notFound } from '../shared/response';
import { compileRoutes, matchRoute, type RouteHandler } from './match';
import * as partner from './routes/partner';
import * as territories from './routes/partner-territories';
import * as users from './routes/partner-users';
import * as routes from './routes/partner-routes';

// API Specification §4.5 — mirrors router.ts exactly, kept a separate
// dispatcher/type since partner handlers take a PartnerAuthContext
// (handler.ts routes to one of the three dispatchers by path prefix).
const PARTNER_ROUTES: Record<string, RouteHandler<PartnerAuthContext>> = {
  'GET /v1/partner':          partner.getSelf,
  'PUT /v1/partner/branding': partner.updateBranding,

  'GET /v1/partner/territories':                  territories.list,
  'POST /v1/partner/territories':                 territories.create,
  'GET /v1/partner/territories/{territoryId}':    territories.getOne,
  'PUT /v1/partner/territories/{territoryId}':    territories.update,
  'DELETE /v1/partner/territories/{territoryId}': territories.remove,

  'GET /v1/partner/users':          users.list,
  'POST /v1/partner/users':         users.create,
  'GET /v1/partner/users/{userId}': users.getOne,
  'PUT /v1/partner/users/{userId}': users.update,
  'DELETE /v1/partner/users/{userId}': users.remove,

  'GET /v1/partner/routes':                routes.list,
  'POST /v1/partner/routes':               routes.create,
  'GET /v1/partner/routes/{routeId}':      routes.getOne,
  'PUT /v1/partner/routes/{routeId}':      routes.update,
  'POST /v1/partner/routes/{routeId}/confirm': routes.confirm,
};

const compiled = compileRoutes(PARTNER_ROUTES);

export async function partnerRoute(req: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  const matched = matchRoute(compiled, req.httpMethod, req.path);
  if (!matched) return notFound(`Route not found: ${req.httpMethod} ${req.path}`);
  return matched.handler({ ...req, pathParameters: matched.pathParameters }, auth);
}
