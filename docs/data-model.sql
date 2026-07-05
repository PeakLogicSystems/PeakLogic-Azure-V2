-- PeakLogic MVP Data Model
-- Run against the peaklogic database after first deploy.
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

-- ─────────────────────────────────────────────────────────────
-- RLS HELPER — call at the start of every DB transaction
-- ─────────────────────────────────────────────────────────────
-- SET LOCAL app.current_tenant_id = '<tenant_uuid_from_jwt>';
