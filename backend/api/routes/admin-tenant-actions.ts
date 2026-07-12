import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { withStaffActingOnTenant } from '../../shared/db';
import { writeAuditLog } from '../../shared/audit';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import type { StaffAuthContext } from '../../shared/auth';
import type { Alert, Asset, Device, User } from '../../shared/types';

// API Specification §4.7 — IA-5. Every handler below reuses the exact same
// query shape the tenant-side route already runs (devices.ts's update(),
// assets.ts's update(), alerts.ts's update()) rather than reimplementing
// "how to update a device"/"how to update an asset" a second time — the
// only difference is withStaffActingOnTenant(auth, tenantId, fn) in place
// of withTenant(auth.tenantId, fn), and an audit-log write per IA-7.1 (the
// tenant-side routes don't audit-log every write yet themselves; staff
// actions on someone else's tenant are held to a stricter bar here on
// purpose — a staff member's cross-tenant write is exactly the kind of
// action a tenant admin reviewing their own audit log most needs visible).

interface CreateTenantUserBody {
  email: string;
  display_name?: string;
  role: 'admin' | 'operator';
}

const cognito = new CognitoIdentityProviderClient({});

// POST /v1/admin/tenants/{tenantId}/users — same non-atomicity disclosure
// as POST /v1/partner/users and POST /v1/admin/staff-users (API
// Specification §7 items 6/8): Cognito account + DB row, not transactional
// across the two systems.
export async function createTenantUser(event: APIGatewayProxyEvent, auth: StaffAuthContext): Promise<APIGatewayProxyResult> {
  const { tenantId } = event.pathParameters! as Record<string, string>;
  const body = parseBody<CreateTenantUserBody>(event.body, event.isBase64Encoded);

  if (!body.email?.trim()) return badRequest('email is required');
  if (body.role !== 'admin' && body.role !== 'operator') {
    return badRequest("role must be 'admin' or 'operator'");
  }

  return withStaffActingOnTenant(auth, tenantId, async (client, session) => {
    const cognitoResult = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: body.email.trim(),
      UserAttributes: [
        { Name: 'email', Value: body.email.trim() },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'custom:tenant_id', Value: tenantId },
        ...(body.display_name ? [{ Name: 'name', Value: body.display_name }] : []),
      ],
      MessageAction: 'SUPPRESS',
    }));

    const cognitoSub = cognitoResult.User?.Attributes?.find(a => a.Name === 'sub')?.Value;
    if (!cognitoSub) {
      throw Object.assign(new Error('Cognito did not return a user sub'), { statusCode: 500 });
    }

    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: body.email.trim(),
      GroupName: body.role,
    }));

    const { rows: [user] } = await client.query<User>(
      `INSERT INTO users (tenant_id, cognito_sub, email, display_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tenant_id, cognito_sub, email, display_name, role, status, clock_format, timezone, theme, created_at`,
      [tenantId, cognitoSub, body.email.trim(), body.display_name ?? null, body.role],
    );

    await writeAuditLog(client, {
      scope: 'tenant',
      tenantId,
      actorId: null,
      actorStaffUserId: session.staffUserId,
      action: 'user.create',
      targetEntity: 'user',
      targetId: user.id,
      newValue: { email: user.email, role: user.role },
    });

    return created(user);
  });
}

export async function updateDevice(event: APIGatewayProxyEvent, auth: StaffAuthContext): Promise<APIGatewayProxyResult> {
  const { tenantId, deviceId } = event.pathParameters! as Record<string, string>;
  const body = parseBody<{ assetId?: string | null; firmwareVersion?: string }>(event.body, event.isBase64Encoded);

  return withStaffActingOnTenant(auth, tenantId, async (client, session) => {
    const { rows: [device] } = await client.query<Device>(
      `UPDATE devices
       SET asset_id         = COALESCE($2, asset_id),
           firmware_version = COALESCE($3, firmware_version),
           updated_at       = now()
       WHERE id = $1
       RETURNING *`,
      [deviceId, body.assetId, body.firmwareVersion],
    );
    if (!device) return notFound(`Device ${deviceId} not found`);

    await writeAuditLog(client, {
      scope: 'tenant', tenantId, actorId: null, actorStaffUserId: session.staffUserId,
      action: 'device.update', targetEntity: 'device', targetId: device.id, newValue: body,
    });
    return ok(device);
  });
}

export async function updateAsset(event: APIGatewayProxyEvent, auth: StaffAuthContext): Promise<APIGatewayProxyResult> {
  const { tenantId, assetId } = event.pathParameters! as Record<string, string>;
  const body = parseBody<Partial<{ name: string; category: string; make: string; model: string; serial_number: string; specs: Asset['specs'] }>>(
    event.body, event.isBase64Encoded,
  );

  return withStaffActingOnTenant(auth, tenantId, async (client, session) => {
    const { rows: [asset] } = await client.query<Asset>(
      `UPDATE assets
       SET name          = COALESCE($2, name),
           category      = COALESCE($3, category),
           make          = COALESCE($4, make),
           model         = COALESCE($5, model),
           serial_number = COALESCE($6, serial_number),
           specs         = COALESCE($7::jsonb, specs),
           updated_at    = now()
       WHERE id = $1
       RETURNING *`,
      [assetId, body.name, body.category, body.make, body.model, body.serial_number,
       body.specs ? JSON.stringify(body.specs) : null],
    );
    if (!asset) return notFound(`Asset ${assetId} not found`);

    await writeAuditLog(client, {
      scope: 'tenant', tenantId, actorId: null, actorStaffUserId: session.staffUserId,
      action: 'asset.update', targetEntity: 'asset', targetId: asset.id, newValue: body,
    });
    return ok(asset);
  });
}

export async function updateAlert(event: APIGatewayProxyEvent, auth: StaffAuthContext): Promise<APIGatewayProxyResult> {
  const { tenantId, alertId } = event.pathParameters! as Record<string, string>;
  const body = parseBody<{ status: Alert['status'] }>(event.body, event.isBase64Encoded);

  const allowed: Alert['status'][] = ['acknowledged', 'resolved', 'suppressed'];
  if (!allowed.includes(body.status)) {
    return badRequest(`status must be one of: ${allowed.join(', ')}`);
  }

  return withStaffActingOnTenant(auth, tenantId, async (client, session) => {
    const { rows: [alert] } = await client.query<Alert>(
      `UPDATE alerts
       SET status          = $2,
           acknowledged_at = CASE WHEN $2 = 'acknowledged' THEN now() ELSE acknowledged_at END,
           resolved_at     = CASE WHEN $2 = 'resolved'     THEN now() ELSE resolved_at     END
       WHERE id = $1
       RETURNING *`,
      [alertId, body.status],
    );
    if (!alert) return notFound(`Alert ${alertId} not found`);

    await writeAuditLog(client, {
      scope: 'tenant', tenantId, actorId: null, actorStaffUserId: session.staffUserId,
      action: 'alert.update', targetEntity: 'alert', targetId: alert.id, newValue: { status: body.status },
    });
    return ok(alert);
  });
}
