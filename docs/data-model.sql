-- PeakLogic MVP Data Model
-- Canonical, hand-maintained snapshot of the schema (Database Schema
-- artifact, docs/architecture/database-schema.md). Do NOT run this
-- file directly against a database that already has any of these
-- tables -- schema changes are applied via versioned migrations in
-- scripts/migrations/ (see scripts/migrate.ts). This file exists so
-- the current schema can be read/reviewed in one place; every
-- migration must be mirrored into it by hand in the same commit.
-- All tenant-scoped tables use Row-Level Security (RLS).
-- App sets: SET LOCAL app.current_tenant_id = '<uuid>' at transaction start.
--
-- Channel-partner sessions (added v1.1, Database Schema §4.4) set a
-- different trio instead: app.current_channel_partner_id,
-- app.current_channel_partner_user_id, app.current_channel_partner_role
-- ('partner_admin' or 'technician') -- and do NOT set app.current_tenant_id
-- at all, which is exactly why every tenant_isolation policy below reads
-- current_setting(..., true) (missing_ok) rather than erroring when that
-- variable is unset.
--
-- NOTE ON ORDERING: this file is a single linear script (unlike the real
-- migrations in scripts/migrations/, which build incrementally on an
-- already-existing schema). The cross-tenant channel_partner_read
-- policies on sites/assets/devices/telemetry/alerts all call
-- channel_partner_can_read_site(), which itself depends on territories
-- and channel_partner_users -- so that function, and every policy that
-- calls it, is deliberately placed in one consolidated section at the
-- END of this file, after every table it depends on already exists, not
-- interleaved into each table's own block.

-- ─────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "postgis";    -- GEOGRAPHY types, ST_Contains etc. (territories.boundary)

