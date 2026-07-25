-- PeakAssist — the first-class help/support content model.
-- Domain Model §2.14 (v2.0), PRD §5.22 / SRS §3.24.
--
-- PeakAssist content is PeakLogic-authored and GLOBAL — the same help serves
-- every tenant (a screen guide for the alarm panel is not tenant data). So
-- both tables are global reference catalogs (non-RLS, readable by all),
-- matching the posture of other platform reference tables. Per-tenant help
-- OVERRIDES are a deferred addition (would add a nullable tenant_id + a
-- platform-plus-override policy mirroring the Policy Engine's — not built
-- until a real need exists).
--
-- The cloud is the source of truth; each Hub carries a bundle offline
-- (PA-4.1) and pulls newer bundles when connectivity exists (PA-5.1). A Hub's
-- hubs.peakassist_content_version points at a bundle version here.

-- Up Migration

CREATE TABLE help_content_bundles (
  version      TEXT        PRIMARY KEY,        -- e.g. '2026.07.1' — what a Hub reports as its offline content version
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum     TEXT        NOT NULL,            -- integrity check for the synced bundle
  notes        TEXT
);
-- No RLS — global content-version catalog (see header).

CREATE TABLE help_content (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  help_context_key TEXT        NOT NULL,        -- the key an hmi_screen / cloud page declares (PA-2.1); binds a screen to its help
  type             TEXT        NOT NULL
                   CHECK (type IN ('screen_guide','procedure','alarm_explanation','troubleshooting','playbook','glossary')),
  title            TEXT        NOT NULL,
  body             TEXT        NOT NULL,
  alarm_type       TEXT,        -- deep-links an alerts.type value ('threshold'/'anomaly'/'device_silent'/…) to its explanation (PA-3.1)
  content_version  TEXT        REFERENCES help_content_bundles(version) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX help_content_context_idx ON help_content(help_context_key);
CREATE INDEX help_content_alarm_idx   ON help_content(alarm_type) WHERE alarm_type IS NOT NULL;
-- No RLS — global reference catalog (see header).

-- Down Migration

DROP TABLE IF EXISTS help_content;
DROP TABLE IF EXISTS help_content_bundles;
