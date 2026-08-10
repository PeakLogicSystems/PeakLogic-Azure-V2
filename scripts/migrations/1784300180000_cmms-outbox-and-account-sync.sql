-- Up Migration
--
-- CMMS enterprise maturity (reporting-and-kpi-design.md §2.2/§2.3/§6 phase-1-
-- remaining-items, §7 open decision #2 resolved 2026-08-09: first CMMS
-- vendor = ServiceTitan, named by The Purple Standard). Three additions:
--
-- 1. A durable dispatch outbox — closes the "fire-and-forget, no retry"
--    gap alerts.ts's createTicketForAlert() has disclosed in its own
--    comment since it was written. Rows are never deleted, only
--    transitioned pending -> sent|failed, so the table doubles as a
--    dispatch audit trail. Covers both outbound kinds: work-order pushes
--    (existing) and the new billing-record export (this pass).
-- 2. A lookup index + a narrow system-context read policy on
--    service_tickets so an inbound vendor webhook — which knows only the
--    CMMS's own work-order id, not which PeakLogic tenant it belongs to —
--    can find the right ticket before switching into real tenant-scoped
--    RLS context to perform the actual write (advanceWorkOrderStage(),
--    unchanged). Mirrors system_sweep_read/ingest_context's precedent
--    exactly: a narrowly-scoped marker for the one query that genuinely
--    needs cross-tenant shape, nothing else gated behind it.
-- 3. An account-data cache (customers/locations/proposals/invoices pulled
--    from a connector's own CRM/Sales/Accounting APIs) — the "receive data
--    about customer accounts, proposals, and billing" half of the ask.
--    Deliberately a generic JSONB cache, not a rigid per-field schema: the
--    exact record shape is vendor-specific and unverified against a live
--    account (see backend/shared/cmms/adapters/servicetitan.ts's own header
--    for exactly what is and isn't confirmed). tenant_id is nullable — a
--    record is cached the moment it's pulled, and mapped to a PeakLogic
--    tenant only once an admin confirms the match; an unmapped record is
--    still visible to the owning partner so they can complete that mapping.

CREATE TABLE cmms_dispatch_outbox (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id     UUID        NOT NULL REFERENCES cmms_connectors(id) ON DELETE CASCADE,
  ticket_id        UUID        REFERENCES service_tickets(id) ON DELETE CASCADE, -- null for a billing_record not tied to one ticket
  kind             TEXT        NOT NULL CHECK (kind IN ('work_order', 'billing_record')),
  payload          JSONB       NOT NULL,   -- the normalized WorkOrder or BillingRecord, serialised
  status           TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempt_count    INT         NOT NULL DEFAULT 0,
  last_error       TEXT,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  external_ref     TEXT,       -- the vendor's own id once confirmed (Job id, Invoice id, ...)
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

CREATE POLICY cmms_callback_lookup ON service_tickets FOR SELECT
  USING (current_setting('app.cmms_callback_context', true) = 'true');

CREATE TABLE cmms_account_records (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id   UUID        NOT NULL REFERENCES cmms_connectors(id) ON DELETE CASCADE,
  tenant_id      UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  record_type    TEXT        NOT NULL CHECK (record_type IN ('customer', 'location', 'proposal', 'invoice')),
  external_id    TEXT        NOT NULL,  -- the vendor's own record id
  data           JSONB       NOT NULL,  -- the vendor's own record, as returned
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
-- System context for the sync job itself (enumerate + upsert across every
-- connector, not one tenant at a time — a connector-scoped sync has no
-- natural per-tenant iteration boundary the way a tenant sweep does).
CREATE POLICY cmms_account_records_sync_context ON cmms_account_records
  USING (current_setting('app.cmms_sync_context', true) = 'true');
CREATE POLICY cmms_connector_sync_context ON cmms_connectors FOR SELECT
  USING (current_setting('app.cmms_sync_context', true) = 'true');

-- Down Migration

DROP POLICY IF EXISTS cmms_connector_sync_context ON cmms_connectors;
DROP TABLE IF EXISTS cmms_account_records;
DROP POLICY IF EXISTS cmms_callback_lookup ON service_tickets;
DROP INDEX IF EXISTS service_tickets_connector_external_ref_idx;
DROP TABLE IF EXISTS cmms_dispatch_outbox;
