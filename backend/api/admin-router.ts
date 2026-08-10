import type { PeakRequest, PeakResponse } from '../shared/http';
import type { StaffAuthContext } from '../shared/auth';
import { notFound } from '../shared/response';
import { compileRoutes, matchRoute, type RouteHandler } from './match';
import * as admin from './routes/admin';
import * as tenants from './routes/admin-tenants';
import * as partners from './routes/admin-partners';
import * as staff from './routes/admin-staff';
import * as assignments from './routes/admin-assignments';
import * as tenantActions from './routes/admin-tenant-actions';
import * as cmmsConnectors from './routes/admin-cmms-connectors';

// API Specification §4.7 — the third dispatcher (staff/StaffAuthContext),
// same shape as router.ts / partner-router.ts.
const ADMIN_ROUTES: Record<string, RouteHandler<StaffAuthContext>> = {
  'GET /v1/admin': admin.getSelf,

  'GET /v1/admin/tenants':              tenants.list,
  'POST /v1/admin/tenants':             tenants.create,
  'GET /v1/admin/tenants/{tenantId}':   tenants.getOne,

  'GET /v1/admin/channel-partners':               partners.list,
  'POST /v1/admin/channel-partners':              partners.create,
  'GET /v1/admin/channel-partners/{partnerId}':   partners.getOne,

  'GET /v1/admin/staff-users':  staff.list,
  'POST /v1/admin/staff-users': staff.create,

  'GET /v1/admin/assignments':                    assignments.list,
  'POST /v1/admin/assignments':                   assignments.create,
  'DELETE /v1/admin/assignments/{assignmentId}':  assignments.remove,

  // Acting on a tenant (IA-5.1) — every handler here goes through
  // withStaffActingOnTenant(), not withStaffSession().
  'POST /v1/admin/tenants/{tenantId}/users':                tenantActions.createTenantUser,
  'PUT /v1/admin/tenants/{tenantId}/devices/{deviceId}':    tenantActions.updateDevice,
  'PUT /v1/admin/tenants/{tenantId}/assets/{assetId}':      tenantActions.updateAsset,
  'PUT /v1/admin/tenants/{tenantId}/alerts/{alertId}':      tenantActions.updateAlert,

  // CMMS connector management (reporting-and-kpi-design.md §5, built
  // 2026-08-09 alongside the servicetitan adapter).
  'GET /v1/admin/channel-partners/{partnerId}/cmms-connector': cmmsConnectors.getOne,
  'PUT /v1/admin/channel-partners/{partnerId}/cmms-connector': cmmsConnectors.upsert,
  'PUT /v1/admin/channel-partners/{partnerId}/cmms-tenant-mapping/{tenantId}': cmmsConnectors.setTenantMapping,
  'GET /v1/admin/channel-partners/{partnerId}/cmms-account-records': cmmsConnectors.listAccountRecords,
};

const compiled = compileRoutes(ADMIN_ROUTES);

export async function adminRoute(req: PeakRequest, auth: StaffAuthContext): Promise<PeakResponse> {
  const matched = matchRoute(compiled, req.httpMethod, req.path);
  if (!matched) return notFound(`Route not found: ${req.httpMethod} ${req.path}`);
  return matched.handler({ ...req, pathParameters: matched.pathParameters }, auth);
}
