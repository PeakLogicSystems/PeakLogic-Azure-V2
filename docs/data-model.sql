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
-- RLS SESSION-VARIABLE HELPER  (TD-52, added 2026-08-01)
-- ─────────────────────────────────────────────────────────────
-- Every RLS policy in this schema resolves the caller's scope from a session
-- variable. Reading one directly is a trap in two different ways:
--
--   current_setting('app.x')::uuid          -- raises "unrecognized
--                                           -- configuration parameter" when
--                                           -- the variable was never set
--   current_setting('app.x', true)::uuid    -- returns '' when unset, and
--                                           -- ''::uuid raises "invalid input
--                                           -- syntax for type uuid"
--
-- Both fail CLOSED (an error denies access), but both fail LOUDLY — a 500
-- rather than a clean "no rows", which makes a genuine missing-context bug
-- indistinguishable from a malformed-uuid bug at the call site. Surfaced for
-- real on 2026-08-01, the first time RLS was genuinely exercised against a
-- non-superuser connection.
--
-- app_uuid() returns NULL when the variable is unset or empty. Every policy
-- comparison then evaluates to NULL (not true), so the row is simply not
-- visible — a clean, quiet deny, which is what an RLS policy should do.
CREATE OR REPLACE FUNCTION app_uuid(p_setting TEXT) RETURNS UUID AS $$
  SELECT NULLIF(current_setting(p_setting, true), '')::uuid;
$$ LANGUAGE sql STABLE;


