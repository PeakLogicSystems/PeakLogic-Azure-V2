-- PeakView360 HMI configuration — screens, tags, historian pens.
-- Domain Model §2.10 (v2.0), PRD §5.18 / SRS §3.20.
--
-- Deliberate reuse, NOT re-invention:
--   * Alarms are the EXISTING `alerts` table. A PeakView360 alarm panel is a
--     projection over it (PV-2.1) — there is no alarm entity here.
--   * The historian reads the EXISTING `telemetry`/`telemetry_hourly` tables
--     (PV-3.1) — there is no new time-series store here.
-- What IS new: the operator SCREEN, the TAG (a source->canonical-metric map,
-- i.e. the Telemetry Normalization Fabric as a row — Platform Services #30),
-- and a saved multi-pen trend configuration.

-- Up Migration

CREATE TABLE hmi_screens (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id          UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  screen_type      TEXT        NOT NULL DEFAULT 'overview'
                   CHECK (screen_type IN ('overview','equipment','process')),
  layout           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  help_context_key TEXT        NOT NULL,   -- PA-2.1/PA-7.1: every screen declares its PeakAssist context (release gate)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hmi_screens_site_idx ON hmi_screens(site_id);
ALTER TABLE hmi_screens ENABLE ROW LEVEL SECURITY;
ALTER TABLE hmi_screens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hmi_screens
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE TABLE tags (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id          UUID             NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  hub_id           UUID             REFERENCES hubs(id) ON DELETE SET NULL,  -- null for a cloud-direct device metric
  source_ref       TEXT             NOT NULL,   -- PLC address (Modbus register / OPC-UA node) or 'device_id:metric'
  canonical_metric TEXT             NOT NULL,   -- maps a raw source value into the same space telemetry.metric uses
  unit             TEXT,
  scale            DOUBLE PRECISION NOT NULL DEFAULT 1,   -- raw -> engineering-unit linear transform…
  "offset"         DOUBLE PRECISION NOT NULL DEFAULT 0,   -- …value = raw * scale + offset  ("offset" is a reserved word)
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX tags_site_idx ON tags(site_id);
CREATE INDEX tags_hub_idx ON tags(hub_id);
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tags
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE TABLE historian_pens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  screen_id  UUID        REFERENCES hmi_screens(id) ON DELETE CASCADE,   -- a pen belongs to a screen…
  user_id    UUID        REFERENCES users(id) ON DELETE CASCADE,          -- …or a user's personal saved trend
  tag_id     UUID        REFERENCES tags(id) ON DELETE SET NULL,
  metric     TEXT,       -- used when the pen tracks a raw metric rather than a configured tag
  color      TEXT,
  axis       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (screen_id IS NOT NULL OR user_id IS NOT NULL),
  CHECK (tag_id IS NOT NULL OR metric IS NOT NULL)
);
ALTER TABLE historian_pens ENABLE ROW LEVEL SECURITY;
ALTER TABLE historian_pens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON historian_pens
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Down Migration

DROP TABLE IF EXISTS historian_pens;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS hmi_screens;
