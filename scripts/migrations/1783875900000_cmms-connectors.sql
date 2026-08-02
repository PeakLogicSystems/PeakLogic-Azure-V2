-- CMMS connector framework + service-ticket dispatch attribution
-- (reporting-and-kpi-design.md §2, §6 phase 1 — connector framework + outbound push).
--
-- Adds the per-org CMMS connector config and the attribution columns that make
-- an automated ticket a measurable, dispatched work order. INERT for anyone
-- who configures no connector: ingest keeps posting to the legacy
-- tenants.settings.webhook_url, now routed through the generic_webhook adapter,
-- so existing behaviour is preserved exactly (the adapter wraps the same
-- SSRF-guarded postWebhook).
--
-- Isolation: cmms_connectors is a tenant/partner-owned config table (RLS), with
-- a system read for the ingest dispatch path — the same ingest_context pattern
-- devices/assets already use for their pre-tenant lookup.

-- Up Migration

CREATE TABLE cmms_connectors (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID        REFERENCES channel_partners(id) ON DELETE CASCADE,
  tenant_id          UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  vendor             TEXT        NOT NULL
                     CHECK (vendor IN ('generic_webhook','upkeep','fiix','limble','maintainx','maximo','servicetitan')),
  base_url           TEXT,
  credential_ref     TEXT,                 -- Key Vault secret NAME, never the secret itself
  field_mapping      JSONB       NOT NULL DEFAULT '{}',
  inbound_mode       TEXT        NOT NULL DEFAULT 'none'
                     CHECK (inbound_mode IN ('webhook','poll','none')),
  enabled            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- exactly one owner: a channel partner OR a tenant, not both/neither
  CONSTRAINT cmms_connector_owner_check CHECK (
    (channel_partner_id IS NOT NULL AND tenant_id IS NULL)
    OR (channel_partner_id IS NULL AND tenant_id IS NOT NULL)
  )
);
ALTER TABLE cmms_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE cmms_connectors FORCE ROW LEVEL SECURITY;
-- A partner manages its own connector.
CREATE POLICY cmms_connector_partner ON cmms_connectors
  USING (channel_partner_id = app_uuid('app.current_channel_partner_id'));
-- A tenant manages its own (tenant-owned) connector.
CREATE POLICY cmms_connector_tenant ON cmms_connectors
  USING (tenant_id = app_uuid('app.current_tenant_id'));
-- The ingest dispatch path may READ any connector to route an auto-ticket to
-- the owning tenant's attributed partner — SELECT only, system path, same
-- pattern as devices/assets ingest_lookup (data-model.sql).
CREATE POLICY cmms_connector_ingest_read ON cmms_connectors FOR SELECT
  USING (current_setting('app.ingest_context', true) = 'true');

-- One active connector per owner (LIMIT-1 resolution relies on this).
CREATE UNIQUE INDEX cmms_connector_one_active_partner
  ON cmms_connectors (channel_partner_id) WHERE enabled AND channel_partner_id IS NOT NULL;
CREATE UNIQUE INDEX cmms_connector_one_active_tenant
  ON cmms_connectors (tenant_id) WHERE enabled AND tenant_id IS NOT NULL;

-- Dispatch attribution + the funnel's early stages (reporting-and-kpi-design.md
-- §2.2, §3). Existing rows default to source='manual'; a data backfill (not in
-- this migration) reclassifies alert-generated rows to 'automated'.
ALTER TABLE service_tickets ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('automated','manual','api'));
ALTER TABLE service_tickets ADD COLUMN channel_partner_id UUID
  REFERENCES channel_partners(id) ON DELETE SET NULL;
ALTER TABLE service_tickets ADD COLUMN cmms_connector_id UUID
  REFERENCES cmms_connectors(id) ON DELETE SET NULL;
ALTER TABLE service_tickets ADD COLUMN dispatched_at TIMESTAMPTZ;   -- pushed to the CMMS
ALTER TABLE service_tickets ADD COLUMN accepted_at   TIMESTAMPTZ;   -- CMMS accepted the work order (inbound sync, step 2)

CREATE INDEX service_tickets_dispatch_idx
  ON service_tickets (channel_partner_id, source, dispatched_at);

-- Down Migration

DROP INDEX IF EXISTS service_tickets_dispatch_idx;
ALTER TABLE service_tickets DROP COLUMN IF EXISTS accepted_at;
ALTER TABLE service_tickets DROP COLUMN IF EXISTS dispatched_at;
ALTER TABLE service_tickets DROP COLUMN IF EXISTS cmms_connector_id;
ALTER TABLE service_tickets DROP COLUMN IF EXISTS channel_partner_id;
ALTER TABLE service_tickets DROP COLUMN IF EXISTS source;
DROP TABLE IF EXISTS cmms_connectors;
