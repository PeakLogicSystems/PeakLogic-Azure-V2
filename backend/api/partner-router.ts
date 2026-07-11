import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { PartnerAuthContext } from '../shared/auth';
import { notFound } from '../shared/response';
import * as partner from './routes/partner';
import * as territories from './routes/partner-territories';
import * as users from './routes/partner-users';
import * as routes from './routes/partner-routes';

// API Specification §4.5 — mirrors router.ts's exact shape (METHOD+resource
// key lookup), kept as a separate dispatcher/type rather than merged into
// router.ts's ROUTES map, since partner handlers take a PartnerAuthContext,
// not an AuthContext (backend/api/handler.ts routes to one or the other by
// path before either dispatcher is ever called).
type PartnerRouteHandler = (
  event: APIGatewayProxyEvent,
  auth: PartnerAuthContext,
) => Promise<APIGatewayProxyResult>;

const PARTNER_ROUTES: Record<string, PartnerRouteHandler> = {
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

export async function partnerRoute(
  event: APIGatewayProxyEvent,
  auth: PartnerAuthContext,
): Promise<APIGatewayProxyResult> {
  const key = `${event.httpMethod} ${event.resource}`;
  const handler = PARTNER_ROUTES[key];
  if (!handler) return notFound(`Route not found: ${key}`);
  return handler(event, auth);
}
