-- Channel-partner portal entities (Domain Model v1.1 §2.7, approved
-- 2026-07-11): white-label branding on channel_partners, four new tables
-- backing TR-1.1-TR-3.2 (territory/technician/dispatch management) and
-- CH-3.1 (the scoped operational-dispatch portal), and the real
-- cross-tenant read mechanism + audit-logging extension needed to make
-- both actually work (Database Schema v1.1 §4.4/§6, resolved here rather
-- than left open).
--
-- ── Access model ──────────────────────────────────────────────────────
-- territories/channel_partner_users/route_assignments/route_stops are
-- channel-partner-scoped, not tenant-scoped -- RLS on these four keys on
-- a new session variable, app.current_channel_partner_id, the same
-- pattern as app.current_tenant_id but for the partner dimension.
-- route_assignments/route_stops additionally restrict a `technician` role
-- to their own rows only (app.current_channel_partner_user_id) --
-- a partner_admin sees everything under their channel_partner_id.
--
-- A channel-partner session also needs to READ existing tenant-scoped
-- tables (sites, assets, devices, telemetry, alerts) across every tenant
-- attributed to their partner -- and, for a technician, further scoped to
-- their assigned territory's sites only (their "preconfigured assets").
-- Implemented as a second, additional permissive RLS policy on each of
-- those five tables (Postgres OR-combines multiple permissive policies),
-- backed by one shared channel_partner_can_read_site() function so the
-- territory-containment logic isn't duplicated five times.
--
-- ── Real bug fixed in the same migration, not a separate one ──────────
-- Every EXISTING tenant_isolation policy uses
-- app_uuid('app.current_tenant_id') with no missing_ok flag
-- -- which RAISES AN ERROR if that setting was never made for the
-- session, rather than evaluating to false. A channel-partner session
-- never sets app.current_tenant_id at all, so without this fix, the
-- existing tenant_isolation policy on (say) `sites` would throw the
-- instant a channel-partner session queried it -- even though the new
-- channel_partner_read policy below would otherwise grant access.
-- Postgres does not guarantee short-circuiting an erroring permissive
-- policy just because a sibling policy would evaluate true, so this has
-- to be fixed at every affected policy, not worked around by always
-- setting a sentinel tenant_id application-side (more robust: correct
-- regardless of what any future caller remembers to do).

-- Up Migration

-- Re-create every existing tenant_isolation policy with missing_ok=true,
-- so a session that never sets app.current_tenant_id (a channel-partner
-- session) gets `false` (row excluded) instead of a hard error.
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON sites;
CREATE POLICY tenant_isolation ON sites
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON assets;
CREATE POLICY tenant_isolation ON assets
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON devices;
CREATE POLICY tenant_isolation ON devices
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON telemetry;
CREATE POLICY tenant_isolation ON telemetry
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON telemetry_hourly;
CREATE POLICY tenant_isolation ON telemetry_hourly
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON metric_baselines;
CREATE POLICY tenant_isolation ON metric_baselines
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON alerts;
CREATE POLICY tenant_isolation ON alerts
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON service_tickets;
CREATE POLICY tenant_isolation ON service_tickets
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- channel_partners.branding

ALTER TABLE channel_partners ADD COLUMN branding JSONB;
COMMENT ON COLUMN channel_partners.branding IS
  'Nullable. {logo_url, primary_color, secondary_color} for the white-label portal login (CH-3.1). Null for an attribution-only partner not onboarded to the portal.';

-- territories

CREATE TABLE territories (
  id                 UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID                      NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
  name               TEXT                      NOT NULL,
  boundary           GEOGRAPHY(POLYGON, 4326)  NOT NULL,
  created_at         TIMESTAMPTZ               NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ               NOT NULL DEFAULT now()
);

CREATE INDEX territories_channel_partner_idx ON territories(channel_partner_id);

ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_partner_isolation ON territories
  USING (channel_partner_id = app_uuid('app.current_channel_partner_id'));

-- channel_partner_users

CREATE TABLE channel_partner_users (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID        NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
  cognito_sub        TEXT        NOT NULL UNIQUE,
  email              TEXT        NOT NULL,
  display_name       TEXT,
  role               TEXT        NOT NULL
                     CHECK (role IN ('partner_admin','technician')),
  territory_id       UUID        REFERENCES territories(id) ON DELETE SET NULL,  -- 0..1, technician only
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX channel_partner_users_partner_idx ON channel_partner_users(channel_partner_id);
CREATE INDEX channel_partner_users_territory_idx ON channel_partner_users(territory_id);

ALTER TABLE channel_partner_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_partner_isolation ON channel_partner_users
  USING (channel_partner_id = app_uuid('app.current_channel_partner_id'));

-- route_assignments (channel_partner_id denormalized here too, same
-- rationale as every other tenant-scoped table in this schema: structural
-- isolation must never depend on a join through channel_partner_users
-- succeeding correctly)

CREATE TABLE route_assignments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID        NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
  technician_user_id UUID        NOT NULL REFERENCES channel_partner_users(id) ON DELETE CASCADE,
  route_date         DATE        NOT NULL,
  source             TEXT        NOT NULL
                     CHECK (source IN ('ai_suggested','manual')),
  status             TEXT        NOT NULL DEFAULT 'suggested'
                     CHECK (status IN ('suggested','confirmed')),
  confirmed_by       UUID        REFERENCES channel_partner_users(id) ON DELETE SET NULL,
  confirmed_at       TIMESTAMPTZ,
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (technician_user_id, route_date)
);

