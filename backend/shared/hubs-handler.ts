import type { PoolClient } from 'pg';
import { buildHubRegistration, applyHeartbeat, type HubRegistrationInput, type HubHeartbeatReport } from './hubs';
import { checkHubAgentIntegrity } from './hub-integrity';
import { createHubAlert } from './alerts';

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
 *
 * Water-Sector Security Hardening Strategy §5 Tier 2 item 1 — after
 * recording, checks the reported agentVersion against the known-published
 * set (shared/hub-integrity.ts) and raises a real alert when it's
 * "unexpected" (a version PeakLogic never published — the same DriftStatus.
 * Unexpected concept the on-device desired-state reconciler already uses).
 */
export async function recordHeartbeat(
  client: Queryable,
  tenantId: string,
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
  const updated = (rowCount ?? 0) > 0;

  if (updated && report.agentVersion) {
    const integrity = checkHubAgentIntegrity(report.agentVersion);
    if (integrity.status === 'unexpected') {
      await createHubAlert(client, tenantId, hubId, {
        type: 'hub_agent_unexpected_version',
        severity: 'warning', // no production track record for this check yet — same posture as anomaly/device-silence alerts
        message: `Hub reported agent version "${integrity.reportedVersion}", which PeakLogic has never published — possible tampering or a corrupted/unofficial install.`,
        context: { reportedVersion: integrity.reportedVersion },
        time: report.at,
      });
    }
  }

  return { updated };
}
