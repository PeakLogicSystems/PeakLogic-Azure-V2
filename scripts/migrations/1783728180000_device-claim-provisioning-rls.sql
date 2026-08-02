-- Found by directly asking "does anything else break under FORCE ROW LEVEL
-- SECURITY" (migration 1783728060000) and auditing every DB-touching code
-- path in the repo, not assumed complete after fixing the ingest handler.
-- Two more real, live consequences found, both in the same class as the
-- ingest bug: code that connects with no RLS session variable set at all,
-- performing real data operations on `devices` rows that don't have a
-- tenant yet.
--
-- 1. backend/api/routes/devices.ts's claim() -- an authenticated tenant
--    user claiming a device by serial. Looks up the device (tenant_id IS
--    NULL, since it isn't claimed yet) via an unscoped pool connection, then
--    UPDATEs it to set tenant_id. Under FORCE RLS, both the lookup and the
--    update would be blocked outright -- the entire device-onboarding flow
--    would silently break, the same way ingest would have.
--
-- 2. scripts/provision-devices.ts -- an offline, ops-run script (real
--    AWS/DB credentials, not reachable via any API) that pre-provisions
--    devices with tenant_id = NULL, ready for a customer to claim later.
--    Connects via a plain, unscoped Pool -- its INSERT would be rejected by
--    the same tenant_isolation WITH CHECK every other table now enforces,
--    and its SELECT queries (idempotency check, next-serial-number lookup)
--    would silently see zero rows once FORCE takes effect.
--
--    A subtlety caught before shipping, not after: the "next serial number"
--    query (nextSerials(), scanning MAX(serial)) needs to see EVERY device
--    ever provisioned -- claimed or not -- to avoid generating a duplicate
--    serial. A policy scoped to "unclaimed devices only" would silently
--    undercount already-claimed devices and risk a real collision. That
--    needs a broader, dedicated trusted-script marker (app.provisioning_
--    context), not the same narrow "unclaimed only" policy claim() uses.
--
-- Design: policies layered by how much access each caller actually needs
-- -- not one broad exemption reused everywhere.
--
-- CORRECTED before this migration was ever deployed anywhere, found on a
-- third full-repo pass the user explicitly asked for ("do one more full
-- pass"): the first draft of unclaimed_lookup was `USING (tenant_id IS
-- NULL)` with NO session marker at all -- a real, unintended leak.
-- Permissive RLS policies OR-combine across EVERY query on a table, not
-- just the one line of application code that "meant" to use them -- a
-- marker-less policy scoped only by a WHERE-style condition (`tenant_id IS
-- NULL`) doesn't restrict WHICH query can see those rows, only WHICH rows
-- a query that already runs can see. That meant devices.ts's list() and
-- getOne() (plain withTenant(), no special marker) would have silently
-- started returning every unclaimed device in the whole system to every
-- tenant, alongside their own claimed ones -- discovering that a device
-- with a given serial/thing_name exists in the provisioning pool, before
-- anyone had claimed it. Not the ingest/provisioning-style "would break
-- and return nothing" failure mode this whole sweep had been looking for
-- until now -- the opposite: would have silently returned MORE than
-- intended. Caught by re-auditing with that specific question ("could a
-- new permissive policy leak into a query it wasn't meant for") rather
-- than re-running the same "does this still work" check a third time.
--
--   - unclaimed_lookup: SELECT a device with tenant_id IS NULL, gated on a
--     new app.claim_context session marker -- set ONLY by claim()'s own
--     lookup-by-serial query, not by list()/getOne(). A tenant can still
--     only discover an unclaimed device by already knowing its serial
--     (the claim() flow), never by browsing their own device list.
--   - provision_unclaimed: INSERT of a new device row, gated on
--     app.provisioning_context (already set by provision-devices.ts for
--     its other queries -- extended to cover this one too, for the same
--     narrow-marker consistency, even though no REST route reaches this
--     INSERT today either way).
--   - provisioning_lookup: a broader SELECT, also gated on
--     app.provisioning_context (mirrors app.ingest_context's pattern) --
--     sees every device regardless of tenant, needed specifically for
--     collision-safe serial-number generation. Only ever set by
--     scripts/provision-devices.ts, a trusted, offline, operator-run
--     script with direct DB credentials -- same trust level already
--     extended to migrations and to the ingest Lambda.
--
-- device_claim (UPDATE) ties the claim transition to the CALLER's own
-- tenant via WITH CHECK, using app.current_tenant_id (set by claim()'s
-- withTenant() call) -- real defense-in-depth, not just a workaround: even
-- a future bug that tried to claim a device into an arbitrary tenant would
-- be rejected at the database layer, not just trusted at the application
-- layer. Left USING (tenant_id IS NULL) with no additional marker
-- deliberately, not an oversight: the SELECT-side fix above already closes
-- the actual discovery/enumeration vector (a tenant can no longer find an
-- unclaimed device's id via list()/getOne()), so reaching this UPDATE at
-- all already requires already knowing a specific unclaimed device's id --
-- and the WITH CHECK still only allows claiming it into the caller's own
-- tenant, never anyone else's.

-- A third, separate bug found while designing this fix, unrelated to RLS:
-- devices.tenant_id is declared NOT NULL in the schema, but claim() and
-- provision-devices.ts's entire design assumes it can be NULL before a
-- device is claimed (provision-devices.ts explicitly INSERTs tenant_id =
-- NULL; claim() explicitly checks `if (existing.tenant_id) return
-- conflict(...)`). This has been broken since before this session --
-- completely independent of the RLS bug, would have failed with a NOT NULL
-- constraint violation on the very first provisioning INSERT regardless of
-- any RLS policy. Fixed here since it's a direct, necessary precondition
-- for the RLS policies below (device_claim's `USING (tenant_id IS NULL)`
-- can never match any row while the column can't hold NULL at all).

-- Up Migration

ALTER TABLE devices ALTER COLUMN tenant_id DROP NOT NULL;

CREATE POLICY unclaimed_lookup ON devices FOR SELECT
  USING (tenant_id IS NULL AND current_setting('app.claim_context', true) = 'true');

CREATE POLICY provision_unclaimed ON devices FOR INSERT
  WITH CHECK (tenant_id IS NULL AND current_setting('app.provisioning_context', true) = 'true');

CREATE POLICY provisioning_lookup ON devices FOR SELECT
  USING (current_setting('app.provisioning_context', true) = 'true');

CREATE POLICY device_claim ON devices FOR UPDATE
  USING (tenant_id IS NULL)
  WITH CHECK (tenant_id = app_uuid('app.current_tenant_id'));

-- Down Migration

DROP POLICY IF EXISTS device_claim ON devices;
DROP POLICY IF EXISTS provisioning_lookup ON devices;
DROP POLICY IF EXISTS provision_unclaimed ON devices;
DROP POLICY IF EXISTS unclaimed_lookup ON devices;

-- Only safe to re-add NOT NULL if no unclaimed (NULL) devices currently
-- exist -- this would fail loudly against real data rather than silently
-- corrupting anything, which is the correct failure mode for a down
-- migration that's undoing a deliberate schema relaxation.
ALTER TABLE devices ALTER COLUMN tenant_id SET NOT NULL;