-- ─────────────────────────────────────────────────────────────
-- CHANNEL PARTNER GROUPS (holding companies, e.g. "Purple Standard")
-- migration 1784048400000, whitelabel-estate-branding-design.md (#35).
-- Same trust/access posture as channel_partners immediately below: NOT
-- tenant data, deliberately NOT RLS-enabled, application-layer (staff-only)
-- write access. Deliberately scoped to Purple Standard only for now (one
-- row) -- the mechanism is generic, the offering is not (a real, named
-- need, not built speculatively for every partner).
--
-- IMPORTANT: group membership is a CUSTOMER-facing branding-fallback
-- concept only -- it does NOT widen channel-partner-side data access. A
-- partner's own staff session is still scoped to exactly that partner's
-- channel_partner_id (channel_partner_can_read_site() below), never to
-- sibling partners in the same group.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE channel_partner_groups (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  branding   JSONB,       -- {logo_url, primary_color, secondary_color, tagline} -- same shape as channel_partners.branding
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  group_id     UUID        REFERENCES channel_partner_groups(id) ON DELETE SET NULL,  -- migration 1784048400000
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
  policy_epoch       INTEGER     NOT NULL DEFAULT 1,   -- Policy Engine cache-invalidation stamp (Design §4.2)
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
  USING (id = app_uuid('app.current_tenant_id'));
-- channel_partner_read's real (widened) definition is deferred to the end of
-- this file, in the channel_partner_read-policies section -- it needs `sites`
-- to exist first (migration 1784048400000, #35: also matches via a
-- site-level channel_partner_id override, not just the tenant's own
-- default), same reason sites' own channel_partner_read policy below is
-- deferred there instead of living in its own table block.

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
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- ─────────────────────────────────────────────────────────────
-- SITES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE sites (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  type               TEXT        NOT NULL
                     CHECK (type IN ('pumping_station','qsr','restaurant','pool','nursing_home',
                                      'retail','light_industrial','multifamily_residential','other')),
  address            JSONB,                          -- {street, city, state, zip, country}
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,
  timezone           TEXT        NOT NULL DEFAULT 'UTC',
  metadata           JSONB       NOT NULL DEFAULT '{}',
  -- Site-level override of the tenant's own channel_partner_id (migration
  -- 1784048400000, #35) -- NULL (the default) means "use the tenant's own
  -- attribution, unchanged." Set, it lets one tenant's sites be serviced by
  -- different channel partners (e.g. one customer, pools from WTR DR,
  -- wastewater from ACE Septic). See channel_partner_can_read_site() below
  -- for how this resolves under RLS.
  channel_partner_id UUID        REFERENCES channel_partners(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sites_channel_partner_idx ON sites(channel_partner_id) WHERE channel_partner_id IS NOT NULL;

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sites
  USING (tenant_id = app_uuid('app.current_tenant_id'));

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
  USING (tenant_id = app_uuid('app.current_tenant_id'));

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
  thing_name       TEXT        NOT NULL UNIQUE,   -- Legacy AWS IoT Core naming, carried over
                                -- unrenamed in the Azure pivot (same disclosed-but-unactioned
                                -- category as cognito_sub below) -- the Azure-native equivalent
                                -- is an IoT Hub device ID; renaming the column is a mechanical
                                -- follow-up, not attempted here to avoid an unrelated migration.
  firmware_version TEXT,   -- Free text, no release-channel concept -- unlike packages/domain/hubs.ts's
                           -- Hub.firmware (channel-scoped: stable/beta/preview). A real, disclosed
                           -- inconsistency between how Devices and Hubs model versioning; extend
                           -- ReleaseChannel down to Devices rather than inventing a second scheme.
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
  USING (tenant_id = app_uuid('app.current_tenant_id'));

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
  WITH CHECK (tenant_id = app_uuid('app.current_tenant_id'));

CREATE INDEX devices_asset_idx ON devices(asset_id);

-- ─────────────────────────────────────────────────────────────
-- SITE ASSIGNMENTS  (added migration 1784300060000, architecture-review
-- Gap 2/ADR-002 — tenant-side resource-level authorization)
--
-- Closes a confirmed asymmetry: the channel-partner side already scopes a
-- technician to their assigned territory's sites (channel_partner_can_read_
-- site()/route_assignments below); the tenant side had no per-site/
-- per-device ACL at all — any admin/operator could mutate any device in
-- the tenant. A user with ZERO rows here keeps full tenant access
-- (backward-compatible default); a user WITH at least one row is restricted
-- to exactly those sites' devices, via site_scoped_access below — a
-- RESTRICTIVE policy that can only narrow devices' existing tenant_isolation
-- grant, never widen it.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE site_assignments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id    UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, site_id)
);

ALTER TABLE site_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_assignments
  USING (tenant_id = app_uuid('app.current_tenant_id'));

CREATE INDEX site_assignments_user_idx ON site_assignments(user_id);
CREATE INDEX site_assignments_site_idx ON site_assignments(site_id);

-- RESTRICTIVE, not permissive: AND-combines with devices' tenant_isolation
-- policy rather than granting independently, so it can only take access
-- away from an opted-in user, never accidentally grant more. A device with
-- no asset yet (unclaimed/unassigned, asset_id NULL) has no site to scope
-- by and is treated as visible to everyone in the tenant.
CREATE POLICY site_scoped_access ON devices AS RESTRICTIVE
  USING (
    app_uuid('app.current_user_id') IS NULL
    OR NOT EXISTS (SELECT 1 FROM site_assignments sa WHERE sa.user_id = app_uuid('app.current_user_id'))
    OR asset_id IS NULL
    OR EXISTS (
      SELECT 1 FROM assets a
      JOIN site_assignments sa ON sa.site_id = a.site_id
      WHERE a.id = devices.asset_id AND sa.user_id = app_uuid('app.current_user_id')
    )
  );

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

-- Idempotency (migration 1784055300000, Enterprise Audit 2026-07-19 finding
-- 2.4b) — Event Hubs is at-least-once; a redelivered message carries the
-- identical device/time/metric triple (the device's own clock, echoed
-- verbatim on redelivery, not a freshly-stamped arrival time), so this is
-- the correct dedup key. backend/ingest/handler.ts inserts with
-- ON CONFLICT (device_id, time, metric) DO NOTHING and skips
-- metric_baselines/anomaly-scoring work for any metric that turns out to be
-- a duplicate — without that, a redelivered reading would silently
-- double-count into the EWMA baseline. Alert-level duplication was already
-- separately protected by createAlertAndMaybeTicket()'s own dedup.
CREATE UNIQUE INDEX telemetry_dedup_idx ON telemetry(device_id, time, metric);

-- RLS added 2026-07-09 (migration 1783569600000_telemetry-rls) — this table
-- was missing it while every other tenant-scoped table had it, a live
-- cross-tenant data exposure via GET /v1/telemetry?deviceId=<any tenant's
-- device>. See Multi-Tenant Architecture (#14) for the full writeup.
ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telemetry
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- ─────────────────────────────────────────────────────────────
-- POISON MESSAGES  (migration 1784055300000, Enterprise Audit 2026-07-19
-- finding 2.4a — Azure Functions has NO native dead-letter for Event
-- Hub/IoT Hub triggers; a message that fails processing was previously just
-- gone once Event Hubs' own retry policy gave up. NOT tenant data — often
-- the tenant isn't even resolvable when a message fails, which may be *why*
-- it failed — deliberately NOT RLS-enabled, same posture as
-- channel_partners/channel_partner_groups: a system/ops forensic table,
-- PeakLogic-internal access only.)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE poison_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT        NOT NULL DEFAULT 'ingest',
  raw_payload TEXT        NOT NULL,   -- the raw message body, even if it never parsed as JSON at all
  error       TEXT        NOT NULL,   -- the exception message/stack that caused processing to fail
  thing_name  TEXT,                   -- best-effort extraction from the payload; null if unparseable
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX poison_messages_received_idx ON poison_messages(received_at DESC);

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
  USING (tenant_id = app_uuid('app.current_tenant_id'));

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
  USING (tenant_id = app_uuid('app.current_tenant_id'));

CREATE INDEX metric_baselines_tenant_idx ON metric_baselines(tenant_id);

-- Not extended with a channel_partner_read policy — see telemetry_hourly's
-- note above; same reasoning.

-- ─────────────────────────────────────────────────────────────
-- AI ANALYTICS LAYER (Tier 1 scaffolding, migration 1783962000000)
-- ai-analytics-layer-design.md §4 — additive over metric_baselines above.
-- ai_models.tenant_id NULL = platform-scope/cross-fleet catalog (§6 — not
-- built; per-tenant only per the 2026-07-21 decision, no rows seeded).
-- ai_findings.model_id is nullable and left NULL by Tier 1's classical/
-- formula-based scoring — no trained artifact exists to reference.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE ai_models (
  id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID             REFERENCES tenants(id) ON DELETE CASCADE,
  scope_level   TEXT             NOT NULL CHECK (scope_level IN ('platform','tenant')),
  kind          TEXT             NOT NULL CHECK (kind IN ('anomaly','prediction','prescription')),
  asset_class   TEXT,
  metric        TEXT,
  method        TEXT             NOT NULL,
  artifact_ref  TEXT,
  metrics_json  JSONB,
  trained_at    TIMESTAMPTZ,
  enabled       BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT now()
);

ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_models FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_models
  USING (tenant_id IS NULL OR tenant_id = app_uuid('app.current_tenant_id'));

CREATE INDEX ai_models_tenant_idx ON ai_models(tenant_id);
CREATE INDEX ai_models_platform_scope_idx ON ai_models(asset_class, metric) WHERE scope_level = 'platform';

CREATE TABLE ai_findings (
  id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id     UUID             REFERENCES devices(id) ON DELETE CASCADE,
  model_id      UUID             REFERENCES ai_models(id) ON DELETE SET NULL,
  kind          TEXT             NOT NULL CHECK (kind IN ('anomaly','prediction','prescription')),
  score         DOUBLE PRECISION,
  horizon_days  INTEGER,
  explanation   JSONB            NOT NULL,
  alert_id      UUID             REFERENCES alerts(id) ON DELETE SET NULL,
  outcome_label TEXT,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT now()
);

ALTER TABLE ai_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_findings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_findings
  USING (tenant_id = app_uuid('app.current_tenant_id'));

CREATE INDEX ai_findings_tenant_idx ON ai_findings(tenant_id);
CREATE INDEX ai_findings_device_idx ON ai_findings(device_id, created_at DESC);

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
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- ─────────────────────────────────────────────────────────────
-- CMMS CONNECTORS  (reporting-and-kpi-design.md §2; migration
-- 1783875900000) — per-org config for pushing automated tickets into a
-- channel partner's (or tenant's) CMMS as work orders. credential_ref is a
-- Key Vault secret NAME, never the secret. Defined before service_tickets so
-- its cmms_connector_id FK resolves.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE cmms_connectors (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID        REFERENCES channel_partners(id) ON DELETE CASCADE,
  tenant_id          UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  vendor             TEXT        NOT NULL
                     CHECK (vendor IN ('generic_webhook','upkeep','fiix','limble','maintainx','maximo','servicetitan')),
  base_url           TEXT,
  credential_ref     TEXT,
  field_mapping      JSONB       NOT NULL DEFAULT '{}',
  inbound_mode       TEXT        NOT NULL DEFAULT 'none' CHECK (inbound_mode IN ('webhook','poll','none')),
  enabled            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cmms_connector_owner_check CHECK (
    (channel_partner_id IS NOT NULL AND tenant_id IS NULL)
    OR (channel_partner_id IS NULL AND tenant_id IS NOT NULL)
  )
);
ALTER TABLE cmms_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE cmms_connectors FORCE ROW LEVEL SECURITY;
CREATE POLICY cmms_connector_partner ON cmms_connectors
  USING (channel_partner_id = app_uuid('app.current_channel_partner_id'));
CREATE POLICY cmms_connector_tenant ON cmms_connectors
  USING (tenant_id = app_uuid('app.current_tenant_id'));
-- System read for the ingest dispatch path (same pattern as devices/assets ingest_lookup).
CREATE POLICY cmms_connector_ingest_read ON cmms_connectors FOR SELECT
  USING (current_setting('app.ingest_context', true) = 'true');
CREATE UNIQUE INDEX cmms_connector_one_active_partner
  ON cmms_connectors (channel_partner_id) WHERE enabled AND channel_partner_id IS NOT NULL;
CREATE UNIQUE INDEX cmms_connector_one_active_tenant
  ON cmms_connectors (tenant_id) WHERE enabled AND tenant_id IS NOT NULL;

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
  external_ref TEXT,                         -- CMMS work-order id (partner's ticket ID)
  -- CMMS dispatch attribution + funnel stages (migration 1783875900000)
  source             TEXT        NOT NULL DEFAULT 'manual'
                     CHECK (source IN ('automated','manual','api')),
  channel_partner_id UUID        REFERENCES channel_partners(id) ON DELETE SET NULL,
  cmms_connector_id  UUID        REFERENCES cmms_connectors(id) ON DELETE SET NULL,
  dispatched_at      TIMESTAMPTZ,            -- pushed to the CMMS
  accepted_at        TIMESTAMPTZ,            -- CMMS accepted the work order (inbound sync, step 2)
  due_at       TIMESTAMPTZ,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE service_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_tickets
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- Not extended with a channel_partner_read policy — no approved
-- requirement (TR-1-TR-3) needs a channel-partner session to read
-- tickets yet; add if/when one does, not preemptively.

-- ─────────────────────────────────────────────────────────────
-- CMMS ENTERPRISE MATURITY (reporting-and-kpi-design.md §2.2/§2.3/§6/§7
-- open decision #2, resolved 2026-08-09: first CMMS vendor = ServiceTitan,
-- named by The Purple Standard) — migration 1784300180000. See that
-- migration's own header for the full reasoning behind each addition.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE cmms_dispatch_outbox (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id     UUID        NOT NULL REFERENCES cmms_connectors(id) ON DELETE CASCADE,
  ticket_id        UUID        REFERENCES service_tickets(id) ON DELETE CASCADE,
  kind             TEXT        NOT NULL CHECK (kind IN ('work_order', 'billing_record')),
  payload          JSONB       NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempt_count    INT         NOT NULL DEFAULT 0,
  last_error       TEXT,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  external_ref     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cmms_dispatch_outbox_due_idx
  ON cmms_dispatch_outbox (tenant_id, next_attempt_at) WHERE status = 'pending';
ALTER TABLE cmms_dispatch_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE cmms_dispatch_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cmms_dispatch_outbox
  USING (tenant_id = app_uuid('app.current_tenant_id'));

CREATE INDEX service_tickets_connector_external_ref_idx
  ON service_tickets (cmms_connector_id, external_ref) WHERE external_ref IS NOT NULL;

-- Narrow system-context read: an inbound vendor webhook knows only the
-- CMMS's own work-order id, not which PeakLogic tenant it belongs to —
-- mirrors system_sweep_read/ingest_context's precedent exactly.
CREATE POLICY cmms_callback_lookup ON service_tickets FOR SELECT
  USING (current_setting('app.cmms_callback_context', true) = 'true');

-- Account-data cache (customers/locations/proposals/invoices pulled from a
-- connector's own CRM/Sales/Accounting APIs) — generic JSONB, not a rigid
-- per-field schema, since the exact record shape is vendor-specific and
-- unverified against a live account (see backend/shared/cmms/adapters/
-- servicetitan.ts's own header for exactly what is and isn't confirmed).
CREATE TABLE cmms_account_records (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id   UUID        NOT NULL REFERENCES cmms_connectors(id) ON DELETE CASCADE,
  tenant_id      UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  record_type    TEXT        NOT NULL CHECK (record_type IN ('customer', 'location', 'proposal', 'invoice')),
  external_id    TEXT        NOT NULL,
  data           JSONB       NOT NULL,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connector_id, record_type, external_id)
);
CREATE INDEX cmms_account_records_tenant_idx ON cmms_account_records (tenant_id) WHERE tenant_id IS NOT NULL;
ALTER TABLE cmms_account_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cmms_account_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cmms_account_records
  USING (tenant_id = app_uuid('app.current_tenant_id'));
-- A channel partner sees every record for connectors THEY own, mapped or
-- not — an unmapped record is exactly what a partner admin needs to see to
-- complete the tenant mapping in the first place.
CREATE POLICY cmms_account_records_partner ON cmms_account_records
  USING (EXISTS (
    SELECT 1 FROM cmms_connectors c
    WHERE c.id = cmms_account_records.connector_id
      AND c.channel_partner_id = app_uuid('app.current_channel_partner_id')
  ));
-- System context for the sync job (enumerate + upsert across every
-- connector — a connector-scoped sync has no natural per-tenant iteration
-- boundary the way a tenant sweep does).
CREATE POLICY cmms_account_records_sync_context ON cmms_account_records
  USING (current_setting('app.cmms_sync_context', true) = 'true');
CREATE POLICY cmms_connector_sync_context ON cmms_connectors FOR SELECT
  USING (current_setting('app.cmms_sync_context', true) = 'true');

-- Channel Partner Portal & Dispatch tables (below) are declared before
-- Audit Log Entries (further below, scope widened to also allow a third,
-- platform-scoped shape -- neither tenant nor partner -- by migration
-- 1784300000000, TD-55) so that audit_log_entries'
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
  USING (channel_partner_id = app_uuid('app.current_channel_partner_id'));

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
  USING (channel_partner_id = app_uuid('app.current_channel_partner_id'));

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
    channel_partner_id = app_uuid('app.current_channel_partner_id')
    AND (
      current_setting('app.current_channel_partner_role', true) = 'partner_admin'
      OR technician_user_id = app_uuid('app.current_channel_partner_user_id')
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
      WHERE channel_partner_id = app_uuid('app.current_channel_partner_id')
        AND (
          current_setting('app.current_channel_partner_role', true) = 'partner_admin'
          OR technician_user_id = app_uuid('app.current_channel_partner_user_id')
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
    staff_user_id = app_uuid('app.current_staff_user_id')
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
  -- Added by migration 1784300120000 (architecture-review Gap 13) — the
  -- request's correlation id (backend/shared/correlation.ts), nullable:
  -- an entry written outside an HTTP request's async chain (a scheduled
  -- job) has no request to derive one from. Opt-in enrichment, not a new
  -- access-control or lookup dimension -- deliberately unindexed.
  correlation_id                TEXT,
  -- Widened by migration 1784300000000 (TD-55): tenant-only, partner-only,
  -- AND platform-scoped (both null -- an agent action, a cost-kill-switch
  -- trip, a WARDEN-TEN finding) are all valid now; only claiming both
  -- scopes on one row is rejected. See platform_scope_staff_visibility
  -- below for how a platform-scoped row's RLS visibility is gated instead.
  CONSTRAINT audit_log_entries_scope_check CHECK (
    NOT (tenant_id IS NOT NULL AND channel_partner_id IS NOT NULL)
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
  USING (tenant_id = app_uuid('app.current_tenant_id'));
CREATE POLICY channel_partner_isolation ON audit_log_entries
  USING (channel_partner_id = app_uuid('app.current_channel_partner_id'));
-- Added by migration 1784300000000 (TD-55): a platform-scoped row (both
-- tenant_id and channel_partner_id null) is visible only inside an active
-- staff session -- an ordinary tenant/partner session never sets
-- app.current_staff_user_id, so this policy quietly denies them the same
-- way the two policies above deny a mismatched tenant/partner.
CREATE POLICY platform_scope_staff_visibility ON audit_log_entries
  USING (
    tenant_id IS NULL
    AND channel_partner_id IS NULL
    AND app_uuid('app.current_staff_user_id') IS NOT NULL
  );

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
-- Updated by migration 1784048400000 (#35): resolves the site's EFFECTIVE
-- partner as COALESCE(site-level override, tenant default) instead of the
-- tenant's channel_partner_id alone. For every site where the new
-- sites.channel_partner_id column is NULL (every row that existed before
-- that migration, and any row that doesn't need an override), COALESCE
-- falls through to the exact same tenant-level check as before —
-- byte-identical behavior for the common case.
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
      AND COALESCE(s.channel_partner_id, t.channel_partner_id) = app_uuid('app.current_channel_partner_id')
      AND (
        current_setting('app.current_channel_partner_role', true) = 'partner_admin'
        OR EXISTS (
          SELECT 1 FROM channel_partner_users cpu
          JOIN territories terr ON terr.id = cpu.territory_id
          WHERE cpu.id = app_uuid('app.current_channel_partner_user_id')
            -- ST_Covers, not ST_Contains — REAL BUG found and fixed 2026-08-01
            -- (Water-Sector Security Hardening Strategy §5, the same session
            -- that finally got a real Postgres/PostGIS integration test run
            -- for the first time): PostGIS has no ST_Contains(geography,
            -- geography) overload at all — it only exists for `geometry`.
            -- This function would have thrown "function st_contains(geography,
            -- geography) does not exist" on its very first real invocation,
            -- meaning a technician's territory-scoped site access has never
            -- actually worked, ever. ST_Covers is PostGIS's own recommended
            -- geography-native replacement (simpler boundary semantics, no
            -- geometry cast needed) — verified live, not guessed.
            AND ST_Covers(terr.boundary, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography)
        )
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Each policy below is a second, additional PERMISSIVE policy alongside
-- that table's existing tenant_isolation policy — Postgres OR-combines
-- them, so a normal tenant session (which never sets the channel-partner
-- GUCs) is completely unaffected.

-- tenants' channel_partner_read policy lives here (not in the tenants block
-- above) because, as of migration 1784048400000, it needs `sites` to exist
-- first — widened to also match via a site-level channel_partner_id
-- override, not just the tenant's own default. Required, not cosmetic: since
-- channel_partner_can_read_site() has no SECURITY DEFINER, its internal JOIN
-- into tenants is itself subject to tenants' own RLS — without this
-- widening, a mixed-attribution tenant's site-level override would silently
-- fail to resolve (the JOIN would never see the tenant row for a partner
-- that isn't the tenant's own default).
CREATE POLICY channel_partner_read ON tenants FOR SELECT
  USING (
    channel_partner_id = app_uuid('app.current_channel_partner_id')
    OR EXISTS (
      SELECT 1 FROM sites s
      WHERE s.tenant_id = tenants.id
        AND s.channel_partner_id = app_uuid('app.current_channel_partner_id')
    )
  );

-- Migration 1784051700000 (device-silence detection, Enterprise Audit
-- 2026-07-19 §3 P0 finding) — a THIRD permissive policy on tenants, narrowly
-- scoped to the scheduled silence-detection sweep's tenant-enumeration step.
-- Modeled on app.ingest_context's precedent: a SELECT-only marker set for
-- exactly the one query that needs it, never touching app.current_tenant_id.
-- The per-tenant work that follows uses ordinary withTenant() scoping,
-- unaffected by this marker. See that migration's header comment for the
-- full reasoning, including the disclosed row-vs-column-level RLS caveat.
CREATE POLICY system_sweep_read ON tenants FOR SELECT
  USING (current_setting('app.system_sweep_context', true) = 'true');

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
      WHERE aa.staff_user_id = app_uuid('app.current_staff_user_id')
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
-- POLICY ENGINE (Policy Engine Design §3) — config-driven alert rules /
-- device-config templates / notification rules. Seeded from the compiled-in
-- RULES_BY_CATEGORY (backend/ingest/rules.ts) as platform defaults; tenants
-- inherit and override. INERT at first (nothing reads it until the resolver +
-- POLICY_ENGINE_ENABLED flag land). Isolation is the standard tenant model
-- PLUS a global-read allowance for the platform-default catalog (tenant_id NULL).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE policies (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        REFERENCES tenants(id) ON DELETE CASCADE,   -- NULL = platform default
  scope_level  TEXT        NOT NULL CHECK (scope_level IN ('platform','tenant','site','asset')),
  scope_id     UUID,
  category     TEXT        NOT NULL,
  kind         TEXT        NOT NULL CHECK (kind IN ('threshold','config_template','notification')),
  definition   JSONB       NOT NULL,
  enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  version      INTEGER     NOT NULL DEFAULT 1,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT policies_scope_check CHECK (
    (scope_level = 'platform' AND tenant_id IS NULL)
    OR (scope_level = 'tenant' AND tenant_id IS NOT NULL)
    OR (scope_level IN ('site','asset') AND tenant_id IS NOT NULL AND scope_id IS NOT NULL)
  )
);
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies FORCE ROW LEVEL SECURITY;
-- Every tenant reads the platform-default catalog (tenant_id NULL)...
CREATE POLICY policies_platform_read ON policies FOR SELECT
  USING (tenant_id IS NULL);
-- ...and reads/writes ONLY its own scoped rows (blocks writing another
-- tenant's or a platform row, since tenant_id NULL never equals a set id).
CREATE POLICY policies_tenant_rw ON policies FOR ALL
  USING (tenant_id = app_uuid('app.current_tenant_id'));
CREATE INDEX policies_resolve_idx ON policies (category, kind, tenant_id, scope_level);

-- Append-only change history (Design §3.5) — safety-critical config must be
-- reconstructable. Empty until override CRUD lands.
CREATE TABLE policy_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id   UUID        NOT NULL,
  tenant_id   UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  version     INTEGER     NOT NULL,
  definition  JSONB       NOT NULL,
  enabled     BOOLEAN     NOT NULL,
  changed_by  TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason      TEXT
);
ALTER TABLE policy_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_history FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_history_platform_read ON policy_history FOR SELECT
  USING (tenant_id IS NULL);
CREATE POLICY policy_history_tenant_rw ON policy_history FOR ALL
  USING (tenant_id = app_uuid('app.current_tenant_id'));
CREATE INDEX policy_history_policy_idx ON policy_history (policy_id, version);

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


-- ═══════════════════════════════════════════════════════════════════════════
-- UNIFIED PLATFORM (v2.0) — PeakView360 HMI · PeakLogic Hubs · CMMS ·
-- Compliance · PeakAssist. Domain Model §2.10–§2.14. Mirrors migrations
-- 1784142000000 … 1784142240000. Tenant data uses standard tenant_isolation
-- RLS; global reference catalogs (compliance_templates, help_content*) are
-- non-RLS PeakLogic-authored tables, same posture as other reference/ops tables.
-- ═══════════════════════════════════════════════════════════════════════════

-- PeakLogic Hubs — on-prem edge fleet (§2.11). Edge infra bound to one Site,
-- distinct from Device. (migration 1784142000000)
CREATE TABLE hubs (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id                    UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name                       TEXT        NOT NULL,
  hardware_serial            TEXT,
  agent_version              TEXT,
  peakassist_content_version TEXT,        -- value-links help_content_bundles.version
  status                     TEXT        NOT NULL DEFAULT 'offline'
                             CHECK (status IN ('online','offline','provisioning')),
  last_seen_at               TIMESTAMPTZ,
  protocol_config            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hubs_site_idx ON hubs(site_id);
ALTER TABLE hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hubs
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- PeakView360 HMI config (§2.10). Alarms = existing `alerts`; historian reads
-- existing telemetry — only screens/tags/pens are new. (migration 1784142060000)
CREATE TABLE hmi_screens (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id          UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  screen_type      TEXT        NOT NULL DEFAULT 'overview'
                   CHECK (screen_type IN ('overview','equipment','process')),
  layout           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  help_context_key TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hmi_screens_site_idx ON hmi_screens(site_id);
ALTER TABLE hmi_screens ENABLE ROW LEVEL SECURITY;
ALTER TABLE hmi_screens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hmi_screens
  USING (tenant_id = app_uuid('app.current_tenant_id'));

CREATE TABLE tags (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id          UUID             NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  hub_id           UUID             REFERENCES hubs(id) ON DELETE SET NULL,
  source_ref       TEXT             NOT NULL,
  canonical_metric TEXT             NOT NULL,
  unit             TEXT,
  scale            DOUBLE PRECISION NOT NULL DEFAULT 1,
  "offset"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX tags_site_idx ON tags(site_id);
CREATE INDEX tags_hub_idx ON tags(hub_id);
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tags
  USING (tenant_id = app_uuid('app.current_tenant_id'));

CREATE TABLE historian_pens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  screen_id  UUID        REFERENCES hmi_screens(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES users(id) ON DELETE CASCADE,
  tag_id     UUID        REFERENCES tags(id) ON DELETE SET NULL,
  metric     TEXT,
  color      TEXT,
  axis       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (screen_id IS NOT NULL OR user_id IS NOT NULL),
  CHECK (tag_id IS NOT NULL OR metric IS NOT NULL)
);
ALTER TABLE historian_pens ENABLE ROW LEVEL SECURITY;
ALTER TABLE historian_pens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON historian_pens
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- Built-in CMMS (§2.12). service_tickets IS the work order (extended below);
-- pm_schedules + the previously-missing service_visits are new.
-- (migration 1784142120000)
CREATE TABLE pm_schedules (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id      UUID        REFERENCES assets(id) ON DELETE CASCADE,
  category      TEXT,
  title         TEXT        NOT NULL,
  interval_days INTEGER     NOT NULL CHECK (interval_days > 0),
  next_due_at   TIMESTAMPTZ NOT NULL,
  template      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  enabled       BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (asset_id IS NOT NULL OR category IS NOT NULL)
);
CREATE INDEX pm_schedules_due_idx ON pm_schedules(next_due_at) WHERE enabled;
ALTER TABLE pm_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm_schedules
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- Extend service_tickets (= the work order): complete the dispatch funnel and
-- link PM-generated work orders. (FK added as a constraint here because
-- service_tickets is defined earlier in this snapshot than pm_schedules.)
ALTER TABLE service_tickets ADD COLUMN on_site_at     TIMESTAMPTZ;
ALTER TABLE service_tickets ADD COLUMN completed_at   TIMESTAMPTZ;
ALTER TABLE service_tickets ADD COLUMN pm_schedule_id UUID;
ALTER TABLE service_tickets ADD CONSTRAINT service_tickets_pm_schedule_fk
  FOREIGN KEY (pm_schedule_id) REFERENCES pm_schedules(id) ON DELETE SET NULL;

CREATE TABLE service_visits (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id    UUID        NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  outcome      TEXT,        -- supervised label the AI feedback loop consumes (#34 §3)
  on_site_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX service_visits_ticket_idx ON service_visits(ticket_id);
ALTER TABLE service_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_visits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_visits
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- Compliance automation (§2.13). templates = global catalog (non-RLS);
-- reports + exceedances = tenant data. (migration 1784142180000)
CREATE TABLE compliance_templates (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT        NOT NULL UNIQUE,
  name       TEXT        NOT NULL,
  definition JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No RLS — global reference catalog.

CREATE TABLE compliance_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id         UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  template_id     UUID        REFERENCES compliance_templates(id) ON DELETE SET NULL,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','issued')),
  generated_at    TIMESTAMPTZ,
  content_ref     TEXT,
  source_data_ref JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX compliance_reports_site_idx ON compliance_reports(site_id);
ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compliance_reports
  USING (tenant_id = app_uuid('app.current_tenant_id'));

CREATE TABLE exceedance_records (
  id             UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id        UUID             NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  alert_id       UUID             REFERENCES alerts(id) ON DELETE SET NULL,
  metric         TEXT             NOT NULL,
  permit_limit   DOUBLE PRECISION NOT NULL,
  observed_value DOUBLE PRECISION NOT NULL,
  permit_ref     TEXT,
  occurred_at    TIMESTAMPTZ      NOT NULL,
  created_at     TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX exceedance_records_site_idx ON exceedance_records(site_id, occurred_at DESC);
ALTER TABLE exceedance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE exceedance_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON exceedance_records
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- PeakAssist help content (§2.14). Global PeakLogic-authored catalogs; a Hub
-- carries a bundle offline and syncs newer ones. (migration 1784142240000)
CREATE TABLE help_content_bundles (
  version      TEXT        PRIMARY KEY,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum     TEXT        NOT NULL,
  notes        TEXT
);
-- No RLS — global content-version catalog.

CREATE TABLE help_content (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  help_context_key TEXT        NOT NULL,
  type             TEXT        NOT NULL
                   CHECK (type IN ('screen_guide','procedure','alarm_explanation','troubleshooting','playbook','glossary')),
  title            TEXT        NOT NULL,
  body             TEXT        NOT NULL,
  alarm_type       TEXT,
  content_version  TEXT        REFERENCES help_content_bundles(version) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX help_content_context_idx ON help_content(help_context_key);
CREATE INDEX help_content_alarm_idx   ON help_content(alarm_type) WHERE alarm_type IS NOT NULL;
-- No RLS — global reference catalog.
