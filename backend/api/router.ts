import type { PeakRequest, PeakResponse } from '../shared/http';
import type { AuthContext } from '../shared/auth';
import { notFound } from '../shared/response';
import { compileRoutes, matchRoute, type RouteHandler } from './match';
import * as sites     from './routes/sites';
import * as assets    from './routes/assets';
import * as devices   from './routes/devices';
import * as alerts    from './routes/alerts';
import * as tickets   from './routes/tickets';
import * as telemetry from './routes/telemetry';
import * as settings from './routes/settings';
import * as settingsTeam from './routes/settings-team';
import * as hubs from './routes/hubs';
import * as peakview360 from './routes/peakview360';

// Key format: "METHOD /resource/path/template" — unchanged from the AWS
// version. The matcher (api/match.ts) resolves these templates against the
// actual request path (Azure Functions has no API-Gateway resource-template
// injection).
const ROUTES: Record<string, RouteHandler<AuthContext>> = {
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

  // Tickets / work orders
  'GET /v1/tickets':                tickets.list,
  'POST /v1/tickets':               tickets.create,
  'GET /v1/tickets/funnel':         tickets.funnel,           // literal — matched before {ticketId}
  'GET /v1/tickets/{ticketId}':     tickets.getOne,
  'PUT /v1/tickets/{ticketId}':     tickets.update,
  'DELETE /v1/tickets/{ticketId}':  tickets.remove,
  'POST /v1/tickets/{ticketId}/advance': tickets.advance,     // CMMS funnel advance + service_visit

  // PeakLogic Hubs (Domain Model §2.11)
  'GET /v1/hubs':                          hubs.list,
  'POST /v1/hubs':                         hubs.register,
  'POST /v1/hubs/{hubId}/heartbeat':       hubs.heartbeat,
  'GET /v1/hubs/{hubId}/peakassist-sync':  hubs.peakassistSync,

  // PeakView360 HMI configuration (Domain Model §2.10)
  'GET /v1/hmi-screens': peakview360.listScreens,
  'GET /v1/tags':        peakview360.listTags,

  // Telemetry (read-only from API; writes come via IoT Hub)
  'GET /v1/telemetry': telemetry.list,

  // Settings & Preferences (API Specification §4.8)
  'GET /v1/settings':          settings.getSettings,
  'PUT /v1/settings':          settings.updateSettings,
  'PUT /v1/settings/password': settings.changePassword,
  'GET /v1/settings/mfa':      settings.getMfaStatus,

  'GET /v1/settings/team':               settingsTeam.list,
  'POST /v1/settings/team':              settingsTeam.create,
  'PUT /v1/settings/team/{userId}':      settingsTeam.update,
  'DELETE /v1/settings/team/{userId}':   settingsTeam.remove,
};

const compiled = compileRoutes(ROUTES);

export async function route(req: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const matched = matchRoute(compiled, req.httpMethod, req.path);
  if (!matched) return notFound(`Route not found: ${req.httpMethod} ${req.path}`);
  return matched.handler({ ...req, pathParameters: matched.pathParameters }, auth);
}
