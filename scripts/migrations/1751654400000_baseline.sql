-- Baseline migration: captures the schema as it exists today (mirrors
-- docs/data-model.sql exactly as of Database Schema v1). This exists
-- for any FUTURE environment provisioned from scratch (a fresh dev
-- database, CI, a new region) — not for today's already-running
-- peaklogic database, which already has this schema.
--
-- IMPORTANT: for an environment that already has these tables (e.g.
-- today's database), do NOT run this migration normally — it will
-- fail on the first CREATE TABLE. Instead, mark it as already-applied
-- by inserting its filename directly into the migrations tracking
-- table (`pgmigrations` by default) without executing its SQL. See
-- node-pg-migrate's docs for the exact incantation for the installed
-- version — this file has not yet been run against a real database,
-- so treat the marker syntax below as a starting point to verify, not
-- a settled fact (per Database Schema §4.2's own "recommendation, not
-- yet implemented" caveat).

-- Up Migration

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

CREATE TABLE channel_partners (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  contact_info JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,
  slug               TEXT        NOT NULL UNIQUE,
  plan               TEXT        NOT NULL DEFAULT 'trial'
                     CHECK (plan IN ('trial','starter','professional','enterprise')),
  status             TEXT        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','suspended','trial')),
  channel_partner_id UUID        REFERENCES channel_partners(id) ON DELETE SET NULL,
  settings           JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tenants_channel_partner_idx ON tenants(channel_partner_id);

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

CREATE TABLE sites (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  type       TEXT        NOT NULL
             CHECK (type IN ('pumping_station','qsr','restaurant','pool','nursing_home',
                              'retail','light_industrial','multifamily_residential','other')),
  address    JSONB,
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

CREATE TABLE assets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id         UUID        NOT NULL REFERENCES sites(id)   ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  category        TEXT        NOT NULL,
  make            TEXT,
  model           TEXT,
  serial_number   TEXT,
  install_date    DATE,
  spec_sheet_key  TEXT,
  specs           JSONB,
  health_status   TEXT        NOT NULL DEFAULT 'unknown'
                  CHECK (health_status IN ('healthy','warning','critical','offline','unknown')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assets
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE INDEX assets_site_idx ON assets(site_id);

CREATE TABLE devices (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id         UUID        REFERENCES assets(id) ON DELETE SET NULL,
  serial           TEXT        NOT NULL UNIQUE,
  thing_name       TEXT        NOT NULL UNIQUE,
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

CREATE TABLE telemetry (
  time      TIMESTAMPTZ      NOT NULL,
  device_id UUID             NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  tenant_id UUID             NOT NULL,
  metric    TEXT             NOT NULL,
  value     DOUBLE PRECISION NOT NULL,
  quality   SMALLINT         NOT NULL DEFAULT 0
);

CREATE INDEX telemetry_lookup ON telemetry (tenant_id, device_id, time DESC);

CREATE TABLE telemetry_hourly (
  tenant_id    UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id    UUID             NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  metric       TEXT             NOT NULL,
  hour_start   TIMESTAMPTZ      NOT NULL,
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

CREATE TABLE metric_baselines (
  tenant_id       UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id       UUID             NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  metric          TEXT             NOT NULL,
  trailing_mean   DOUBLE PRECISION NOT NULL,
  trailing_stddev DOUBLE PRECISION NOT NULL,
  window_start    TIMESTAMPTZ      NOT NULL,
  window_end      TIMESTAMPTZ      NOT NULL,
  sample_count    INTEGER          NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, metric)
);

ALTER TABLE metric_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON metric_baselines
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE INDEX metric_baselines_tenant_idx ON metric_baselines(tenant_id);

CREATE TABLE alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id       UUID        REFERENCES devices(id)  ON DELETE SET NULL,
  asset_id        UUID        REFERENCES assets(id)   ON DELETE SET NULL,
  severity        TEXT        NOT NULL CHECK (severity IN ('info','warning','critical')),
  type            TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  context         JSONB,
  status          TEXT        NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','acknowledged','resolved','suppressed')),
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON alerts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

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
  webhook_url  TEXT,
  external_ref TEXT,
  due_at       TIMESTAMPTZ,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE service_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_tickets
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

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

CREATE OR REPLACE FUNCTION reject_audit_log_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log_entries is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_entries_append_only
  BEFORE UPDATE OR DELETE ON audit_log_entries
  FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();

-- Down Migration

DROP TRIGGER IF EXISTS audit_log_entries_append_only ON audit_log_entries;
DROP FUNCTION IF EXISTS reject_audit_log_mutation();
DROP TABLE IF EXISTS audit_log_entries CASCADE;
DROP TABLE IF EXISTS service_tickets CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS metric_baselines CASCADE;
DROP TABLE IF EXISTS telemetry_hourly CASCADE;
DROP TABLE IF EXISTS telemetry CASCADE;
DROP TABLE IF EXISTS devices CASCADE;
DROP TABLE IF EXISTS assets CASCADE;
DROP TABLE IF EXISTS sites CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS channel_partners CASCADE;
