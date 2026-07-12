import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { StaffAuthContext } from '../shared/auth';
import { notFound } from '../shared/response';
import * as admin from './routes/admin';
import * as tenants from './routes/admin-tenants';
import * as partners from './routes/admin-partners';
import * as staff from './routes/admin-staff';
import * as assignments from './routes/admin-assignments';
import * as tenantActions from './routes/admin-tenant-actions';

// API Specification §4.7 — mirrors router.ts/partner-router.ts's exact
// shape (METHOD+resource key lookup), kept as a third separate dispatcher
// since admin handlers take a StaffAuthContext, not AuthContext/
// PartnerAuthContext (backend/api/handler.ts routes to one of the three by
// path prefix before any dispatcher is called).
type AdminRouteHandler = (
  event: APIGatewayProxyEvent,
  auth: StaffAuthContext,
) => Promise<APIGatewayProxyResult>;

const ADMIN_ROUTES: Record<string, AdminRouteHandler> = {
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
};

export async function adminRoute(
  event: APIGatewayProxyEvent,
  auth: StaffAuthContext,
): Promise<APIGatewayProxyResult> {
  const key = `${event.httpMethod} ${event.resource}`;
  const handler = ADMIN_ROUTES[key];
  if (!handler) return notFound(`Route not found: ${key}`);
  return handler(event, auth);
}
