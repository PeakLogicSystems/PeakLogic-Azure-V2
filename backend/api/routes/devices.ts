import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withTenant, getPool } from '../../shared/db';
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

  // Use unscoped pool to find the device before it's claimed (has no tenant_id yet)
  const pool = await getPool();

  const { rows: [existing] } = await pool.query<Device>(
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

  const { rows: [device] } = await pool.query<Device>(
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
