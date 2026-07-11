-- Found during the same Multi-Tenant Architecture v1.1 review pass as the
-- FORCE ROW LEVEL SECURITY fix (migration 1783728060000), a smaller but
-- real gap in the same spirit as §3.2's original tenant-suspension finding:
-- channel_partners has no status column at all, and no code path could
-- enforce a suspension even if one existed. If a channel-partner
-- relationship needs to be suspended (a contract dispute, a portal-abuse
-- concern), there is currently no way to do that short of deleting rows.
--
-- Scoped deliberately to the partner PORTAL only, mirroring §3.2's own
-- "suspend the thing this document actually gates access to, not
-- everything downstream of it" principle: suspending a channel partner
-- must not suspend service for the tenants attributed to them (a pool
-- company's own software should keep working regardless of a dispute
-- between PeakLogic and their channel-partner relationship) -- enforced
-- naturally, since withChannelPartner() is a separate code path from
-- withTenant() and only this one checks channel_partners.status.

-- Up Migration

ALTER TABLE channel_partners ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended'));

-- Down Migration

ALTER TABLE channel_partners DROP COLUMN IF EXISTS status;
