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
-- CRITICAL, added v1.1 (Multi-Tenant Architecture §2.5): every RLS-enabled
-- table below also has FORCE ROW LEVEL SECURITY. Without it, the app's DB
-- role (peaklogic_admin) -- which owns every table it queries, since it's
-- also the role every migration runs as -- silently bypasses RLS entirely
-- by default, regardless of how many policies exist. This was true for
-- every table in this schema from the very first migration until this fix;
-- never caught because nothing has ever been deployed against a real
-- database. backend/ingest/handler.ts sets one more session variable,
-- app.ingest_context = 'true', for the one read (device/asset lookup by
-- thing_name) that must happen before that device's tenant is even known
-- -- see devices'/assets' ingest_lookup policies.
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
  status       TEXT        NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'suspended')),  -- v1.1, Multi-Tenant Architecture §3.3 —
                                                            -- portal-only enforcement, does not affect
                                                            -- this partner's attributed tenants' own service
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

-- RLS added v1.1, found missing entirely (not just missing FORCE) during
-- the same audit that found every other table's RLS was inert against the
-- table-owning application role (see the FORCE ROW LEVEL SECURITY note
-- below). Two policies: a tenant reads its own row; a channel-partner
-- session reads any tenant attributed to their partner (needed for
-- channel_partner_can_read_site()'s JOIN into this table to work at all
-- once FORCE is applied everywhere).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY channel_partner_read ON tenants FOR SELECT
  USING (channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid);

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
               -- 'service_partner' removed v1.2 (added 1783875780000) --
               -- the Cognito group that could ever create one was removed
               -- in Security Architecture v1.1; verified no row held it.
               CHECK (role IN ('admin','operator')),
  status       TEXT        NOT NULL DEFAULT 'active',
  -- Display preferences (SET-3/SET-4/SET-5, added v1.2). NULL = use the
  -- application default (24h, UTC, light) -- no backfill needed.
  clock_format TEXT        CHECK (clock_format IN ('12h','24h')),
  timezone     TEXT,
  theme        TEXT        CHECK (theme IN ('light','dark')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
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
ALTER TABLE sites FORCE ROW LEVEL SECURITY;
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
ALTER TABLE assets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assets
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- v1.1: permits backend/ingest/handler.ts's initial device/asset lookup by
-- thing_name, before that device's tenant is known — narrowly scoped
-- (SELECT only) to the app.ingest_context session marker, not a general
-- exemption. See devices' matching ingest_lookup policy below and Multi-
-- Tenant Architecture §2.5 for the full reasoning.
CREATE POLICY ingest_lookup ON assets FOR SELECT
  USING (current_setting('app.ingest_context', true) = 'true');

CREATE INDEX assets_site_idx ON assets(site_id);  -- RP-1.1 portfolio roll-up joins sites -> assets

-- ─────────────────────────────────────────────────────────────
-- DEVICES  (physical IoT hardware)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE devices (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        REFERENCES tenants(id) ON DELETE CASCADE,  -- nullable v1.1 —
                                -- null until a customer claims it (backend/api/routes/devices.ts's
                                -- claim()); was incorrectly NOT NULL before, a real bug independent
                                -- of RLS that would have failed provisioning outright
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
ALTER TABLE devices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON devices
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- v1.1: see assets' matching ingest_lookup policy above — same reasoning,
-- this is the table the ingest handler actually looks up by thing_name.
CREATE POLICY ingest_lookup ON devices FOR SELECT
  USING (current_setting('app.ingest_context', true) = 'true');

-- v1.1 — device claim/provisioning flow (a device has tenant_id = NULL
-- until a customer claims it). Layered by how much access each caller
-- needs. unclaimed_lookup and provision_unclaimed are BOTH gated on their
-- own session marker (app.claim_context / app.provisioning_context) —
-- corrected after an initial draft used a marker-less `tenant_id IS NULL`
-- condition alone, which (since permissive policies OR-combine across
-- EVERY query on a table, not just the one call site they were meant for)
-- would have leaked every unclaimed device into any tenant's plain
-- list()/getOne() calls, not just claim()'s own lookup-by-serial. Found on
-- a dedicated third pass explicitly checking for over-broad grants, not
-- just "does this still work."
CREATE POLICY unclaimed_lookup ON devices FOR SELECT
  USING (tenant_id IS NULL AND current_setting('app.claim_context', true) = 'true');
CREATE POLICY provision_unclaimed ON devices FOR INSERT
  WITH CHECK (tenant_id IS NULL AND current_setting('app.provisioning_context', true) = 'true');
CREATE POLICY provisioning_lookup ON devices FOR SELECT
  USING (current_setting('app.provisioning_context', true) = 'true');
CREATE POLICY device_claim ON devices FOR UPDATE
  USING (tenant_id IS NULL)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

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
ALTER TABLE telemetry FORCE ROW LEVEL SECURITY;
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
ALTER TABLE telemetry_hourly FORCE ROW LEVEL SECURITY;
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
ALTER TABLE metric_baselines FORCE ROW LEVEL SECURITY;
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
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;
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
ALTER TABLE service_tickets FORCE ROW LEVEL SECURITY;
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
ALTER TABLE territories FORCE ROW LEVEL SECURITY;
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
ALTER TABLE channel_partner_users FORCE ROW LEVEL SECURITY;
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
ALTER TABLE route_assignments FORCE ROW LEVEL SECURITY;
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
ALTER TABLE route_stops FORCE ROW LEVEL SECURITY;
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
-- PEAKLOGIC STAFF USERS  (Domain Model §2.8, added v1.2, migration
-- 1783875780000) -- a third, genuinely separate identity space for
-- Internal Administration Console access. No tenant_id, no
-- channel_partner_id -- superadmin/account_manager are PeakLogic's own
-- people, not a tenant's or a channel partner's.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE peaklogic_staff_users (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub  TEXT        NOT NULL UNIQUE,
  email        TEXT        NOT NULL,
  display_name TEXT,
  role         TEXT        NOT NULL CHECK (role IN ('superadmin','account_manager')),
  status       TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE peaklogic_staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE peaklogic_staff_users FORCE ROW LEVEL SECURITY;
-- Keyed on cognito_sub, not id -- withStaffSession() (backend/shared/db.ts)
-- must resolve a staff user's own row FROM their cognito_sub (the one thing
-- known pre-lookup, straight off the JWT), so id can't be the match column
-- here (that's exactly the id it's trying to discover). Mirrors
-- withChannelPartner()'s "ordering matters" pattern below -- the session
-- variable used for self-lookup must be one already knowable before the
-- row is found, not one only the row itself can supply.
CREATE POLICY staff_self_or_superadmin ON peaklogic_staff_users
  USING (
    cognito_sub = current_setting('app.current_staff_cognito_sub', true)
    OR current_setting('app.current_staff_role', true) = 'superadmin'
  );

-- ─────────────────────────────────────────────────────────────
-- ACCOUNT ASSIGNMENTS  (Domain Model §2.8, added v1.2) -- the "book of
-- business" join table: which tenants/channel partners an
-- account_manager may act on. Deliberately does NOT apply to
-- superadmin -- that role's access is unconditional (Database Schema
-- §4.5), not expressed as a (very large) set of assignment rows.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE account_assignments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id       UUID        NOT NULL REFERENCES peaklogic_staff_users(id) ON DELETE CASCADE,
  tenant_id           UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  channel_partner_id  UUID        REFERENCES channel_partners(id) ON DELETE CASCADE,
  assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by         UUID        NOT NULL REFERENCES peaklogic_staff_users(id),
  CONSTRAINT account_assignments_scope_check CHECK (
    (tenant_id IS NOT NULL AND channel_partner_id IS NULL)
    OR (tenant_id IS NULL AND channel_partner_id IS NOT NULL)
  ),
  UNIQUE (staff_user_id, tenant_id),
  UNIQUE (staff_user_id, channel_partner_id)
);
ALTER TABLE account_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY account_assignment_visibility ON account_assignments
  USING (
    staff_user_id = current_setting('app.current_staff_user_id', true)::uuid
    OR current_setting('app.current_staff_role', true) = 'superadmin'
  );
