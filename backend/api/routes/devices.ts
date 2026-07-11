import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withTenant } from '../../shared/db';
import { ok, created, notFound, badRequest, conflict, parseBody } from '../../shared/response';
import { requireRole } from '../../shared/auth';
import type { AuthContext } from '../../shared/auth';
import type { Device } from '../../shared/types';

export async function list(_event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
  return withTenant(auth.tenantId, async (client) => {
    const { rows } = await client.query<Device>(
      `SELECT d.*, a.name AS asset_name, s.name AS site_name
       FROM devices d
       LEFT JOIN assets  a ON a.id = d.asset_id
       LEFT JOIN sites   s ON s.id = a.site_id
       ORDER BY d.created_at DESC`,
    );
    return ok(rows);
  });
}

export async function getOne(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { deviceId } = event.pathParameters!;
  return withTenant(auth.tenantId, async (client) => {
    const { rows: [device] } = await client.query<Device>(
      `SELECT d.*, a.name AS asset_name, s.name AS site_name
       FROM devices d
       LEFT JOIN assets a ON a.id = d.asset_id
       LEFT JOIN sites  s ON s.id = a.site_id
       WHERE d.id = $1`,
      [deviceId],
    );
    return device ? ok(device) : notFound(`Device ${deviceId} not found`);
  });
}

/**
 * Claim a device by serial number.
 * The device must be in 'provisioning' status and have no tenant yet.
 * Optionally assign directly to an asset.
 */
export async function claim(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const body = parseBody<{ serial: string; assetId?: string }>(event.body, event.isBase64Encoded);

  if (!body.serial?.trim()) return badRequest('serial is required');

  return withTenant(auth.tenantId, async (client) => {
    // Multi-Tenant Architecture v1.1 — devices' unclaimed_lookup RLS policy
    // (docs/data-model.sql) permits seeing an unclaimed (tenant_id IS NULL)
    // device, gated on app.claim_context — set ONLY for this specific
    // lookup, deliberately not left as a marker-less `tenant_id IS NULL`
    // condition (an earlier draft did that, and a permissive policy with no
    // marker OR-combines into EVERY select on the table, not just this
    // call site — would have leaked every unclaimed device into list()/
    // getOne() too; caught on a dedicated pass, fixed before ever
    // deployed). The claim transition below is still tenant-scoped:
    // device_claim's WITH CHECK ties the new tenant_id to
    // app.current_tenant_id (set by withTenant() above) — real
    // defense-in-depth, not just a workaround — a caller can only claim a
    // device into their own tenant, enforced at the database layer, not
    // just trusted from auth.tenantId.
    await client.query("SET LOCAL app.claim_context = 'true'");

    const { rows: [existing] } = await client.query<Device>(
      'SELECT * FROM devices WHERE serial = $1',
      [body.serial.trim().toUpperCase()],
    );

    if (!existing) return notFound(`No device found with serial ${body.serial}`);
    if (existing.status !== 'provisioning') {
      return conflict(`Device ${body.serial} is already claimed (status: ${existing.status})`);
    }
    if (existing.tenant_id) {
      return conflict(`Device ${body.serial} is already assigned to another tenant`);
    }

    const { rows: [device] } = await client.query<Device>(
      `UPDATE devices
       SET tenant_id     = $2,
           asset_id      = $3,
           status        = 'online',
           provisioned_at = now(),
           updated_at    = now()
       WHERE id = $1
       RETURNING *`,
      [existing.id, auth.tenantId, body.assetId ?? null],
    );

    return created(device);
  });
}

export async function update(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
  requireRole(auth, 'admin', 'operator');
  const { deviceId } = event.pathParameters!;
  const body = parseBody<{ assetId?: string | null; firmwareVersion?: string }>(
    event.body, event.isBase64Encoded,
  );

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [device] } = await client.query<Device>(
      `UPDATE devices
       SET asset_id         = COALESCE($2, asset_id),
           firmware_version = COALESCE($3, firmware_version),
           updated_at       = now()
       WHERE id = $1
       RETURNING *`,
      [deviceId, body.assetId, body.firmwareVersion],
    );
    return device ? ok(device) : notFound(`Device ${deviceId} not found`);
  });
}

export async function remove(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
  requireRole(auth, 'admin');
  const { deviceId } = event.pathParameters!;

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [device] } = await client.query<Device>(
      `UPDATE devices SET status = 'decommissioned', updated_at = now() WHERE id = $1 RETURNING *`,
      [deviceId],
    );
    return device ? ok(device) : notFound(`Device ${deviceId} not found`);
  });
}
