-- Compliance automation — templates, generated reports, exceedance log.
-- Domain Model §2.13 (v2.0), PRD §5.21 / SRS §3.23.
--
-- The market wedge (wastewater NPDES/DMR first). Operator-assist only: the
-- operator remains the filer of record (CP-2.1) — nothing here transmits to a
-- regulator. Report GENERATION is independent of DELIVERY; automated delivery
-- (CP-5.1) is blocked on outbound infrastructure that does not exist yet
-- (shared with PW-7/PW-8, SET-8) and is deliberately not built here.
--
-- Scope split:
--   * compliance_templates — a GLOBAL reference catalog (the DMR report
--     definition is not tenant data). Non-RLS, PeakLogic-authored, readable by
--     all — same posture as other platform reference/ops tables. Per-tenant
--     custom templates are a deferred addition.
--   * compliance_reports / exceedance_records — real TENANT data -> standard
--     tenant_isolation RLS.

-- Up Migration

CREATE TABLE compliance_templates (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT        NOT NULL UNIQUE,     -- e.g. 'npdes_dmr'
  name       TEXT        NOT NULL,
  definition JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- parameters, limits, layout
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No RLS — global reference catalog (see header). PeakLogic-authored.

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
  content_ref     TEXT,        -- pointer to the rendered artifact (blob), once delivery infra exists
  source_data_ref JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- enough to reproduce the report from retained telemetry/alerts (CP-3.1)
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
  alert_id       UUID             REFERENCES alerts(id) ON DELETE SET NULL,  -- the operational alarm this exceedance derives from, if any
  metric         TEXT             NOT NULL,
  permit_limit   DOUBLE PRECISION NOT NULL,   -- the REGULATORY limit (distinct from an operational alarm threshold — the two can differ)
  observed_value DOUBLE PRECISION NOT NULL,
  permit_ref     TEXT,                          -- the permit/parameter this exceedance is against
  occurred_at    TIMESTAMPTZ      NOT NULL,
  created_at     TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX exceedance_records_site_idx ON exceedance_records(site_id, occurred_at DESC);
ALTER TABLE exceedance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE exceedance_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON exceedance_records
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- Down Migration

DROP TABLE IF EXISTS exceedance_records;
DROP TABLE IF EXISTS compliance_reports;
DROP TABLE IF EXISTS compliance_templates;
