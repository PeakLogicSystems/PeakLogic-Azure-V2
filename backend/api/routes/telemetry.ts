import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withTenant } from '../../shared/db';
import { ok, badRequest } from '../../shared/response';
import type { AuthContext } from '../../shared/auth';
import type { TelemetryPoint } from '../../shared/types';

/**
 * GET /v1/telemetry?deviceId=&metric=&from=&to=&limit=
 *
 * Returns time-series data for a device/metric window.
 * Used by the dashboard line charts.
 */
export async function list(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const p = event.queryStringParameters ?? {};

  if (!p.deviceId) return badRequest('deviceId query param is required');

  const metric = p.metric;                              // optional — all metrics if omitted
  const from   = p.from   ? new Date(p.from)   : new Date(Date.now() - 24 * 60 * 60_000);
  const to     = p.to     ? new Date(p.to)     : new Date();
  const limit  = Math.min(parseInt(p.limit ?? '1000'), 5000);

  return withTenant(auth.tenantId, async (client) => {
    const params: unknown[] = [p.deviceId, from, to, limit];
    const metricClause = metric ? `AND metric = $${params.push(metric)}` : '';

    const { rows } = await client.query<TelemetryPoint>(
      `SELECT time, device_id, metric, value, quality
       FROM telemetry
       WHERE device_id = $1
         AND time >= $2
         AND time <= $3
         ${metricClause}
       ORDER BY time ASC
       LIMIT $4`,
      params,
    );
    return ok(rows);
  });
}
