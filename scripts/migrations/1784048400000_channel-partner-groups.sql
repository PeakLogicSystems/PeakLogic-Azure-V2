-- Channel Partner Groups (holding companies) + site-level partner attribution
-- (whitelabel-estate-branding-design.md, artifact #35).
--
-- Real gap this closes: `tenants.channel_partner_id` is a single nullable FK
-- -- one tenant, at most one channel partner, full stop. A customer serviced
-- by two different partners (e.g. WTR DR for pools, ACE Septic for
-- wastewater, at different sites) could not be represented as one tenant
-- before this migration -- it would have needed two disconnected tenant
-- records, which is the opposite of "see the whole estate."
--
-- Two additive pieces:
-- 1. channel_partner_groups -- the holding company (e.g. "Purple Standard").
--    Same trust/access model as channel_partners itself: NOT RLS-enabled,
--    NOT tenant data, access controlled at the application layer (staff-only
--    writes), same reasoning as channel_partners' own header comment.
--    Deliberately scoped to Purple Standard only for now (one row seeded
--    nowhere in this migration -- created via the admin console once that's
--    wired up) -- the mechanism is generic, the offering is not.
-- 2. sites.channel_partner_id -- a nullable, site-level OVERRIDE of the
--    tenant's own channel_partner_id. NULL (the default for every existing
--    row) means "use the tenant's attribution, unchanged" -- fully backward
--    compatible. Set, it lets one tenant's sites span multiple partners.
--
-- IMPORTANT: group membership does NOT widen channel-partner-side access.
-- channel_partner_can_read_site() (redefined below) still checks the site's
-- OWN effective partner (site override, else tenant default) -- a WTR DR
-- staff session still cannot read an ACE Septic-attributed site just because
-- both belong to the Purple Standard group. Groups are a CUSTOMER-facing
-- branding-fallback concept only, not a partner-side access grant. This is
-- deliberate -- re-verify this hasn't drifted if this migration is ever
-- extended.
--
-- SECOND real bug found while tracing this through (not just theorized --
-- checked how the function actually executes): channel_partner_can_read_site()
-- has no SECURITY DEFINER, so it runs with the CALLING session's own
-- privileges -- its internal `JOIN tenants t ON t.id = s.tenant_id` is
-- itself subject to tenants' own RLS. The OLD tenants.channel_partner_read
-- policy only allowed a partner session to see a tenant row when the
-- TENANT's own channel_partner_id matched. For a mixed-attribution tenant
-- (tenant default = ACE Septic, one site overridden to WTR DR), a WTR DR
-- session's JOIN into tenants would have been silently blocked by that old
-- policy -- the site-level override would never actually resolve, despite
-- looking correct in the function body alone. Fixed below by widening that
-- policy to also allow a match via any of the tenant's sites' overrides.

-- Up Migration

CREATE TABLE channel_partner_groups (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  branding   JSONB,       -- {logo_url, primary_color, secondary_color, tagline} -- same shape as channel_partners.branding
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No RLS -- see header comment; matches channel_partners' own (deliberate) posture.

ALTER TABLE channel_partners ADD COLUMN group_id UUID
  REFERENCES channel_partner_groups(id) ON DELETE SET NULL;
CREATE INDEX channel_partners_group_idx ON channel_partners(group_id) WHERE group_id IS NOT NULL;

ALTER TABLE sites ADD COLUMN channel_partner_id UUID
  REFERENCES channel_partners(id) ON DELETE SET NULL;
CREATE INDEX sites_channel_partner_idx ON sites(channel_partner_id) WHERE channel_partner_id IS NOT NULL;

-- Widen tenants' channel_partner_read policy now that sites.channel_partner_id
-- exists -- see the header comment's "SECOND real bug" note for why this is
-- required, not optional, for the site-level override to actually work.
DROP POLICY IF EXISTS channel_partner_read ON tenants;
CREATE POLICY channel_partner_read ON tenants FOR SELECT
  USING (
    channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid
    OR EXISTS (
      SELECT 1 FROM sites s
      WHERE s.tenant_id = tenants.id
        AND s.channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid
    )
  );

-- Redefine channel_partner_can_read_site() to resolve the site's EFFECTIVE
-- partner as COALESCE(site override, tenant default) instead of the tenant's
-- channel_partner_id alone. For every site where the new column is NULL
-- (every row that existed before this migration, and any new row that
-- doesn't need an override), COALESCE falls through to the exact same
-- tenant-level check as before -- byte-identical behavior for the common
-- case (the pure branding-RESOLUTION logic, a separate concern from this
-- RLS predicate, is covered by backend/shared/branding.test.ts).
CREATE OR REPLACE FUNCTION channel_partner_can_read_site(p_site_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sites s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.id = p_site_id
      AND COALESCE(s.channel_partner_id, t.channel_partner_id) = current_setting('app.current_channel_partner_id', true)::uuid
      AND (
        current_setting('app.current_channel_partner_role', true) = 'partner_admin'
        OR EXISTS (
          SELECT 1 FROM channel_partner_users cpu
          JOIN territories terr ON terr.id = cpu.territory_id
          WHERE cpu.id = current_setting('app.current_channel_partner_user_id', true)::uuid
            AND ST_Contains(terr.boundary, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography)
        )
      )
  );
$$ LANGUAGE sql STABLE;

-- Down Migration

CREATE OR REPLACE FUNCTION channel_partner_can_read_site(p_site_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sites s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.id = p_site_id
      AND t.channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid
      AND (
        current_setting('app.current_channel_partner_role', true) = 'partner_admin'
        OR EXISTS (
          SELECT 1 FROM channel_partner_users cpu
          JOIN territories terr ON terr.id = cpu.territory_id
          WHERE cpu.id = current_setting('app.current_channel_partner_user_id', true)::uuid
            AND ST_Contains(terr.boundary, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography)
        )
      )
  );
$$ LANGUAGE sql STABLE;

DROP POLICY IF EXISTS channel_partner_read ON tenants;
CREATE POLICY channel_partner_read ON tenants FOR SELECT
  USING (channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid);

DROP INDEX IF EXISTS sites_channel_partner_idx;
ALTER TABLE sites DROP COLUMN IF EXISTS channel_partner_id;

DROP INDEX IF EXISTS channel_partners_group_idx;
ALTER TABLE channel_partners DROP COLUMN IF EXISTS group_id;

DROP TABLE IF EXISTS channel_partner_groups;
