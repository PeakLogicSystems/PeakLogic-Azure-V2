import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withTenant } from '../../shared/db';
import { ok, created, notFound, parseBody } from '../../shared/response';
import { requireRole } from '../../shared/auth';
import type { AuthContext } from '../../shared/auth';
import type { Site } from '../../shared/types';

interface SiteBody {
  name: string;
  type: Site['type'];
  address?: Record<string, string>;
  lat?: number;
  lng?: number;
  timezone?: string;
  metadata?: Record<string, unknown>;
}

export async function list(_event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  return withTenant(auth.tenantId, async (client) => {
    const { rows } = await client.query<Site>(
      'SELECT * FROM sites ORDER BY name',
    );
    return ok(rows);
  });
}

export async function getOne(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const { siteId } = event.pathParameters!;
  return withTenant(auth.tenantId, async (client) => {
    const { rows: [site] } = await client.query<Site>(
      'SELECT * FROM sites WHERE id = $1',
      [siteId],
    );
    return site ? ok(site) : notFound(`Site ${siteId} not found`);
  });
}

export async function create(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  const body = parseBody<SiteBody>(event.body, event.isBase64Encoded);

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [site] } = await client.query<Site>(
      `INSERT INTO sites (tenant_id, name, type, address, lat, lng, timezone, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        auth.tenantId,
        body.name,
        body.type,
        body.address ?? null,
        body.lat ?? null,
        body.lng ?? null,
        body.timezone ?? 'UTC',
        body.metadata ?? {},
      ],
    );
    return created(site);
  });
}

export async function update(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin', 'operator');
  const { siteId } = event.pathParameters!;
  const body = parseBody<Partial<SiteBody>>(event.body, event.isBase64Encoded);

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [site] } = await client.query<Site>(
      `UPDATE sites
       SET name     = COALESCE($2, name),
           type     = COALESCE($3, type),
           address  = COALESCE($4, address),
           lat      = COALESCE($5, lat),
           lng      = COALESCE($6, lng),
           timezone = COALESCE($7, timezone),
           metadata = COALESCE($8, metadata),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [siteId, body.name, body.type, body.address, body.lat, body.lng, body.timezone, body.metadata],
    );
    return site ? ok(site) : notFound(`Site ${siteId} not found`);
  });
}

export async function remove(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  const { siteId } = event.pathParameters!;

  return withTenant(auth.tenantId, async (client) => {
    const { rowCount } = await client.query(
      'DELETE FROM sites WHERE id = $1',
      [siteId],
    );
    return rowCount ? ok({ deleted: true }) : notFound(`Site ${siteId} not found`);
  });
}
