import { describe, it, expect, vi } from 'vitest';
import { writeAuditLog } from './audit';
import type { PoolClient } from 'pg';

// Security Architecture §5 (added v1.1) — writeAuditLog() was designed in
// this doc but never implemented; this is real regression coverage for the
// first working version, not a formality. A minimal fake PoolClient (just
// the query() call recorded) is enough here since the function's whole job
// is picking the right INSERT shape per scope — the actual RLS/isolation
// behavior is covered by the real-Postgres tests in db.integration.test.ts.

function fakeClient() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { query } as unknown as PoolClient & { query: ReturnType<typeof vi.fn> };
}

describe('writeAuditLog', () => {
  it('inserts a tenant-scoped row using tenant_id/actor_id, leaving the channel-partner columns untouched', async () => {
    const client = fakeClient();
    await writeAuditLog(client, {
      scope: 'tenant',
      tenantId: 'tenant-1',
      actorId: 'user-1',
      action: 'device.claim',
      targetEntity: 'device',
      targetId: 'device-1',
    });

    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('tenant_id, actor_id');
    expect(sql).not.toContain('channel_partner_id');
    expect(params).toEqual(['tenant-1', 'user-1', 'device.claim', 'device', 'device-1', null, null]);
  });

  it('inserts a channel-partner-scoped row using channel_partner_id/actor_channel_partner_user_id', async () => {
    const client = fakeClient();
    await writeAuditLog(client, {
      scope: 'channel_partner',
      channelPartnerId: 'partner-1',
      actorChannelPartnerUserId: 'cpu-1',
      action: 'route.confirm',
      targetEntity: 'route_assignment',
      targetId: 'route-1',
    });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('channel_partner_id, actor_channel_partner_user_id');
    expect(sql).not.toContain('tenant_id, actor_id');
    expect(params).toEqual(['partner-1', 'cpu-1', 'route.confirm', 'route_assignment', 'route-1', null, null]);
  });

  it('serializes prior_value/new_value as JSON when present', async () => {
    const client = fakeClient();
    await writeAuditLog(client, {
      scope: 'tenant',
      tenantId: 'tenant-1',
      actorId: null,
      action: 'tenant.settings_change',
      targetEntity: 'tenant',
      targetId: 'tenant-1',
      priorValue: { plan: 'trial' },
      newValue: { plan: 'professional' },
    });

    const [, params] = client.query.mock.calls[0];
    expect(params[5]).toBe(JSON.stringify({ plan: 'trial' }));
    expect(params[6]).toBe(JSON.stringify({ plan: 'professional' }));
  });

  it('allows a null actor (system-triggered entry) on either scope', async () => {
    const client = fakeClient();
    await writeAuditLog(client, {
      scope: 'channel_partner',
      channelPartnerId: 'partner-1',
      actorChannelPartnerUserId: null,
      action: 'route.ai_generated',
      targetEntity: 'route_assignment',
      targetId: 'route-1',
    });

    const [, params] = client.query.mock.calls[0];
    expect(params[1]).toBeNull();
  });
});
