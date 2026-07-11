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
}

export interface ChannelPartnerAuditEntry extends AuditEntryBase {
  scope: 'channel_partner';
  channelPartnerId: string;
  actorChannelPartnerUserId: string | null;
}

export type AuditEntry = TenantAuditEntry | ChannelPartnerAuditEntry;

export async function writeAuditLog(client: PoolClient, entry: AuditEntry): Promise<void> {
  const priorValue = entry.priorValue !== undefined ? JSON.stringify(entry.priorValue) : null;
  const newValue = entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null;

  if (entry.scope === 'tenant') {
    await client.query(
      `INSERT INTO audit_log_entries
         (tenant_id, actor_id, action, target_entity, target_id, prior_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entry.tenantId, entry.actorId, entry.action, entry.targetEntity, entry.targetId, priorValue, newValue],
    );
  } else {
    await client.query(
      `INSERT INTO audit_log_entries
         (channel_partner_id, actor_channel_partner_user_id, action, target_entity, target_id, prior_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entry.channelPartnerId, entry.actorChannelPartnerUserId, entry.action, entry.targetEntity, entry.targetId, priorValue, newValue],
    );
  }
}