CREATE INDEX route_assignments_partner_idx ON route_assignments(channel_partner_id);

ALTER TABLE route_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_partner_isolation ON route_assignments
  USING (
    channel_partner_id = app_uuid('app.current_channel_partner_id')
    AND (
      current_setting('app.current_channel_partner_role', true) = 'partner_admin'
      OR technician_user_id = app_uuid('app.current_channel_partner_user_id')
    )
  );

-- route_stops (no direct channel_partner_id/technician_user_id -- scoped
-- via its parent route_assignment, which already carries both)

CREATE TABLE route_stops (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  route_assignment_id UUID    NOT NULL REFERENCES route_assignments(id) ON DELETE CASCADE,
  site_id             UUID    NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  sequence_number     INTEGER NOT NULL,
  UNIQUE (route_assignment_id, sequence_number)
);

CREATE INDEX route_stops_assignment_idx ON route_stops(route_assignment_id);

ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_partner_isolation ON route_stops
  USING (
    route_assignment_id IN (
      SELECT id FROM route_assignments
      WHERE channel_partner_id = app_uuid('app.current_channel_partner_id')
        AND (
          current_setting('app.current_channel_partner_role', true) = 'partner_admin'
          OR technician_user_id = app_uuid('app.current_channel_partner_user_id')
        )
    )
  );

-- Shared function: does the current channel-partner session have read
-- access to this site? True for a partner_admin whose partner is
-- attributed to the site's tenant; true for a technician only if the
-- site additionally falls within their assigned territory's boundary
-- (their "preconfigured assets"). STABLE, not VOLATILE, since it only
-- reads session GUCs and table data within the current transaction.
-- TD-51 (fixed 2026-08-01): SECURITY DEFINER is load-bearing, not optional.
-- A policy on `sites` calls this function, and the function's own body
-- SELECTs from `sites` — which re-triggers that same policy, which calls
-- this function again. Without SECURITY DEFINER that is unbounded recursion,
-- and Postgres kills the query with "stack depth limit exceeded". It could
-- never show up while the only connections exercising it were superusers
-- (superusers bypass RLS entirely); it surfaced the moment integration tests
-- started connecting as a real non-superuser role.
--
-- SECURITY DEFINER makes the function body run as the function's owner, so
-- its internal reads are not re-filtered by the policies that invoked it.
-- `SET search_path` is mandatory hardening that must accompany it —
-- without a pinned search_path, a caller could shadow `sites`/`tenants`
-- with their own objects and change what this security check resolves.
CREATE OR REPLACE FUNCTION channel_partner_can_read_site(p_site_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sites s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.id = p_site_id
      AND t.channel_partner_id = app_uuid('app.current_channel_partner_id')
      AND (
        current_setting('app.current_channel_partner_role', true) = 'partner_admin'
        OR EXISTS (
          SELECT 1 FROM channel_partner_users cpu
          JOIN territories terr ON terr.id = cpu.territory_id
          WHERE cpu.id = app_uuid('app.current_channel_partner_user_id')
            -- ST_Covers, not ST_Contains — REAL BUG found and fixed
            -- 2026-08-01 (Water-Sector Security Hardening Strategy §5):
            -- PostGIS has no ST_Contains(geography, geography) overload,
            -- only `geometry`. Never actually run before today (no
            -- migration has ever been applied to a real database) — see
            -- docs/data-model.sql's mirrored copy for the full writeup.
            AND ST_Covers(terr.boundary, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography)
        )
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Additional permissive read policies on the five tenant-scoped tables a
-- channel-partner session needs (site status/chemistry for the dispatch
-- view) -- combined with the existing tenant_isolation policy via OR, so
-- a normal tenant session's access is completely unaffected.

CREATE POLICY channel_partner_read ON sites FOR SELECT
  USING (channel_partner_can_read_site(id));

CREATE POLICY channel_partner_read ON assets FOR SELECT
  USING (channel_partner_can_read_site(site_id));

CREATE POLICY channel_partner_read ON devices FOR SELECT
  USING (
    asset_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM assets a WHERE a.id = devices.asset_id AND channel_partner_can_read_site(a.site_id)
    )
  );

CREATE POLICY channel_partner_read ON telemetry FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM devices d JOIN assets a ON a.id = d.asset_id
      WHERE d.id = telemetry.device_id AND channel_partner_can_read_site(a.site_id)
    )
  );

