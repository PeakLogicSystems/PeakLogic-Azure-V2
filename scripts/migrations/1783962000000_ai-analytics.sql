-- AI Analytics Layer — Tier 1 (anomaly detection) scaffolding
-- (ai-analytics-layer-design.md, artifact #34 — §4 schema, §8 phasing step 1).
--
-- INERT until AI_ANALYTICS_ENABLED=true (backend/ingest/handler.ts) — same
-- zero-default-behaviour-change discipline as the Policy Engine migration.
-- metric_baselines already existed (Policy Engine era) but nothing ever wrote
-- to it; baseline.ts's maintenance write is NOT flag-gated (see its header
-- comment) so this migration doesn't touch metric_baselines itself, only adds
-- the two new tables the AI layer needs on top of it.
--
-- ai_models.tenant_id NULL = platform-scope / cross-fleet catalog (design §6).
-- Per the 2026-07-21 decision, cross-fleet models are NOT built — per-tenant
-- only for now — so no platform-scope row is seeded here; the column exists
-- so the schema doesn't need another migration when that's revisited.
--
-- ai_findings.model_id is nullable and left NULL by Tier 1's classical/
-- formula-based scoring (anomaly.ts) — there is no trained artifact to
-- reference for EWMA/z-score math, only a formula, so fabricating a
-- placeholder ai_models row just to satisfy a non-null FK would misrepresent
-- what Tier 1 actually is. Reserved for Tier 2+ real trained models.
--
-- alerts.type is unconstrained TEXT (no CHECK exists today) — 'anomaly' and
-- (later) 'prediction' need no schema change there, just this comment as the
-- documentation trail.

-- Up Migration

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

-- Same shape as the Policy Engine's `policies` table: tenant_id NULL rows are
-- a global-read catalog (no staff-write policy wired yet — nothing writes
-- platform-scope rows today; add one alongside whatever admin tool first
-- creates a cross-fleet model), tenant_id-set rows are normal tenant
-- isolation.
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

-- Standard tenant isolation, no ingest_context carve-out needed (unlike
-- devices/assets' pre-claim lookup): by the time handler.ts writes a finding,
-- app.current_tenant_id is already set (step 3b runs after tenant resolution
-- in step 1/step "Tenant now known").
CREATE POLICY tenant_isolation ON ai_findings
  USING (tenant_id = app_uuid('app.current_tenant_id'));

CREATE INDEX ai_findings_tenant_idx ON ai_findings(tenant_id);
CREATE INDEX ai_findings_device_idx ON ai_findings(device_id, created_at DESC);

-- Down Migration

DROP INDEX IF EXISTS ai_findings_device_idx;
DROP INDEX IF EXISTS ai_findings_tenant_idx;
DROP TABLE IF EXISTS ai_findings;

DROP INDEX IF EXISTS ai_models_platform_scope_idx;
DROP INDEX IF EXISTS ai_models_tenant_idx;
DROP TABLE IF EXISTS ai_models;
