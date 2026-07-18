import type { PeakRequest, PeakResponse } from '../../shared/http';
import type { PoolClient } from 'pg';
import { withChannelPartner, requirePartnerRole } from '../../shared/db';
import { ok, created, notFound, badRequest, conflict, parseBody } from '../../shared/response';
import type { PartnerAuthContext } from '../../shared/auth';

interface RouteAssignment {
  id: string;
  channel_partner_id: string;
  technician_user_id: string;
  route_date: string;
  source: 'ai_suggested' | 'manual';
  status: 'suggested' | 'confirmed';
  confirmed_by: string | null;
  confirmed_at: string | null;
  generated_at: string;
}

interface RouteStopInput {
  site_id: string;
  sequence_number: number;
}

interface CreateRouteBody {
  technician_user_id: string;
  route_date: string;
  source: 'ai_suggested' | 'manual';
  stops: RouteStopInput[];
}

// API Specification §4.5 — no role-based branching needed here at all:
// route_assignments' channel_partner_isolation RLS policy (Database
// Schema §4.4) already restricts a technician session to their own rows
// and lets a partner_admin see every route under their partner. The same
// query transparently returns "my day" or "the whole team's schedule"
// depending on who's asking.
export async function list(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  const { date, technician_id } = event.queryStringParameters ?? {};

  const conditions: string[] = [];
  const params: string[] = [];
  if (date) { params.push(date); conditions.push(`route_date = $${params.length}`); }
  if (technician_id) { params.push(technician_id); conditions.push(`technician_user_id = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  return withChannelPartner(auth, async (client) => {
    const { rows } = await client.query<RouteAssignment>(
      `SELECT * FROM route_assignments ${where} ORDER BY route_date DESC, generated_at DESC`,
      params,
    );
    return ok(rows);
  });
}

interface RouteStopWithReadings {
  sequence_number: number;
  site_id: string;
  site_name: string;
  readings: Record<string, number>;
  alert_status: 'critical' | 'warning' | 'none';
}

// Per-stop readings are NOT stored on route_stops (Domain Model §2.7's
// "don't duplicate what's derivable" principle) -- queried live via the
// same Site->Asset->Device->Telemetry chain RP-2.1 already uses. Latest
// value per (device, metric) via DISTINCT ON; the worst open alert
// severity across the site's devices, if any.
async function getStopsWithReadings(
  client: PoolClient,
  routeAssignmentId: string,
): Promise<RouteStopWithReadings[]> {
  const { rows } = await client.query<RouteStopWithReadings>(
    `SELECT
       rs.sequence_number,
       rs.site_id,
       s.name AS site_name,
       COALESCE(
         (SELECT jsonb_object_agg(latest.metric, latest.value)
          FROM (
            SELECT DISTINCT ON (t.device_id, t.metric) t.metric, t.value
            FROM telemetry t
            JOIN devices d ON d.id = t.device_id
            JOIN assets  a ON a.id = d.asset_id
            WHERE a.site_id = rs.site_id
            ORDER BY t.device_id, t.metric, t.time DESC
          ) latest
         ), '{}'::jsonb
       ) AS readings,
       COALESCE(
         (SELECT MIN(CASE al.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END)
          FROM alerts al
          JOIN assets a2 ON a2.id = al.asset_id
          WHERE a2.site_id = rs.site_id AND al.status IN ('open', 'acknowledged')
         ), 4
       ) AS alert_rank
     FROM route_stops rs
     JOIN sites s ON s.id = rs.site_id
     WHERE rs.route_assignment_id = $1
     ORDER BY rs.sequence_number`,
    [routeAssignmentId],
  );
  // alert_rank -> alert_status mapping done in JS, not SQL CASE-in-SELECT,
  // to keep the query's own CASE expression (used only for MIN's ordering)
  // simple. Not selected directly above; re-derive from the same query
  // shape here would need a second round-trip, so map the numeric rank
  // already returned instead.
  return (rows as unknown as Array<RouteStopWithReadings & { alert_rank: number }>).map((r) => ({
    sequence_number: r.sequence_number,
    site_id: r.site_id,
    site_name: r.site_name,
    readings: r.readings,
    alert_status: r.alert_rank === 1 ? 'critical' : r.alert_rank === 2 ? 'warning' : 'none',
  }));
}

export async function getOne(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  const { routeId } = event.pathParameters!;

  return withChannelPartner(auth, async (client) => {
    const { rows: [route] } = await client.query<RouteAssignment>(
      'SELECT * FROM route_assignments WHERE id = $1',
      [routeId],
    );
    if (!route) return notFound(`Route ${routeId} not found`);

    const stops = await getStopsWithReadings(client, route.id);
    return ok({ ...route, stops });
  });
}

// Submits a route (AI-suggested or manually built) -- does NOT compute
// one. TR-3.2's "no in-house routing algorithm" boundary (already locked,
// Domain Model §4/PRD §5.10) means the ordering is computed entirely
// outside this system by an external agent consuming the MCP server's
// read tools (API Specification §4.6) and submitted back here as a
// finished list. partner_admin only.
export async function create(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  const body = parseBody<CreateRouteBody>(event.body, event.isBase64Encoded);

  if (!body.technician_user_id) return badRequest('technician_user_id is required');
  if (!body.route_date) return badRequest('route_date is required');
  if (body.source !== 'ai_suggested' && body.source !== 'manual') {
    return badRequest("source must be 'ai_suggested' or 'manual'");
  }
  if (!Array.isArray(body.stops) || body.stops.length === 0) return badRequest('stops must be a non-empty array');

  return withChannelPartner(auth, async (client, session) => {
    requirePartnerRole(session, 'partner_admin');

    await client.query('BEGIN');
    try {
      const { rows: [route] } = await client.query<RouteAssignment>(
        `INSERT INTO route_assignments (channel_partner_id, technician_user_id, route_date, source, status)
         VALUES ($1, $2, $3, $4, 'suggested')
         RETURNING *`,
        [auth.channelPartnerId, body.technician_user_id, body.route_date, body.source],
      );

      for (const stop of body.stops) {
        await client.query(
          `INSERT INTO route_stops (route_assignment_id, site_id, sequence_number) VALUES ($1, $2, $3)`,
          [route.id, stop.site_id, stop.sequence_number],
        );
      }

      await client.query('COMMIT');
      const stops = await getStopsWithReadings(client, route.id);
      return created({ ...route, stops });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}

// Replaces the stop list -- manual adjustment of an AI suggestion before
// confirming, or of a route generally. Rejected once confirmed (API
// Specification §4.5) -- a confirmed route is immutable; re-plan by
// submitting a new one via create().
export async function update(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  const { routeId } = event.pathParameters!;
  const body = parseBody<{ stops: RouteStopInput[] }>(event.body, event.isBase64Encoded);

  if (!Array.isArray(body.stops) || body.stops.length === 0) return badRequest('stops must be a non-empty array');

  return withChannelPartner(auth, async (client, session) => {
    requirePartnerRole(session, 'partner_admin');

    const { rows: [route] } = await client.query<RouteAssignment>(
      'SELECT * FROM route_assignments WHERE id = $1',
      [routeId],
    );
    if (!route) return notFound(`Route ${routeId} not found`);
    if (route.status === 'confirmed') return conflict('A confirmed route is immutable — submit a new route instead');

    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM route_stops WHERE route_assignment_id = $1', [routeId]);
      for (const stop of body.stops) {
        await client.query(
          `INSERT INTO route_stops (route_assignment_id, site_id, sequence_number) VALUES ($1, $2, $3)`,
          [routeId, stop.site_id, stop.sequence_number],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    const stops = await getStopsWithReadings(client, routeId!);
    return ok({ ...route, stops });
  });
}

// TR-3.1's "advisory only" requirement made concrete as an actual state
// transition, not just a status label nobody checks -- a suggested route
// has no operational effect until this call. partner_admin only.
export async function confirm(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  const { routeId } = event.pathParameters!;

  return withChannelPartner(auth, async (client, session) => {
    requirePartnerRole(session, 'partner_admin');

    const { rows: [route] } = await client.query<RouteAssignment>(
      `UPDATE route_assignments
       SET status = 'confirmed', confirmed_by = $2, confirmed_at = now()
       WHERE id = $1 AND status = 'suggested'
       RETURNING *`,
      [routeId, session.channelPartnerUserId],
    );
    return route ? ok(route) : notFound(`Route ${routeId} not found, or already confirmed`);
  });
}