-- ─────────────────────────────────────────────────────────────
-- CHANNEL PARTNERS  (PeakLogic-internal reseller/supplier reference
-- data -- NOT tenant data, so deliberately NOT RLS-enabled. Access
-- is controlled at the application layer (AUTH-2/3), not by tenant
-- isolation, since this table has no tenant_id to isolate by.)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE channel_partners (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  contact_info JSONB       NOT NULL DEFAULT '{}',
  branding     JSONB,                        -- {logo_url, primary_color, secondary_color} for the
                                               -- white-label portal login (CH-3.1); null until a
                                               -- partner is onboarded to the portal
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- TENANTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE tenants (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,
  slug               TEXT        NOT NULL UNIQUE,   -- URL-safe identifier e.g. "acme-water"
  plan               TEXT        NOT NULL DEFAULT 'trial'
                     CHECK (plan IN ('trial','starter','professional','enterprise')),
  status             TEXT        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','suspended','trial')),
  channel_partner_id UUID        REFERENCES channel_partners(id) ON DELETE SET NULL,  -- CH-1.1
  settings           JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tenants_channel_partner_idx ON tenants(channel_partner_id);

-- ─────────────────────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cognito_sub  TEXT        NOT NULL UNIQUE,
  email        TEXT        NOT NULL,
  display_name TEXT,
  role         TEXT        NOT NULL
               CHECK (role IN ('admin','operator','service_partner')),
  status       TEXT        NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─────────────────────────────────────────────────────────────
-- SITES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE sites (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  type       TEXT        NOT NULL
             CHECK (type IN ('pumping_station','qsr','restaurant','pool','nursing_home',
                              'retail','light_industrial','multifamily_residential','other')),
  address    JSONB,                          -- {street, city, state, zip, country}
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  timezone   TEXT        NOT NULL DEFAULT 'UTC',
  metadata   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sites
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- A second, additional permissive policy granting channel-partner
-- sessions cross-tenant read access is added at the end of this file
-- (channel_partner_read policies section) — it needs territories and
-- channel_partner_users to exist first, so it can't live here.

-- ─────────────────────────────────────────────────────────────
-- ASSETS  (equipment at a site)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE assets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id         UUID        NOT NULL REFERENCES sites(id)   ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  category        TEXT        NOT NULL,      -- 'pump','compressor','pool_system','hvac',
                                              -- 'refrigeration','leak_sensor','energy_meter','pool_chemistry',
                                              -- 'gas_sensor','air_quality' (extensible — see backend/ingest/handler.ts RULES_BY_CATEGORY / DA-1.1)
  make            TEXT,
  model           TEXT,
  serial_number   TEXT,
  install_date    DATE,
  spec_sheet_key  TEXT,                      -- S3 key: {tenant_id}/spec-sheets/{id}.pdf
  specs           JSONB,                     -- manually entered: {rated_flow_lpm, pressure_psi, power_kw}
  health_status   TEXT        NOT NULL DEFAULT 'unknown'
                  CHECK (health_status IN ('healthy','warning','critical','offline','unknown')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assets
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE INDEX assets_site_idx ON assets(site_id);  -- RP-1.1 portfolio roll-up joins sites -> assets

-- ─────────────────────────────────────────────────────────────
-- DEVICES  (physical IoT hardware)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE devices (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id         UUID        REFERENCES assets(id) ON DELETE SET NULL,
  serial           TEXT        NOT NULL UNIQUE,   -- printed on hardware label
  thing_name       TEXT        NOT NULL UNIQUE,   -- AWS IoT Core thing name
  firmware_version TEXT,
  status           TEXT        NOT NULL DEFAULT 'provisioning'
                   CHECK (status IN ('provisioning','online','offline','decommissioned')),
  last_seen_at     TIMESTAMPTZ,
  provisioned_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON devices
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE INDEX devices_asset_idx ON devices(asset_id);

-- ─────────────────────────────────────────────────────────────
-- TELEMETRY  (high-volume — partition by month in v2)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE telemetry (
  time      TIMESTAMPTZ      NOT NULL,
  device_id UUID             NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  tenant_id UUID             NOT NULL,       -- denormalized for fast filtering
  metric    TEXT             NOT NULL,       -- 'power_kw','flow_lpm','pressure_psi','temp_c',
                                              -- 'product_temp_c' (probe temp of stored food/drink, not ambient air), 'leak_detected' (0/1)
  value     DOUBLE PRECISION NOT NULL,
  quality   SMALLINT         NOT NULL DEFAULT 0  -- 0=good 1=uncertain 2=bad
);

CREATE INDEX telemetry_lookup ON telemetry (tenant_id, device_id, time DESC);

-- RLS added 2026-07-09 (migration 1783569600000_telemetry-rls) — this table
-- was missing it while every other tenant-scoped table had it, a live
-- cross-tenant data exposure via GET /v1/telemetry?deviceId=<any tenant's
-- device>. See Multi-Tenant Architecture (#14) for the full writeup.
ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telemetry
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─────────────────────────────────────────────────────────────
-- TELEMETRY HOURLY ROLLUP  (Database Schema §4.1 -- PRD §6/SRS §5.4
-- retention: 90 days raw, 2 years hourly. Populated by a scheduled
-- downsample job -- not yet built, see Database Schema §6 Open
-- Questions.)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE telemetry_hourly (
  tenant_id    UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id    UUID             NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  metric       TEXT             NOT NULL,
  hour_start   TIMESTAMPTZ      NOT NULL,   -- truncated to the hour
  avg_value    DOUBLE PRECISION NOT NULL,
  min_value    DOUBLE PRECISION NOT NULL,
  max_value    DOUBLE PRECISION NOT NULL,
  sample_count INTEGER          NOT NULL,
  PRIMARY KEY (device_id, metric, hour_start)
);

ALTER TABLE telemetry_hourly ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telemetry_hourly
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE INDEX telemetry_hourly_lookup ON telemetry_hourly (tenant_id, device_id, hour_start DESC);

-- Not extended with a channel_partner_read policy — no approved
-- requirement (TR-1-TR-3) needs a channel-partner session to read
-- rolled-up history yet; add if/when one does.

-- ─────────────────────────────────────────────────────────────
-- METRIC BASELINES  (maintained rolling per-device-per-metric
-- statistics supporting AI-3.1 anomaly detection -- updated
-- incrementally as telemetry arrives, not recomputed from scratch)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE metric_baselines (
  tenant_id       UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id       UUID             NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  metric          TEXT             NOT NULL,
  trailing_mean   DOUBLE PRECISION NOT NULL,
  trailing_stddev DOUBLE PRECISION NOT NULL,
  window_start    TIMESTAMPTZ      NOT NULL,
  window_end      TIMESTAMPTZ      NOT NULL,
  sample_count    INTEGER          NOT NULL DEFAULT 0,  -- withhold anomaly flag until a minimum history is met (SRS §3.7)
  PRIMARY KEY (device_id, metric)
);

ALTER TABLE metric_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON metric_baselines
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE INDEX metric_baselines_tenant_idx ON metric_baselines(tenant_id);

-- Not extended with a channel_partner_read policy — see telemetry_hourly's
-- note above; same reasoning.

-- ─────────────────────────────────────────────────────────────
-- ALERTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id       UUID        REFERENCES devices(id)  ON DELETE SET NULL,
  asset_id        UUID        REFERENCES assets(id)   ON DELETE SET NULL,
  severity        TEXT        NOT NULL CHECK (severity IN ('info','warning','critical')),
  type            TEXT        NOT NULL,      -- 'threshold','offline'
  message         TEXT        NOT NULL,
  context         JSONB,                     -- {metric, threshold, actual_value}
  status          TEXT        NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','acknowledged','resolved','suppressed')),
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON alerts
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─────────────────────────────────────────────────────────────
-- SERVICE TICKETS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE service_tickets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_id     UUID        REFERENCES alerts(id) ON DELETE SET NULL,
  asset_id     UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  assigned_to  UUID        REFERENCES users(id) ON DELETE SET NULL,
  title        TEXT        NOT NULL,
  description  TEXT,
  priority     TEXT        NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('low','medium','high','emergency')),
  status       TEXT        NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','assigned','in_progress','completed','cancelled')),
  webhook_url  TEXT,                         -- partner endpoint; POST on create
  external_ref TEXT,                         -- partner's ticket ID
  due_at       TIMESTAMPTZ,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE service_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_tickets
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Not extended with a channel_partner_read policy — no approved
-- requirement (TR-1-TR-3) needs a channel-partner session to read
-- tickets yet; add if/when one does, not preemptively.

-- Channel Partner Portal & Dispatch tables (below) are declared before
-- Audit Log Entries (further below) so that audit_log_entries'
-- actor_channel_partner_user_id FK can reference channel_partner_users,
-- which must already exist.

-- ─────────────────────────────────────────────────────────────
-- CHANNEL PARTNER PORTAL & DISPATCH  (Domain Model v1.1 §2.7 —
-- TR-1.1-TR-3.2, CH-3.1. Channel-partner-scoped, NOT tenant-scoped —
-- no tenant_id, RLS keyed on app.current_channel_partner_id instead
-- (Database Schema §4.4) — same reasoning as channel_partners above,
-- extended: route_stops can span sites across multiple different
-- tenants attributed to one partner, so there is no single tenant_id
-- to scope by. Placed here (before audit_log_entries) so
-- channel_partner_users exists before audit_log_entries references it.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE territories (
  id                 UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID                      NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
  name               TEXT                      NOT NULL,
  boundary           GEOGRAPHY(POLYGON, 4326)  NOT NULL,  -- map-drawn territory boundary (TR-1.1)
  created_at         TIMESTAMPTZ               NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ               NOT NULL DEFAULT now()
);

CREATE INDEX territories_channel_partner_idx ON territories(channel_partner_id);

ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_partner_isolation ON territories
  USING (channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid);

-- A Territory's Site membership is DERIVED, never stored — a Site
-- belongs to a Territory if (a) sites.tenant_id's tenant is attributed
-- to the Territory's channel_partner_id (via tenants.channel_partner_id)
-- and (b) the Site's lat/lng fall within the Territory's boundary. See
-- channel_partner_can_read_site(), defined at the end of this file, for
-- the actual query shape this resolves to.

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
  USING (channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid);

-- A technician-role user's visible sites are scoped to their assigned
-- territory (their "preconfigured assets"); a partner_admin has no such
-- restriction (channel_partner_can_read_site(), below, implements both).
-- Provisioning is partner_admin-initiated — no self-service signup
-- (Domain Model §4 decision 8).

-- channel_partner_id is denormalized onto route_assignments (not just
-- reachable via technician_user_id -> channel_partner_users), matching
-- this schema's existing tenant_id-denormalization convention (§2):
-- structural isolation must never depend on a join succeeding correctly.
CREATE TABLE route_assignments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID        NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
  technician_user_id UUID        NOT NULL REFERENCES channel_partner_users(id) ON DELETE CASCADE,
  route_date         DATE        NOT NULL,
  source             TEXT        NOT NULL
                     CHECK (source IN ('ai_suggested','manual')),   -- TR-3.1/TR-3.2
  status             TEXT        NOT NULL DEFAULT 'suggested'
                     CHECK (status IN ('suggested','confirmed')),   -- advisory-only confirmation gate
  confirmed_by       UUID        REFERENCES channel_partner_users(id) ON DELETE SET NULL,
  confirmed_at       TIMESTAMPTZ,
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (technician_user_id, route_date)
);

CREATE INDEX route_assignments_partner_idx ON route_assignments(channel_partner_id);

ALTER TABLE route_assignments ENABLE ROW LEVEL SECURITY;
-- A partner_admin sees every route under their channel_partner_id; a
-- technician sees only their own (route visibility is more sensitive
-- than territory/user visibility — it reveals a colleague's schedule and
-- customer visit pattern, not just their name).
CREATE POLICY channel_partner_isolation ON route_assignments
  USING (
    channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid
    AND (
      current_setting('app.current_channel_partner_role', true) = 'partner_admin'
      OR technician_user_id = current_setting('app.current_channel_partner_user_id', true)::uuid
    )
  );

-- route_stops has no direct channel_partner_id/technician_user_id of its
-- own — scoped via its parent route_assignment, which already carries
-- both (a semi-join subquery, not a denormalized copy; route_stops is
-- always accessed through its parent, unlike route_assignments itself).
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
      WHERE channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid
        AND (
          current_setting('app.current_channel_partner_role', true) = 'partner_admin'
          OR technician_user_id = current_setting('app.current_channel_partner_user_id', true)::uuid
        )
    )
  );

-- ─────────────────────────────────────────────────────────────
-- AUDIT LOG ENTRIES  (AUD-1 -- record of every state-changing
-- administrative action; AUD-2 requires the same tenant RLS
-- enforcement as every other table. Extended v1.1 to also cover
-- channel_partner_users actions -- see the scope/actor CHECK
-- constraints below.)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE audit_log_entries (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  channel_partner_id            UUID        REFERENCES channel_partners(id) ON DELETE SET NULL,
  actor_id                      UUID        REFERENCES users(id) ON DELETE SET NULL,
  actor_channel_partner_user_id UUID        REFERENCES channel_partner_users(id) ON DELETE SET NULL,
  action                        TEXT        NOT NULL,
  target_entity                 TEXT        NOT NULL,
  target_id                     UUID        NOT NULL,
  prior_value                   JSONB,
  new_value                     JSONB,
  occurred_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_entries_scope_check CHECK (
    (tenant_id IS NOT NULL AND channel_partner_id IS NULL)
    OR (tenant_id IS NULL AND channel_partner_id IS NOT NULL)
  ),
  -- Not "exactly one actor" -- a system-triggered entry with no human
  -- actor (both null) is legitimate; what's invalid is claiming both a
  -- tenant User actor AND a ChannelPartnerUser actor on the same row.
  CONSTRAINT audit_log_entries_actor_check CHECK (
    NOT (actor_id IS NOT NULL AND actor_channel_partner_user_id IS NOT NULL)
  )
);

ALTER TABLE audit_log_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_log_entries
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY channel_partner_isolation ON audit_log_entries
  USING (channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid);

CREATE INDEX audit_log_entries_lookup ON audit_log_entries(tenant_id, target_entity, target_id, occurred_at DESC);
CREATE INDEX audit_log_entries_channel_partner_idx ON audit_log_entries(channel_partner_id);

-- Append-only enforcement (Database Schema §4.3): audit_log_entries is
-- an evidentiary record (PRD §6, AUD-1) -- no role, including the
-- normal application role, may UPDATE or DELETE a row once written.
CREATE OR REPLACE FUNCTION reject_audit_log_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log_entries is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_entries_append_only
  BEFORE UPDATE OR DELETE ON audit_log_entries
  FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();

-- ─────────────────────────────────────────────────────────────
-- CROSS-TENANT READ POLICIES FOR CHANNEL-PARTNER SESSIONS
-- (Database Schema §4.4, added v1.1) — consolidated here, after every
-- table any of this depends on already exists (sites, tenants,
-- territories, channel_partner_users), rather than interleaved into
-- each table's own block above.
-- ─────────────────────────────────────────────────────────────

-- Does the current channel-partner session have read access to this
-- site? True for a partner_admin whose partner is attributed to the
-- site's tenant; true for a technician only if the site additionally
-- falls within their assigned territory's boundary (their "preconfigured
-- assets"). One function, not five duplicated subqueries.
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

-- Each policy below is a second, additional PERMISSIVE policy alongside
-- that table's existing tenant_isolation policy — Postgres OR-combines
-- them, so a normal tenant session (which never sets the channel-partner
-- GUCs) is completely unaffected.

CREATE POLICY channel_partner_read ON sites FOR SELECT
  USING (channel_partner_can_read_site(id));

CREATE POLICY channel_partner_read ON assets FOR SELECT
  USING (channel_partner_can_read_site(site_id));

-- A device with no asset_id has no resolvable site, so it's simply never
-- visible to a channel-partner session (safest default: deny, not error).
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

-- Prefers asset_id when present (the common case); falls back to
-- device_id -> asset_id -> site for the rare row where only device_id is
-- set. A row with neither set is never visible to a channel-partner
-- session (safest default: deny).
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

-- Not extended to service_tickets or metric_baselines — no approved
-- requirement (TR-1-TR-3, CH-3.1) needs a channel-partner session to
-- read either yet. Add if/when one does, not preemptively.

-- ─────────────────────────────────────────────────────────────
-- RLS HELPER — call at the start of every DB transaction
-- ─────────────────────────────────────────────────────────────
-- Tenant session:          SET LOCAL app.current_tenant_id = '<tenant_uuid_from_jwt>';
-- Channel-partner session: SET LOCAL app.current_channel_partner_id = '<...>';
--                          SET LOCAL app.current_channel_partner_user_id = '<...>';
--                          SET LOCAL app.current_channel_partner_role = 'partner_admin' | 'technician';
