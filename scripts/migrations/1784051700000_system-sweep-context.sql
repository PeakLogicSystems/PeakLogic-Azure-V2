-- System-sweep RLS carve-out for device-silence detection (Enterprise Audit
-- 2026-07-19 §3 P0 finding, backend/jobs/silence-detection*.ts).
--
-- The device-silence sweep is a scheduled job (not a human request, not a
-- device pushing telemetry) that needs to know WHICH tenants exist before it
-- can loop over each one with the existing, unmodified withTenant() scoping
-- to do the real per-tenant work (find silent devices, create alerts). That
-- enumeration step -- "give me every tenant id" -- has no existing RLS path:
-- tenant_isolation only matches the caller's OWN tenant; channel_partner_read
-- only matches a partner's attributed tenants. Neither fits a system sweep.
--
-- Modeled on the EXISTING app.ingest_context precedent (devices/assets'
-- ingest_lookup policies) -- a narrowly-scoped, SELECT-only session marker
-- that grants exactly one specific read, set for exactly the query that
-- needs it, and never touching app.current_tenant_id. The per-tenant work
-- that follows enumeration uses ordinary withTenant()/app.current_tenant_id
-- scoping, completely unaffected by this marker -- this policy exists ONLY
-- so the enumeration SELECT itself has somewhere to stand.
--
-- Real gap this does NOT create: this policy only grants SELECT on tenants,
-- and the sweep's own code (silence-detection-handler.ts) only ever selects
-- `id` -- but RLS is row-level, not column-level, so anyone extending this
-- query in the future should remember the GRANT itself is full-row, even
-- though today's caller only reads one column. Documented so a future editor
-- doesn't assume column-level restriction exists.

-- Up Migration

CREATE POLICY system_sweep_read ON tenants FOR SELECT
  USING (current_setting('app.system_sweep_context', true) = 'true');

-- Down Migration

DROP POLICY IF EXISTS system_sweep_read ON tenants;
