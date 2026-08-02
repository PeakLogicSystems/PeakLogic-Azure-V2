-- PeakLogic Hubs — on-prem edge fleet.
-- Domain Model §2.11 (v2.0), PRD §5.19 / SRS §3.21.
--
-- Productizes PeakLogic Edge (windows-hub/), which had no database entity of
-- its own. A Hub is edge INFRASTRUCTURE bound to exactly one Site — distinct
-- from Device (the monitored thing). A hub-relayed Device (Device Onboarding
-- #27, Path B) acquires through a Hub; a direct-connect Device (Path A) does
-- not. Reuses the same online/offline vocabulary as devices.status so the
-- existing silence-detection concept generalizes to Hubs later.

-- Up Migration

CREATE TABLE hubs (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id                    UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name                       TEXT        NOT NULL,
  hardware_serial            TEXT,
  agent_version              TEXT,
  peakassist_content_version TEXT,        -- value-links help_content_bundles.version (PA-5.1 "content current as of…")
  status                     TEXT        NOT NULL DEFAULT 'offline'
                             CHECK (status IN ('online','offline','provisioning')),
  last_seen_at               TIMESTAMPTZ,
  protocol_config            JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- which PLC/RTU protocol(s)+endpoints this Hub polls (HUB-1.1)
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX hubs_site_idx ON hubs(site_id);

ALTER TABLE hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hubs
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- Down Migration

DROP TABLE IF EXISTS hubs;
