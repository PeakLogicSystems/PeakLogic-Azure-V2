-- Audit log platform-scoped entries (TD-55, architecture-review Gap 8/ADR-005).
--
-- audit_log_entries_scope_check required EXACTLY one of tenant_id/
-- channel_partner_id, which rejected the INSERT outright for platform-scoped
-- actions: disabling an agent, a cost-kill-switch trip, and every WARDEN-TEN
-- tenant-isolation finding belong to neither one tenant nor one partner.
-- agent-operations-team-design.md §4.3/§10: "This is a hard prerequisite for
-- the first real agent action, not a follow-up."
--
-- The fix widens the CHECK from "exactly one of tenant/partner" to "not
-- both" -- tenant-only, partner-only, and platform-scoped (both null) are
-- now all valid; only claiming both scopes on the same row is rejected.
--
-- A third RLS policy makes a platform-scoped row visible only inside an
-- active staff session (app.current_staff_user_id set -- see
-- backend/shared/db.ts's withStaffSession()/resolveStaffSession()). An
-- ordinary tenant or channel-partner session never sees platform rows,
-- via the same "quiet deny on a NULL comparison" shape the existing
-- tenant_isolation/channel_partner_isolation policies already use
-- (app_uuid()'s own header comment, docs/data-model.sql).

-- Up Migration

ALTER TABLE audit_log_entries DROP CONSTRAINT audit_log_entries_scope_check;
ALTER TABLE audit_log_entries ADD CONSTRAINT audit_log_entries_scope_check CHECK (
  NOT (tenant_id IS NOT NULL AND channel_partner_id IS NOT NULL)
);

CREATE POLICY platform_scope_staff_visibility ON audit_log_entries
  USING (
    tenant_id IS NULL
    AND channel_partner_id IS NULL
    AND app_uuid('app.current_staff_user_id') IS NOT NULL
  );

-- Down Migration

DROP POLICY IF EXISTS platform_scope_staff_visibility ON audit_log_entries;

-- Note: this will fail if any platform-scoped rows (both tenant_id and
-- channel_partner_id null) were written while the widened constraint was
-- active -- those rows must be reassigned or removed before downgrading.
ALTER TABLE audit_log_entries DROP CONSTRAINT audit_log_entries_scope_check;
ALTER TABLE audit_log_entries ADD CONSTRAINT audit_log_entries_scope_check CHECK (
  (tenant_id IS NOT NULL AND channel_partner_id IS NULL)
  OR (tenant_id IS NULL AND channel_partner_id IS NOT NULL)
);
