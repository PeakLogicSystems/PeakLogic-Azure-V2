-- Built-in CMMS — work orders, PM schedules, and the missing service_visits.
-- Domain Model §2.12 (v2.0), PRD §5.20 / SRS §3.22.
--
-- Reconciliation decision (Domain Model §6.9): the EXISTING `service_tickets`
-- table IS the work order — it already carries the CMMS dispatch-attribution
-- and funnel columns added by migration 1783875900000 (source,
-- channel_partner_id, cmms_connector_id, dispatched_at, accepted_at). We
-- extend it here rather than create a parallel `work_orders` table (which
-- would fork the alarm-driven ticket path that already exists). Two funnel
-- timestamps (on_site_at, completed_at) complete the dispatched -> accepted
-- -> on_site -> completed funnel the Reporting/KPI design (#32) specified;
-- pm_schedule_id links PM-generated work orders back to their schedule.
--
-- `service_visits` is the real reconciliation FINDING: it is referenced by
-- BOTH the Reporting/KPI design (#32) and the AI Analytics feedback-loop
-- design (#34, where service_visits.outcome is the supervised training label
-- that closes detect -> dispatch -> outcome -> learn) — but it was never
-- created. This migration creates it, closing a gap two approved/draft
-- designs already depend on.

-- Up Migration

CREATE TABLE pm_schedules (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id      UUID        REFERENCES assets(id) ON DELETE CASCADE,  -- a specific asset…
  category      TEXT,                                                  -- …or an asset category (e.g. all 'pump' assets)
  title         TEXT        NOT NULL,
  interval_days INTEGER     NOT NULL CHECK (interval_days > 0),
  next_due_at   TIMESTAMPTZ NOT NULL,
  template      JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- the work-order body to generate when due
  enabled       BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (asset_id IS NOT NULL OR category IS NOT NULL)   -- scoped to something
);
CREATE INDEX pm_schedules_due_idx ON pm_schedules(next_due_at) WHERE enabled;
ALTER TABLE pm_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm_schedules
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Extend the existing service_tickets (= the work order) — complete the funnel
-- and link PM-generated work orders to their schedule.
ALTER TABLE service_tickets ADD COLUMN on_site_at     TIMESTAMPTZ;                                          -- funnel step 3 (accepted_at already exists = step 2)
ALTER TABLE service_tickets ADD COLUMN completed_at   TIMESTAMPTZ;                                          -- funnel step 4
ALTER TABLE service_tickets ADD COLUMN pm_schedule_id UUID REFERENCES pm_schedules(id) ON DELETE SET NULL;  -- set for PM-generated work orders

CREATE TABLE service_visits (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id    UUID        NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,  -- the work order this visit resolved
  outcome      TEXT,        -- the supervised label the AI feedback loop consumes (#34 §3); free-text at MVP
  on_site_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX service_visits_ticket_idx ON service_visits(ticket_id);
ALTER TABLE service_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_visits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_visits
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Down Migration

DROP TABLE IF EXISTS service_visits;
ALTER TABLE service_tickets DROP COLUMN IF EXISTS pm_schedule_id;
ALTER TABLE service_tickets DROP COLUMN IF EXISTS completed_at;
ALTER TABLE service_tickets DROP COLUMN IF EXISTS on_site_at;
DROP TABLE IF EXISTS pm_schedules;
