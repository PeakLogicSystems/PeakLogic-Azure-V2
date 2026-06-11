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
-- TENANTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE tenants (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,   -- URL-safe identifier e.g. "acme-water"
  plan       TEXT        NOT NULL DEFAULT 'trial'
             CHECK (plan IN ('trial','starter','professional','enterprise')),
  status     TEXT        NOT NULL DEFAULT 'active'
             CHECK (status IN ('active','suspended','trial')),
  settings   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
             CHECK (type IN ('pumping_station','qsr','pool','other')),
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
  category        TEXT        NOT NULL,      -- 'pump','compressor','pool_system','hvac'
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

-- ─────────────────────────────────────────────────────────────
-- TELEMETRY  (high-volume — partition by month in v2)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE telemetry (
  time      TIMESTAMPTZ      NOT NULL,
  device_id UUID             NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  tenant_id UUID             NOT NULL,       -- denormalized for fast filtering
  metric    TEXT             NOT NULL,       -- 'power_kw','flow_lpm','pressure_psi','temp_c'
  value     DOUBLE PRECISION NOT NULL,
  quality   SMALLINT         NOT NULL DEFAULT 0  -- 0=good 1=uncertain 2=bad
);

CREATE INDEX telemetry_lookup ON telemetry (tenant_id, device_id, time DESC);

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
-- RLS HELPER — call at the start of every DB transaction
-- ─────────────────────────────────────────────────────────────
-- SET LOCAL app.current_tenant_id = '<tenant_uuid_from_jwt>';
