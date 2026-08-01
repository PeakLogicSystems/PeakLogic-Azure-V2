import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordHeartbeat } from './hubs-handler';

// Water-Sector Security Hardening Strategy §5 Tier 2 item 1 — real
// regression coverage for recordHeartbeat()'s new tamper-detection wiring
// (checkHubAgentIntegrity()'s own pure logic is fully covered in
// shared/hub-integrity.test.ts). A minimal fake Queryable, matching the
// project's established pattern (audit.test.ts) — this handler's job is
// picking whether to call createHubAlert(), not exercising real Postgres.

function fakeClient(updateRowCount: number, dedupExisting: unknown[] = []) {
  const query = vi.fn()
    // 1. the UPDATE hubs ... query
    .mockResolvedValueOnce({ rowCount: updateRowCount, rows: [] })
    // 2. createHubAlert's dedup SELECT (only reached if integrity is 'unexpected')
    .mockResolvedValueOnce({ rows: dedupExisting })
    // 3. createHubAlert's INSERT (only reached if not deduped)
    .mockResolvedValueOnce({ rows: [{ id: 'alert-1', type: 'hub_agent_unexpected_version' }] });
  return { query };
}

describe('recordHeartbeat — hub agent-version integrity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not create an alert when the reported version is known-published', async () => {
    const client = fakeClient(1);
    await recordHeartbeat(client, 'tenant-1', 'hub-1', { at: new Date(), agentVersion: 'edge-v0.1.1' });
    expect(client.query).toHaveBeenCalledTimes(1); // only the UPDATE — no dedup/insert calls
  });

  it('does not create an alert when no agentVersion is reported at all', async () => {
    const client = fakeClient(1);
    await recordHeartbeat(client, 'tenant-1', 'hub-1', { at: new Date() });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('creates a hub alert when the reported version was never published', async () => {
    const client = fakeClient(1);
    await recordHeartbeat(client, 'tenant-1', 'hub-1', { at: new Date(), agentVersion: 'edge-v9.9.9-tampered' });

    expect(client.query).toHaveBeenCalledTimes(3); // UPDATE + dedup SELECT + INSERT
    const [insertSql, insertParams] = client.query.mock.calls[2];
    expect(insertSql).toContain('INSERT INTO alerts');
    expect(insertParams[0]).toBe('tenant-1'); // tenant_id
    expect(insertParams[2]).toBe('hub_agent_unexpected_version'); // type
    expect(JSON.parse(insertParams[4])).toMatchObject({ hubId: 'hub-1', reportedVersion: 'edge-v9.9.9-tampered' });
  });

  it('does not create an alert if the hub row was not found (updated: false)', async () => {
    const client = fakeClient(0);
    const result = await recordHeartbeat(client, 'tenant-1', 'nonexistent-hub', { at: new Date(), agentVersion: 'edge-v9.9.9' });
    expect(result.updated).toBe(false);
    expect(client.query).toHaveBeenCalledTimes(1); // only the UPDATE attempt, no integrity check follow-up
  });

  it('does not create a second alert when one is already open (dedup)', async () => {
    const client = fakeClient(1, [{ id: 'already-open-alert' }]);
    await recordHeartbeat(client, 'tenant-1', 'hub-1', { at: new Date(), agentVersion: 'edge-v9.9.9' });
    expect(client.query).toHaveBeenCalledTimes(2); // UPDATE + dedup SELECT — no INSERT since one is already open
  });
});