CREATE INDEX account_assignments_staff_idx ON account_assignments(staff_user_id);
CREATE INDEX account_assignments_tenant_idx ON account_assignments(tenant_id);

-- ─────────────────────────────────────────────────────────────
-- AUDIT LOG ENTRIES  (AUD-1 -- record of every state-changing
-- administrative action; AUD-2 requires the same tenant RLS
-- enforcement as every other table. Extended v1.1 to also cover
-- channel_partner_users actions; extended again v1.2 with a third
-- actor column for staff console actions -- see the scope/actor CHECK
-- constraints below.)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE audit_log_entries (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  channel_partner_id            UUID        REFERENCES channel_partners(id) ON DELETE SET NULL,
  actor_id                      UUID        REFERENCES users(id) ON DELETE SET NULL,
  actor_channel_partner_user_id UUID        REFERENCES channel_partner_users(id) ON DELETE SET NULL,
  actor_staff_user_id           UUID        REFERENCES peaklogic_staff_users(id) ON DELETE SET NULL,
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
  -- actor (all three null) is legitimate; what's invalid is claiming
  -- more than one actor type on the same row.
  CONSTRAINT audit_log_entries_actor_check CHECK (
    (CASE WHEN actor_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN actor_channel_partner_user_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN actor_staff_user_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);

ALTER TABLE audit_log_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log_entries FORCE ROW LEVEL SECURITY;
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
-- STAFF ACCESS POLICY FOR TENANTS  (Database Schema §4.5, added v1.2)
-- Consolidated here, after account_assignments already exists, same
-- reason channel_partner_read was consolidated above.
--
-- One policy handles superadmin creation, superadmin full access, and
-- account_manager assigned-subset access all at once. Verified against
-- PostgreSQL's own documentation (not assumed): a USING-only policy
-- (no explicit WITH CHECK) is implicitly reused as WITH CHECK too, so
-- this correctly governs INSERT as well as SELECT/UPDATE/DELETE --
-- account_manager is automatically denied INSERT with no separate rule
-- needed, since the EXISTS subquery can never match a not-yet-existing
-- tenant's id.
-- ─────────────────────────────────────────────────────────────
CREATE POLICY staff_tenant_access ON tenants
  USING (
    current_setting('app.current_staff_role', true) = 'superadmin'
    OR EXISTS (
      SELECT 1 FROM account_assignments aa
      WHERE aa.staff_user_id = current_setting('app.current_staff_user_id', true)::uuid
        AND aa.tenant_id = tenants.id
    )
  );

-- channel_partners is deliberately NOT given an equivalent policy here --
-- it has never had RLS enabled at all (see its own comment above), and
-- retrofitting FORCE ROW LEVEL SECURITY onto it would require
-- re-auditing every existing caller first (Database Schema §4.5/§6 item
-- 7). Superadmin-only channel-partner creation (IA-3.1) is enforced at
-- the application layer for now -- a disclosed scope decision, not a
-- silent gap.

-- ─────────────────────────────────────────────────────────────
-- RLS HELPER — call at the start of every DB transaction
-- ─────────────────────────────────────────────────────────────
-- Tenant session:          SET LOCAL app.current_tenant_id = '<tenant_uuid_from_jwt>';
-- Channel-partner session: SET LOCAL app.current_channel_partner_id = '<...>';
--                          SET LOCAL app.current_channel_partner_user_id = '<...>';
--                          SET LOCAL app.current_channel_partner_role = 'partner_admin' | 'technician';
-- Staff session (non-tenant-scoped actions):
--                          SET LOCAL app.current_staff_cognito_sub = '<sub_from_jwt>';
--                          SET LOCAL app.current_staff_role = 'superadmin' | 'account_manager';
--                          -- THEN look up peaklogic_staff_users by cognito_sub to resolve
--                          -- the row's id, and only then:
--                          SET LOCAL app.current_staff_user_id = '<resolved_id>';
-- Staff session, acting on a tenant (withStaffActingOnTenant()):
--                          -- all of the above, THEN, only after verifying
--                          -- an account_assignments row (or role = superadmin):
--                          SET LOCAL app.current_tenant_id = '<target_tenant_uuid>';
