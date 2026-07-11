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

-- ─────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "postgis";    -- lat/lng point type (optional MVP)

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
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

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
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

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
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

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
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

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
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

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
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE INDEX telemetry_hourly_lookup ON telemetry_hourly (tenant_id, device_id, hour_start DESC);

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
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE INDEX metric_baselines_tenant_idx ON metric_baselines(tenant_id);

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
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

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
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─────────────────────────────────────────────────────────────
-- AUDIT LOG ENTRIES  (AUD-1 -- record of every state-changing
-- administrative action; AUD-2 requires the same tenant RLS
-- enforcement as every other table)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE audit_log_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  target_entity TEXT        NOT NULL,
  target_id     UUID        NOT NULL,
  prior_value   JSONB,
  new_value     JSONB,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_log_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_log_entries
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE INDEX audit_log_entries_lookup ON audit_log_entries(tenant_id, target_entity, target_id, occurred_at DESC);

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
-- CHANNEL PARTNER PORTAL & DISPATCH  (Domain Model v1.1 §2.7 —
-- TR-1.1-TR-3.2, CH-3.1. Channel-partner-scoped, NOT tenant-scoped —
-- no tenant_id, no RLS, same reasoning as channel_partners above: this
-- is partner reference/operational data, and route_stops can span sites
-- across multiple different tenants attributed to one partner. The
-- concrete cross-tenant access-control mechanism is Multi-Tenant
-- Architecture's (#14) job, not decided here — see Database Schema §4.4.)
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

-- A Territory's Site membership is DERIVED, never stored — a Site
-- belongs to a Territory if (a) sites.tenant_id's tenant is attributed
-- to the Territory's channel_partner_id (via tenants.channel_partner_id)
-- and (b) the Site's lat/lng fall within the Territory's boundary, e.g.:
--   SELECT s.* FROM sites s
--   JOIN tenants t ON t.id = s.tenant_id
--   JOIN territories terr ON terr.channel_partner_id = t.channel_partner_id
--   WHERE terr.id = $1
--     AND ST_Contains(terr.boundary, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography);

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

-- A technician-role user's visible sites are scoped to their assigned
-- territory (their "preconfigured assets") via the same derived query
-- above; a partner_admin has no such restriction. Provisioning is
-- partner_admin-initiated — no self-service signup (Domain Model §4
-- decision 8).

CREATE TABLE route_assignments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE route_stops (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  route_assignment_id UUID    NOT NULL REFERENCES route_assignments(id) ON DELETE CASCADE,
  site_id             UUID    NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  sequence_number     INTEGER NOT NULL,
  UNIQUE (route_assignment_id, sequence_number)
);

CREATE INDEX route_stops_assignment_idx ON route_stops(route_assignment_id);

-- ─────────────────────────────────────────────────────────────
-- RLS HELPER — call at the start of every DB transaction
-- ─────────────────────────────────────────────────────────────
-- SET LOCAL app.current_tenant_id = '<tenant_uuid_from_jwt>';
