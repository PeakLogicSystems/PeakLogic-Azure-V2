import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withTenant } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import { requireRole } from '../../shared/auth';
import type { AuthContext } from '../../shared/auth';
import { registerHub, recordHeartbeat } from '../../shared/hubs-handler';
import { syncForHub } from '../../shared/peakassist-sync-handler';

// PeakLogic Hubs API — thin wiring over the tested handlers (shared/hubs*.ts,
// shared/peakassist-sync-handler.ts). All routes are tenant-scoped: withTenant
// sets app.current_tenant_id so RLS confines every query to the acting tenant.

interface HubRegisterBody {
  siteId: string;
  name: string;
  hardwareSerial?: string | null;
  agentVersion?: string | null;
  protocolConfig?: Record<string, unknown>;
}

interface HubHeartbeatBody {
  agentVersion?: string | null;
  peakassistContentVersion?: string | null;
}

/** GET /v1/hubs — the tenant's Hub fleet. */
export async function list(_event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  return withTenant(auth.tenantId, async (client) => {
    const { rows } = await client.query('SELECT * FROM hubs ORDER BY name');
    return ok(rows);
  });
}

/** POST /v1/hubs — register a Hub for a site (starts provisioning). */
export async function register(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  const body = parseBody<HubRegisterBody>(event.body, event.isBase64Encoded);
  try {
    return await withTenant(auth.tenantId, async (client) => {
      const { id } = await registerHub(client, auth.tenantId, body);
      return created({ id });
    });
  } catch (err) {
    // buildHubRegistration throws on a missing name/site — a client error, not a 500.
    if (err instanceof Error && /hub registration requires/.test(err.message)) return badRequest(err.message);
    throw err;
  }
}

/**
 * POST /v1/hubs/{hubId}/heartbeat — the Hub checks in (flips it online, stamps
 * last_seen, updates versions if reported). No admin role: this is the Hub's
 * own report within its tenant context, the same posture as a device reporting.
 */
export async function heartbeat(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const { hubId } = event.pathParameters!;
  const body = parseBody<HubHeartbeatBody>(event.body, event.isBase64Encoded);
  return withTenant(auth.tenantId, async (client) => {
    const { updated } = await recordHeartbeat(client, hubId, {
      at: new Date(),
      agentVersion: body.agentVersion,
      peakassistContentVersion: body.peakassistContentVersion,
    });
    return updated ? ok({ updated: true }) : notFound(`Hub ${hubId} not found`);
  });
}

/**
 * GET /v1/hubs/{hubId}/peakassist-sync — the Hub polls whether it needs a newer
 * PeakAssist bundle. Uses the content version last reported via heartbeat; if a
 * newer bundle exists, returns it (with its integrity checksum) to install.
 */
export async function peakassistSync(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const { hubId } = event.pathParameters!;
  return withTenant(auth.tenantId, async (client) => {
    const { rows } = await client.query<{ peakassist_content_version: string | null }>(
      'SELECT peakassist_content_version FROM hubs WHERE id = $1',
      [hubId],
    );
    if (rows.length === 0) return notFound(`Hub ${hubId} not found`);
    return ok(await syncForHub(client, rows[0].peakassist_content_version));
  });
}
