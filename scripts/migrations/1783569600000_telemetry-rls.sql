-- Critical fix: the raw `telemetry` table was created without Row Level
-- Security, unlike every other tenant-scoped table (sites, assets, devices,
-- alerts, service_tickets, telemetry_hourly all have it). Combined with
-- telemetry.ts's list() query filtering only by device_id (no tenant_id
-- clause), this meant any authenticated user of any tenant could read any
-- other tenant's raw sensor data by supplying that tenant's device_id —
-- a live cross-tenant data exposure, not a theoretical gap. Found while
-- starting Multi-Tenant Architecture (#14); fixed immediately rather than
-- deferred to that document's normal code-reconciliation pass, given the
-- severity (SRS MT-1.1 requires every tenant-scoped table be RLS-protected;
-- this restores that guarantee for the one table where it was missing).

-- Up Migration

ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telemetry
  USING (tenant_id = app_uuid('app.current_tenant_id'));

-- Down Migration

DROP POLICY IF EXISTS tenant_isolation ON telemetry;
ALTER TABLE telemetry DISABLE ROW LEVEL SECURITY;
