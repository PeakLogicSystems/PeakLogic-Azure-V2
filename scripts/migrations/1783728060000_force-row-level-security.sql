-- Critical fix, found while verifying RLS coverage for Multi-Tenant
-- Architecture v1.1 (channel-partner amendment): RLS has never actually
-- been enforced by this application for ANY table, ever -- a foundational
-- bug that predates the channel-partner work entirely and affects every
-- tenant-scoped table in the schema.
--
-- Root cause: the application's only DB credential (peaklogic_admin,
-- infra/lib/data-stack.ts's `rds.Credentials.fromGeneratedSecret`) is also
-- the role scripts/migrate.ts runs every migration as (DB_USER defaults to
-- the same 'peaklogic_admin') -- meaning it OWNS every table it queries.
-- PostgreSQL's documented behavior: a table's owner bypasses Row-Level
-- Security by default, regardless of how many `ENABLE ROW LEVEL SECURITY`
-- statements or policies exist, UNLESS the table is additionally altered
-- with `FORCE ROW LEVEL SECURITY`. No table in this schema has ever had
-- that applied. AWS RDS PostgreSQL specifically blocks granting BYPASSRLS
-- (confirmed via RDS docs) -- so that mechanism isn't in play here, but the
-- separate, easier-to-miss table-ownership bypass has been silently active
-- since the very first migration.
--
-- Practical consequence: every RLS policy in this schema -- including the
-- original "critical" telemetry cross-tenant fix (migration
-- 1783569600000_telemetry-rls.sql) and everything Database Schema v1.1
-- just built for the channel-partner portal -- has been inert against the
-- only role that ever actually queries these tables. This has never been
-- caught because nothing has ever been deployed against a real database
-- (mvp-roadmap.md Blocker #1) -- it's a latent bug, not (yet) a live
-- exploit, but would have been the instant a real deploy happened.
--
-- The fix: FORCE ROW LEVEL SECURITY makes the table owner subject to the
-- same policies as every other role -- the minimal, surgical fix for the
-- actual problem. Introducing a separate, non-owning application DB role
-- (real security best practice per AWS's own RDS guidance -- "have your
-- application connect... as a user other than the owner") is a valid
-- future hardening step, but a materially bigger infrastructure change
-- (new role, new grants, credential/migration re-plumbing) not required to
-- close this specific gap -- flagged as a real open question (Multi-Tenant
-- Architecture §6), not silently deferred.

-- A second, related gap found in the same pass: `tenants` itself has never
-- had RLS enabled at all -- not missing FORCE, missing entirely. Today this
-- doesn't matter in practice (the only role that ever queries it is the
-- table owner, and every current query already filters by an explicit,
-- trusted WHERE id = $1), but forcing RLS everywhere else while leaving
-- `tenants` wide open is inconsistent, and -- more concretely -- this
-- migration's own channel_partner_can_read_site() dependency (Database
-- Schema §4.4) JOINs into `tenants` to resolve channel_partner_id; without
-- a policy permitting that read, FORCE-ing RLS on sites/assets/etc. above
-- would silently break every channel-partner read this session just built,
-- since the JOIN would see zero tenant rows. Fixed here, not deferred,
-- since it's a direct correctness dependency of this same migration, not a
-- separate concern.

-- A third, directly-caused consequence found while designing this fix:
-- backend/ingest/handler.ts connects with NO RLS session variable set at
-- all (its own comment said "no RLS — ingest is a system operation") and
-- looks up a device by thing_name before it even knows which tenant that
-- device belongs to. Once FORCE actually takes effect, that lookup would
-- be blocked outright, silently breaking telemetry ingestion — the single
-- most important data path in the product. Fixed here, and in
-- backend/ingest/handler.ts itself (same commit): a new app.ingest_context
-- session marker permits ONLY a SELECT-by-thing_name lookup on devices/
-- assets, narrowly scoped to that one operation; the instant the device's
-- tenant_id is resolved, the handler switches to normal
-- app.current_tenant_id scoping for every remaining query in the same
-- transaction. Ends up more correctly isolated than the old "unscoped
-- bypass" framing, not a weaker version of it.

-- Up Migration

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (id = app_uuid('app.current_tenant_id'));
CREATE POLICY channel_partner_read ON tenants FOR SELECT
  USING (channel_partner_id = app_uuid('app.current_channel_partner_id'));

CREATE POLICY ingest_lookup ON devices FOR SELECT
  USING (current_setting('app.ingest_context', true) = 'true');
CREATE POLICY ingest_lookup ON assets FOR SELECT
  USING (current_setting('app.ingest_context', true) = 'true');

ALTER TABLE users                 FORCE ROW LEVEL SECURITY;
ALTER TABLE sites                 FORCE ROW LEVEL SECURITY;
ALTER TABLE assets                FORCE ROW LEVEL SECURITY;
ALTER TABLE devices               FORCE ROW LEVEL SECURITY;
ALTER TABLE telemetry             FORCE ROW LEVEL SECURITY;
ALTER TABLE telemetry_hourly      FORCE ROW LEVEL SECURITY;
ALTER TABLE metric_baselines      FORCE ROW LEVEL SECURITY;
ALTER TABLE alerts                FORCE ROW LEVEL SECURITY;
ALTER TABLE service_tickets       FORCE ROW LEVEL SECURITY;
ALTER TABLE territories           FORCE ROW LEVEL SECURITY;
ALTER TABLE channel_partner_users FORCE ROW LEVEL SECURITY;
ALTER TABLE route_assignments     FORCE ROW LEVEL SECURITY;
ALTER TABLE route_stops           FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log_entries     FORCE ROW LEVEL SECURITY;

-- Down Migration

DROP POLICY IF EXISTS ingest_lookup ON assets;
DROP POLICY IF EXISTS ingest_lookup ON devices;

DROP POLICY IF EXISTS channel_partner_read ON tenants;
DROP POLICY IF EXISTS tenant_isolation ON tenants;
ALTER TABLE tenants NO FORCE ROW LEVEL SECURITY;
ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;

ALTER TABLE users                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE sites                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE assets                NO FORCE ROW LEVEL SECURITY;
ALTER TABLE devices               NO FORCE ROW LEVEL SECURITY;
ALTER TABLE telemetry             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE telemetry_hourly      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE metric_baselines      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE alerts                NO FORCE ROW LEVEL SECURITY;
ALTER TABLE service_tickets       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE territories           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE channel_partner_users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE route_assignments     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE route_stops           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log_entries     NO FORCE ROW LEVEL SECURITY;
