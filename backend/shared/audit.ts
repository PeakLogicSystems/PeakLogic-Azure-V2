import type { PoolClient } from 'pg';

// AUD-1/AUD-2 (SRS §3.10) — Security Architecture §5 designed this helper
// (2026-07-09) but never actually implemented it: no file existed at this
// path and no code anywhere in backend/ wrote to audit_log_entries, despite
// the doc's own text claiming "real gap closed here." Found while designing
// the channel-partner-scoped audit extension (Database Schema §4.4, added
// v1.1) and implemented for real here, not left as a second unshipped
// promise — extended for both scope dimensions audit_log_entries now
// supports (tenant and channel-partner), not just the original tenant-only
// shape.
//
// Called explicitly at each qualifying state-changing handler, inside the
// same transaction withTenant()/withChannelPartner() already opened — not a
// generic interceptor (see Security Architecture §5 for the reasoning).
// This function does not open a transaction or set any RLS session
// variables itself; the caller's withTenant()/withChannelPartner() call
// already did that.

interface AuditEntryBase {
  action: string;
  targetEntity: string;
  targetId: string;
  priorValue?: unknown;
  newValue?: unknown;
}

export interface TenantAuditEntry extends AuditEntryBase {
  scope: 'tenant';
  tenantId: string;
  actorId: string | null;
  // Set when a staff member wrote this entry via withStaffActingOnTenant()
  // (IA-7.1) — the entry stays tenant-scoped (a tenant admin reviewing
  // their own audit log should see it), but the actor is the staff member,
  // not a tenant user, so it's a distinct column, not actorId reused.
  actorStaffUserId?: string | null;
}

export interface ChannelPartnerAuditEntry extends AuditEntryBase {
  scope: 'channel_partner';
  channelPartnerId: string;
  actorChannelPartnerUserId: string | null;
  // Set when PeakLogic staff acted on a channel partner (e.g. staff creating
  // a new partner via admin-partners.ts) — mirrors TenantAuditEntry's
  // actorStaffUserId. The DB's audit_log_entries_actor_check constraint
  // (migration 1783728000000) only forbids actor_id + actor_channel_partner_
  // user_id together; actor_staff_user_id is unrestricted by scope, so this
  // was a TypeScript-layer gap, not a schema one — added 2026-08-01 while
  // extending audit coverage (Water-Sector Security Hardening Strategy §5
  // Tier 0.1), not a new migration.
  actorStaffUserId?: string | null;
}

// TD-55 fix (2026-08-09) — audit_log_entries_scope_check used to require
// EXACTLY one of tenant_id/channel_partner_id, which rejected platform-scoped
// entries outright: disabling an agent, a cost-kill-switch trip, and every
// WARDEN-TEN tenant-isolation finding belong to neither a tenant nor a
// partner. Migration 1784300000000 widened the constraint to "not both" (so
// tenant-only, partner-only, and platform-scoped — both null — are all
// valid) and added a third RLS policy making a platform-scoped row visible
// only inside an active staff session. This was a named hard prerequisite
// (agent-operations-team-design.md §4.3/§10) for wiring any real agent
// action to execution — fixed here, not deferred further.
export interface PlatformAuditEntry extends AuditEntryBase {
  scope: 'platform';
  // Null for a platform-attributed event — CLAUDE.md's audit rules require
  // agent.killswitch.trip to be attributed to the platform, "not to whoever
  // was signed in, because nobody authorised it." Set to the staff member
  // for every other platform-scoped action (agent.action.approve/reject,
  // agent.state, agent.report.schedule) — an agent itself is never the
  // actor; "the actor is the operator who authorised it, never the agent."
  actorStaffUserId: string | null;
}

export type AuditEntry = TenantAuditEntry | ChannelPartnerAuditEntry | PlatformAuditEntry;

export async function writeAuditLog(client: PoolClient, entry: AuditEntry): Promise<void> {
  const priorValue = entry.priorValue !== undefined ? JSON.stringify(entry.priorValue) : null;
  const newValue = entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null;

  if (entry.scope === 'tenant') {
    await client.query(
      `INSERT INTO audit_log_entries
         (tenant_id, actor_id, actor_staff_user_id, action, target_entity, target_id, prior_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [entry.tenantId, entry.actorId, entry.actorStaffUserId ?? null, entry.action, entry.targetEntity, entry.targetId, priorValue, newValue],
    );
  } else if (entry.scope === 'channel_partner') {
    await client.query(
      `INSERT INTO audit_log_entries
         (channel_partner_id, actor_channel_partner_user_id, actor_staff_user_id, action, target_entity, target_id, prior_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [entry.channelPartnerId, entry.actorChannelPartnerUserId, entry.actorStaffUserId ?? null, entry.action, entry.targetEntity, entry.targetId, priorValue, newValue],
    );
  } else {
    // Platform-scoped: tenant_id and channel_partner_id both left NULL,
    // which the widened audit_log_entries_scope_check now permits.
    await client.query(
      `INSERT INTO audit_log_entries
         (actor_staff_user_id, action, target_entity, target_id, prior_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.actorStaffUserId, entry.action, entry.targetEntity, entry.targetId, priorValue, newValue],
    );
  }
}
