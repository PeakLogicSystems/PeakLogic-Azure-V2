import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withTenant } from '../../shared/db';
import { ok, notFound, badRequest, parseBody } from '../../shared/response';
import { writeAuditLog } from '../../shared/audit';
import type { AuthContext } from '../../shared/auth';
import type { Alert } from '../../shared/types';

export async function list(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const status = event.queryStringParameters?.status;   // e.g. ?status=open
  const assetId = event.queryStringParameters?.assetId;

  return withTenant(auth.tenantId, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) { params.push(status);   conditions.push(`a.status = $${params.length}`); }
    if (assetId) { params.push(assetId); conditions.push(`a.asset_id = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await client.query<Alert>(
      `SELECT a.*, d.serial AS device_serial, ast.name AS asset_name
       FROM alerts a
       LEFT JOIN devices d ON d.id = a.device_id
       LEFT JOIN assets ast ON ast.id = a.asset_id
       ${where}
       ORDER BY a.triggered_at DESC
       LIMIT 200`,
      params,
    );
    return ok(rows);
  });
}

export async function getOne(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const { alertId } = event.pathParameters!;
  return withTenant(auth.tenantId, async (client) => {
    const { rows: [alert] } = await client.query<Alert>(
      'SELECT * FROM alerts WHERE id = $1',
      [alertId],
    );
    return alert ? ok(alert) : notFound(`Alert ${alertId} not found`);
  });
}

export async function update(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const { alertId } = event.pathParameters!;
  const body = parseBody<{ status: Alert['status'] }>(event.body, event.isBase64Encoded);

  const allowed: Alert['status'][] = ['acknowledged', 'resolved', 'suppressed'];
  if (!allowed.includes(body.status)) {
    return badRequest(`status must be one of: ${allowed.join(', ')}`);
  }

  return withTenant(auth.tenantId, async (client) => {
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
      scope: 'tenant', tenantId: auth.tenantId, actorId: auth.sub,
      action: 'alert.update', targetEntity: 'alert', targetId: alert.id, newValue: { status: body.status },
    });
    return ok(alert);
  });
}
