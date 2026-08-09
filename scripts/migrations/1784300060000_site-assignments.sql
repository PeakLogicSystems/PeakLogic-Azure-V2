-- Tenant-side resource-level authorization (architecture-review Gap 2/ADR-002).
--
-- Confirmed asymmetry: the channel-partner side already has real, DB-enforced
-- resource-level authorization (a technician scoped to their assigned
-- territory's sites via channel_partner_can_read_site()/route_assignments).
-- The tenant side has none -- any admin/operator in a tenant can mutate ANY
-- device in that tenant, with no per-site or per-device ACL. This closes
-- that gap for `devices`, using the same "opt-in ACL, empty means unchanged
-- access" shape as the channel-partner side's own precedent.
--
-- Design, deliberately additive and backward-compatible:
--   - A user with ZERO rows in site_assignments keeps today's behavior
--     (full tenant access) -- most tenants are small and will never need
--     this. This is the stated migration path: existing tenants/users are
--     unaffected until an admin opts a user into scoped assignments.
--   - A user WITH at least one row is restricted to exactly those sites'
--     devices -- enforced as a RESTRICTIVE policy (narrows tenant_isolation's
--     grant, is not an independent grant of its own), so it can only ever
--     take access away from an opted-in user, never accidentally grant more.
--   - app.current_user_id is a NEW, OPTIONAL session variable -- withTenant()
--     only sets it when a caller passes one, so the 39 other existing
--     withTenant() call sites that don't pass it are completely unaffected
--     (app_uuid() returns NULL for an unset variable, and the policy's first
--     OR-branch below treats a NULL current_user_id as "not opted in to
--     this mechanism," identical to "no assignments").

-- Up Migration

CREATE TABLE site_assignments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id    UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, site_id)
);

ALTER TABLE site_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_assignments
  USING (tenant_id = app_uuid('app.current_tenant_id'));

CREATE INDEX site_assignments_user_idx ON site_assignments(user_id);
CREATE INDEX site_assignments_site_idx ON site_assignments(site_id);

-- RESTRICTIVE: AND-combines with the existing permissive tenant_isolation
-- policy on devices, so it can only narrow that grant, never widen it.
-- A device with no asset (asset_id NULL, an unclaimed/unassigned device)
-- has no site to scope by -- treated as visible to everyone in the tenant,
-- same as an unassigned user, rather than invisible to a scoped user for a
-- reason that has nothing to do with their assignment.
CREATE POLICY site_scoped_access ON devices AS RESTRICTIVE
  USING (
    app_uuid('app.current_user_id') IS NULL
    OR NOT EXISTS (SELECT 1 FROM site_assignments sa WHERE sa.user_id = app_uuid('app.current_user_id'))
    OR asset_id IS NULL
    OR EXISTS (
      SELECT 1 FROM assets a
      JOIN site_assignments sa ON sa.site_id = a.site_id
      WHERE a.id = devices.asset_id AND sa.user_id = app_uuid('app.current_user_id')
    )
  );

-- Down Migration

DROP POLICY IF EXISTS site_scoped_access ON devices;
DROP TABLE IF EXISTS site_assignments;
