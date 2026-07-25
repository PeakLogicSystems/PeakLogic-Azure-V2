import type { PoolClient } from 'pg';
import { buildHubRegistration, applyHeartbeat, type HubRegistrationInput, type HubHeartbeatReport } from './hubs';

// Accept a PoolClient or a plain pg Client — same convention as cmms/dispatch.ts.
type Queryable = Pick<PoolClient, 'query'>;

/**
 * Register a Hub for a site. Runs in the caller's tenant context (withTenant
 * has set app.current_tenant_id, so RLS scopes the INSERT — a Hub can only be
 * registered under the acting tenant, and its site_id FK is tenant-checked).
 * The Hub starts `provisioning` (buildHubRegistration); its first heartbeat
 * flips it online.
 */
export async function registerHub(
  client: Queryable,
  tenantId: string,
  input: HubRegistrationInput,
): Promise<{ id: string }> {
  const reg = buildHubRegistration(input);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO hubs (tenant_id, site_id, name, hardware_serial, agent_version, status, protocol_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [tenantId, reg.siteId, reg.name, reg.hardwareSerial, reg.agentVersion, reg.status, JSON.stringify(reg.protocolConfig)],
  );
  return { id: rows[0].id };
}

/**
 * Record a Hub heartbeat: mark it online, stamp last_seen_at, and update the
 * agent/PeakAssist-content versions *only if the report carried them* — a
 * COALESCE keeps the existing value when a version is omitted, so a bare
 * heartbeat never nulls known versions. RLS-scoped by the caller's context.
 */
export async function recordHeartbeat(
  client: Queryable,
  hubId: string,
  report: HubHeartbeatReport,
): Promise<{ updated: boolean }> {
  const u = applyHeartbeat(report);
  const { rowCount } = await client.query(
    `UPDATE hubs
        SET status = $1,
            last_seen_at = $2,
            agent_version = COALESCE($3, agent_version),
            peakassist_content_version = COALESCE($4, peakassist_content_version),
            updated_at = now()
      WHERE id = $5`,
    [u.status, u.lastSeenAt, u.agentVersion, u.peakassistContentVersion, hubId],
  );
  return { updated: (rowCount ?? 0) > 0 };
}
