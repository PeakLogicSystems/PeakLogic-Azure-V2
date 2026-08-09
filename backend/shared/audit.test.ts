import { describe, it, expect, vi } from 'vitest';
import { writeAuditLog } from './audit';
import { withCorrelationId } from './correlation';
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
    expect(sql).toContain('tenant_id, actor_id, actor_staff_user_id');
    expect(sql).not.toContain('channel_partner_id');
    expect(params).toEqual(['tenant-1', 'user-1', null, 'device.claim', 'device', 'device-1', null, null, null]);
  });

  it('populates actor_staff_user_id for a staff-initiated write, leaving actor_id null (IA-7.1)', async () => {
    const client = fakeClient();
    await writeAuditLog(client, {
      scope: 'tenant',
      tenantId: 'tenant-1',
      actorId: null,
      actorStaffUserId: 'staff-1',
      action: 'device.update',
      targetEntity: 'device',
      targetId: 'device-1',
    });

    const [, params] = client.query.mock.calls[0];
    expect(params).toEqual(['tenant-1', null, 'staff-1', 'device.update', 'device', 'device-1', null, null, null]);
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
    expect(sql).toContain('channel_partner_id, actor_channel_partner_user_id, actor_staff_user_id');
    expect(sql).not.toContain('tenant_id, actor_id');
    expect(params).toEqual(['partner-1', 'cpu-1', null, 'route.confirm', 'route_assignment', 'route-1', null, null, null]);
  });

  it('populates actor_staff_user_id on a channel-partner-scoped row for a staff-initiated write (e.g. admin-partners.ts create)', async () => {
    const client = fakeClient();
    await writeAuditLog(client, {
      scope: 'channel_partner',
      channelPartnerId: 'partner-1',
      actorChannelPartnerUserId: null,
      actorStaffUserId: 'staff-1',
      action: 'channel_partner.create',
      targetEntity: 'channel_partner',
      targetId: 'partner-1',
    });

    const [, params] = client.query.mock.calls[0];
    expect(params).toEqual(['partner-1', null, 'staff-1', 'channel_partner.create', 'channel_partner', 'partner-1', null, null, null]);
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
    expect(params[6]).toBe(JSON.stringify({ plan: 'trial' }));
    expect(params[7]).toBe(JSON.stringify({ plan: 'professional' }));
  });

  it('inserts a platform-scoped row (TD-55) leaving tenant_id and channel_partner_id both null', async () => {
    const client = fakeClient();
    await writeAuditLog(client, {
      scope: 'platform',
      actorStaffUserId: 'staff-1',
      action: 'agent.state',
      targetEntity: 'agent',
      targetId: 'WARDEN-TEN',
    });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('actor_staff_user_id, action, target_entity, target_id');
    expect(sql).not.toContain('tenant_id');
    expect(sql).not.toContain('channel_partner_id');
    expect(params).toEqual(['staff-1', 'agent.state', 'agent', 'WARDEN-TEN', null, null, null]);
  });

  it('allows a null actor on a platform-scoped row — agent.killswitch.trip is attributed to the platform, not a signed-in user', async () => {
    const client = fakeClient();
    await writeAuditLog(client, {
      scope: 'platform',
      actorStaffUserId: null,
      action: 'agent.killswitch.trip',
      targetEntity: 'agent_fleet',
      targetId: 'all',
    });

    const [, params] = client.query.mock.calls[0];
    expect(params[0]).toBeNull();
  });

  it('captures the current request\'s correlation id (architecture-review Gap 13) when writeAuditLog runs inside withCorrelationId', async () => {
    const client = fakeClient();
    await withCorrelationId('corr-abc-123', () =>
      writeAuditLog(client, {
        scope: 'tenant',
        tenantId: 'tenant-1',
        actorId: 'user-1',
        action: 'device.update',
        targetEntity: 'device',
        targetId: 'device-1',
      }),
    );

    const [, params] = client.query.mock.calls[0];
    expect(params[params.length - 1]).toBe('corr-abc-123');
  });

  it('leaves correlation_id null when writeAuditLog runs outside any withCorrelationId scope (e.g. a scheduled job)', async () => {
    const client = fakeClient();
    await writeAuditLog(client, {
      scope: 'tenant',
      tenantId: 'tenant-1',
      actorId: 'user-1',
      action: 'device.update',
      targetEntity: 'device',
      targetId: 'device-1',
    });

    const [, params] = client.query.mock.calls[0];
    expect(params[params.length - 1]).toBeNull();
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
