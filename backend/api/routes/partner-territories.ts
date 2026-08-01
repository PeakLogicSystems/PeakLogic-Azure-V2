import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withChannelPartner, requirePartnerRole } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import { writeAuditLog } from '../../shared/audit';
import type { PartnerAuthContext } from '../../shared/auth';

// API Specification §4.5 — boundary is accepted/returned as GeoJSON, not
// raw WKT (matches Mapbox GL Draw's native format, the locked map
// technology — project-peaklogic-channel-partner-portal memory). Converted
// at the API boundary via ST_GeomFromGeoJSON/ST_AsGeoJSON — Database Schema
// owns the storage type (GEOGRAPHY(POLYGON, 4326)), this document owns the
// wire shape.
interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface Territory {
  id: string;
  channel_partner_id: string;
  name: string;
  boundary: GeoJsonPolygon;
}

interface TerritoryBody {
  name: string;
  boundary: GeoJsonPolygon;
}

export async function list(_event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  return withChannelPartner(auth, async (client) => {
    const { rows } = await client.query<Territory>(
      `SELECT id, channel_partner_id, name, ST_AsGeoJSON(boundary)::json AS boundary
       FROM territories ORDER BY name`,
    );
    return ok(rows);
  });
}

export async function getOne(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  const { territoryId } = event.pathParameters!;
  return withChannelPartner(auth, async (client) => {
    const { rows: [territory] } = await client.query<Territory>(
      `SELECT id, channel_partner_id, name, ST_AsGeoJSON(boundary)::json AS boundary
       FROM territories WHERE id = $1`,
      [territoryId],
    );
    return territory ? ok(territory) : notFound(`Territory ${territoryId} not found`);
  });
}

export async function create(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  const body = parseBody<TerritoryBody>(event.body, event.isBase64Encoded);
  if (!body.name?.trim()) return badRequest('name is required');
  if (body.boundary?.type !== 'Polygon') return badRequest('boundary must be a GeoJSON Polygon');

  return withChannelPartner(auth, async (client, session) => {
    requirePartnerRole(session, 'partner_admin');

    const { rows: [territory] } = await client.query<Territory>(
      `INSERT INTO territories (channel_partner_id, name, boundary)
       VALUES ($1, $2, ST_GeomFromGeoJSON($3)::geography)
       RETURNING id, channel_partner_id, name, ST_AsGeoJSON(boundary)::json AS boundary`,
      [auth.channelPartnerId, body.name.trim(), JSON.stringify(body.boundary)],
    );

    await writeAuditLog(client, {
      scope: 'channel_partner', channelPartnerId: auth.channelPartnerId, actorChannelPartnerUserId: session.channelPartnerUserId,
      action: 'territory.create', targetEntity: 'territory', targetId: territory.id, newValue: { name: territory.name },
    });
    return created(territory);
  });
}

export async function update(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  const { territoryId } = event.pathParameters!;
  const body = parseBody<Partial<TerritoryBody>>(event.body, event.isBase64Encoded);
  if (body.boundary && body.boundary.type !== 'Polygon') return badRequest('boundary must be a GeoJSON Polygon');

  return withChannelPartner(auth, async (client, session) => {
    requirePartnerRole(session, 'partner_admin');

    const { rows: [territory] } = await client.query<Territory>(
      `UPDATE territories
       SET name       = COALESCE($2, name),
           boundary   = COALESCE(ST_GeomFromGeoJSON($3)::geography, boundary),
           updated_at = now()
       WHERE id = $1
       RETURNING id, channel_partner_id, name, ST_AsGeoJSON(boundary)::json AS boundary`,
      [territoryId, body.name?.trim() ?? null, body.boundary ? JSON.stringify(body.boundary) : null],
    );
    if (!territory) return notFound(`Territory ${territoryId} not found`);

    await writeAuditLog(client, {
      scope: 'channel_partner', channelPartnerId: auth.channelPartnerId, actorChannelPartnerUserId: session.channelPartnerUserId,
      action: 'territory.update', targetEntity: 'territory', targetId: territory.id, newValue: body,
    });
    return ok(territory);
  });
}

export async function remove(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  const { territoryId } = event.pathParameters!;

  return withChannelPartner(auth, async (client, session) => {
    requirePartnerRole(session, 'partner_admin');

    const { rows: [territory] } = await client.query<Territory>(
      'DELETE FROM territories WHERE id = $1 RETURNING id',
      [territoryId],
    );
    if (!territory) return notFound(`Territory ${territoryId} not found`);

    await writeAuditLog(client, {
      scope: 'channel_partner', channelPartnerId: auth.channelPartnerId, actorChannelPartnerUserId: session.channelPartnerUserId,
      action: 'territory.delete', targetEntity: 'territory', targetId: territory.id,
    });
    return ok(territory);
  });
}
