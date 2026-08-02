-- Internal Administration Console + Settings & Preferences + drill-down
-- device filter (Database Schema §4.5, Domain Model §2.8, PRD/SRS v1.6).
--
-- The core design decision: this migration does NOT add any new
-- permissive policy to users/sites/assets/devices/alerts or any other
-- operational table. The Administration Console's cross-tenant WRITE
-- access is granted by verifying an account_assignments row, then
-- setting app.current_tenant_id and handing off to the *existing*,
-- already-hardened tenant_isolation policies -- see
-- backend/shared/db.ts's withStaffActingOnTenant(). The only new RLS
-- surface below is on the two tables genuinely new to this migration,
-- plus one additive policy on tenants (which already had RLS + FORCE).
--
-- channel_partners is deliberately NOT given RLS in this migration --
-- it never had any, and retrofitting it would require re-auditing every
-- existing caller first (see Database Schema §4.5/§6 item 7). Superadmin-
-- only channel-partner creation is enforced at the application layer.

-- Up Migration

CREATE TABLE peaklogic_staff_users (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub  TEXT        NOT NULL UNIQUE,
  email        TEXT        NOT NULL,
  display_name TEXT,
  role         TEXT        NOT NULL CHECK (role IN ('superadmin','account_manager')),
  status       TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE peaklogic_staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE peaklogic_staff_users FORCE ROW LEVEL SECURITY;
-- Keyed on cognito_sub, not id -- withStaffSession() (backend/shared/db.ts)
-- must resolve a staff user's own row FROM their cognito_sub (the one thing
-- known pre-lookup, straight off the JWT), so id can't be the match column
-- here (that's exactly the id it's trying to discover). Mirrors
-- withChannelPartner()'s "ordering matters" pattern (db.ts) -- the
-- session variable used for self-lookup must be one already knowable
-- before the row is found, not one only the row itself can supply.
CREATE POLICY staff_self_or_superadmin ON peaklogic_staff_users
  USING (
    cognito_sub = current_setting('app.current_staff_cognito_sub', true)
    OR current_setting('app.current_staff_role', true) = 'superadmin'
  );

CREATE TABLE account_assignments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id       UUID        NOT NULL REFERENCES peaklogic_staff_users(id) ON DELETE CASCADE,
  tenant_id           UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  channel_partner_id  UUID        REFERENCES channel_partners(id) ON DELETE CASCADE,
  assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by         UUID        NOT NULL REFERENCES peaklogic_staff_users(id),
  CONSTRAINT account_assignments_scope_check CHECK (
    (tenant_id IS NOT NULL AND channel_partner_id IS NULL)
    OR (tenant_id IS NULL AND channel_partner_id IS NOT NULL)
  ),
  UNIQUE (staff_user_id, tenant_id),
  UNIQUE (staff_user_id, channel_partner_id)
);
ALTER TABLE account_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY account_assignment_visibility ON account_assignments
  USING (
    staff_user_id = app_uuid('app.current_staff_user_id')
    OR current_setting('app.current_staff_role', true) = 'superadmin'
  );
CREATE INDEX account_assignments_staff_idx ON account_assignments(staff_user_id);
CREATE INDEX account_assignments_tenant_idx ON account_assignments(tenant_id);

-- Additive policy on tenants -- superadmin unconditional (including
-- INSERT, since the condition doesn't reference the row); account_manager
-- scoped to assigned tenants only, and automatically denied INSERT since
-- a not-yet-existing tenant can never match an existing assignment row.
-- Verified against PostgreSQL's own documentation: a USING-only policy
-- (no explicit WITH CHECK) is reused as WITH CHECK too, so this single
-- policy correctly governs SELECT/UPDATE/DELETE/INSERT all at once.
CREATE POLICY staff_tenant_access ON tenants
  USING (
    current_setting('app.current_staff_role', true) = 'superadmin'
    OR EXISTS (
      SELECT 1 FROM account_assignments aa
      WHERE aa.staff_user_id = app_uuid('app.current_staff_user_id')
        AND aa.tenant_id = tenants.id
    )
  );

-- users.role's CHECK constraint still allowed 'service_partner' even
-- though the Cognito group that would ever create one was removed in
-- Security Architecture v1.1 -- found while amending Domain Model §2.1.
-- Safe: no row can hold this value today (verified before writing this).
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','operator'));

-- Per-user display preferences (SET-3/SET-4/SET-5). NULL means "use the
-- application default" -- no backfill needed for existing rows.
ALTER TABLE users ADD COLUMN clock_format TEXT CHECK (clock_format IN ('12h','24h'));
ALTER TABLE users ADD COLUMN timezone TEXT;
ALTER TABLE users ADD COLUMN theme TEXT CHECK (theme IN ('light','dark'));

-- Third audit-log actor column (Domain Model §2.6). At most one of the
-- three actor columns non-null -- all three null remains a legitimate
-- system-triggered entry.
ALTER TABLE audit_log_entries ADD COLUMN actor_staff_user_id UUID
  REFERENCES peaklogic_staff_users(id) ON DELETE SET NULL;
ALTER TABLE audit_log_entries DROP CONSTRAINT audit_log_entries_actor_check;
ALTER TABLE audit_log_entries ADD CONSTRAINT audit_log_entries_actor_check CHECK (
  (CASE WHEN actor_id IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN actor_channel_partner_user_id IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN actor_staff_user_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
);

-- Down Migration

ALTER TABLE audit_log_entries DROP CONSTRAINT audit_log_entries_actor_check;
ALTER TABLE audit_log_entries ADD CONSTRAINT audit_log_entries_actor_check CHECK (
  NOT (actor_id IS NOT NULL AND actor_channel_partner_user_id IS NOT NULL)
);
ALTER TABLE audit_log_entries DROP COLUMN IF EXISTS actor_staff_user_id;

ALTER TABLE users DROP COLUMN IF EXISTS theme;
ALTER TABLE users DROP COLUMN IF EXISTS timezone;
ALTER TABLE users DROP COLUMN IF EXISTS clock_format;

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','operator','service_partner'));

DROP POLICY IF EXISTS staff_tenant_access ON tenants;

DROP TABLE IF EXISTS account_assignments;
DROP TABLE IF EXISTS peaklogic_staff_users;
