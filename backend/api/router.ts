import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { AuthContext } from '../shared/auth';
import { notFound } from '../shared/response';
import * as sites     from './routes/sites';
import * as assets    from './routes/assets';
import * as devices   from './routes/devices';
import * as alerts    from './routes/alerts';
import * as tickets   from './routes/tickets';
import * as telemetry from './routes/telemetry';

type RouteHandler = (
  event: APIGatewayProxyEvent,
  auth: AuthContext,
) => Promise<APIGatewayProxyResult>;

// Key format: "METHOD /resource/path/template"
// Matches event.httpMethod + event.resource from API Gateway
const ROUTES: Record<string, RouteHandler> = {
  // Sites
  'GET /v1/sites':              sites.list,
  'POST /v1/sites':             sites.create,
  'GET /v1/sites/{siteId}':     sites.getOne,
  'PUT /v1/sites/{siteId}':     sites.update,
  'DELETE /v1/sites/{siteId}':  sites.remove,

  // Assets
  'GET /v1/assets':               assets.list,
  'POST /v1/assets':              assets.create,
  'GET /v1/assets/{assetId}':     assets.getOne,
  'PUT /v1/assets/{assetId}':     assets.update,
  'DELETE /v1/assets/{assetId}':  assets.remove,

  // Devices
  'GET /v1/devices':                devices.list,
  'POST /v1/devices':               devices.claim,
  'GET /v1/devices/{deviceId}':     devices.getOne,
  'PUT /v1/devices/{deviceId}':     devices.update,
  'DELETE /v1/devices/{deviceId}':  devices.remove,

  // Alerts
  'GET /v1/alerts':               alerts.list,
  'GET /v1/alerts/{alertId}':     alerts.getOne,
  'PUT /v1/alerts/{alertId}':     alerts.update,

  // Tickets
  'GET /v1/tickets':                tickets.list,
  'POST /v1/tickets':               tickets.create,
  'GET /v1/tickets/{ticketId}':     tickets.getOne,
  'PUT /v1/tickets/{ticketId}':     tickets.update,
  'DELETE /v1/tickets/{ticketId}':  tickets.remove,

  // Telemetry (read-only from API; writes come via IoT Core)
  'GET /v1/telemetry': telemetry.list,
};

export async function route(
  event: APIGatewayProxyEvent,
  auth: AuthContext,
): Promise<APIGatewayProxyResult> {
  const key = `${event.httpMethod} ${event.resource}`;
  const handler = ROUTES[key];
  if (!handler) return notFound(`Route not found: ${key}`);
  return handler(event, auth);
}