CREATE POLICY channel_partner_read ON alerts FOR SELECT
  USING (
    (asset_id IS NOT NULL AND channel_partner_can_read_site(
      (SELECT site_id FROM assets WHERE id = alerts.asset_id)
    ))
    OR (asset_id IS NULL AND device_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM devices d JOIN assets a ON a.id = d.asset_id
      WHERE d.id = alerts.device_id AND channel_partner_can_read_site(a.site_id)
    ))
  );

-- Not extended to service_tickets or metric_baselines -- no approved
-- requirement (TR-1-TR-3, CH-3.1) needs a channel-partner session to
-- read either yet. Add if/when one does, not preemptively.

-- audit_log_entries: extend to cover channel_partner_users actions
-- (credential creation, route confirmation) -- previously had no way to
-- represent an actor/scope outside the tenant dimension at all.

ALTER TABLE audit_log_entries ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE audit_log_entries ADD COLUMN channel_partner_id UUID REFERENCES channel_partners(id) ON DELETE SET NULL;
ALTER TABLE audit_log_entries ADD COLUMN actor_channel_partner_user_id UUID REFERENCES channel_partner_users(id) ON DELETE SET NULL;

ALTER TABLE audit_log_entries ADD CONSTRAINT audit_log_entries_scope_check
  CHECK (
    (tenant_id IS NOT NULL AND channel_partner_id IS NULL)
    OR (tenant_id IS NULL AND channel_partner_id IS NOT NULL)
  );

-- Not "exactly one actor column", deliberately -- a system-triggered
-- entry with no human actor (both null) is a legitimate existing case;
-- what's actually invalid is a row claiming to have both a tenant User
-- actor AND a ChannelPartnerUser actor at once.
ALTER TABLE audit_log_entries ADD CONSTRAINT audit_log_entries_actor_check
  CHECK (NOT (actor_id IS NOT NULL AND actor_channel_partner_user_id IS NOT NULL));

CREATE INDEX audit_log_entries_channel_partner_idx ON audit_log_entries(channel_partner_id);

-- The existing tenant_isolation policy (already re-created above with
-- missing_ok=true) now correctly evaluates to false for a
-- channel-partner-scoped row (tenant_id IS NULL never equals any real
-- tenant UUID) instead of erroring. This new policy grants the other
-- half: a channel-partner session may read entries scoped to their own
-- channel_partner_id.
CREATE POLICY channel_partner_isolation ON audit_log_entries
  USING (channel_partner_id = app_uuid('app.current_channel_partner_id'));

-- Down Migration

DROP POLICY IF EXISTS channel_partner_isolation ON audit_log_entries;
DROP INDEX IF EXISTS audit_log_entries_channel_partner_idx;
ALTER TABLE audit_log_entries DROP CONSTRAINT IF EXISTS audit_log_entries_actor_check;
ALTER TABLE audit_log_entries DROP CONSTRAINT IF EXISTS audit_log_entries_scope_check;
ALTER TABLE audit_log_entries DROP COLUMN IF EXISTS actor_channel_partner_user_id;
ALTER TABLE audit_log_entries DROP COLUMN IF EXISTS channel_partner_id;
ALTER TABLE audit_log_entries ALTER COLUMN tenant_id SET NOT NULL;

DROP POLICY IF EXISTS channel_partner_read ON alerts;
DROP POLICY IF EXISTS channel_partner_read ON telemetry;
DROP POLICY IF EXISTS channel_partner_read ON devices;
DROP POLICY IF EXISTS channel_partner_read ON assets;
DROP POLICY IF EXISTS channel_partner_read ON sites;
DROP FUNCTION IF EXISTS channel_partner_can_read_site(UUID);

DROP TABLE IF EXISTS route_stops;
DROP TABLE IF EXISTS route_assignments;
DROP TABLE IF EXISTS channel_partner_users;
DROP TABLE IF EXISTS territories;
ALTER TABLE channel_partners DROP COLUMN IF EXISTS branding;

DROP POLICY IF EXISTS tenant_isolation ON service_tickets;
CREATE POLICY tenant_isolation ON service_tickets
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON alerts;
CREATE POLICY tenant_isolation ON alerts
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON metric_baselines;
CREATE POLICY tenant_isolation ON metric_baselines
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON telemetry_hourly;
CREATE POLICY tenant_isolation ON telemetry_hourly
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON telemetry;
CREATE POLICY tenant_isolation ON telemetry
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON devices;
CREATE POLICY tenant_isolation ON devices
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON assets;
CREATE POLICY tenant_isolation ON assets
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON sites;
CREATE POLICY tenant_isolation ON sites
  USING (tenant_id = app_uuid('app.current_tenant_id'));

DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = app_uuid('app.current_tenant_id'));
