-- Correlation ID on audit_log_entries (architecture-review Gap 13).
--
-- Zero correlation-ID mechanism existed anywhere in the request pipeline
-- before this (confirmed by a repo-wide grep: zero matches for
-- correlationId/x-correlation-id/x-request-id). Without one, answering
-- "which request caused this audit entry?" required manually correlating
-- timestamps across logs. backend/shared/correlation.ts generates or
-- forwards one per request (AsyncLocalStorage, propagated with zero
-- changes to any existing route handler's signature); writeAuditLog()
-- (backend/shared/audit.ts) now reads it implicitly and writes it here.
--
-- Nullable and unindexed on purpose: this is a plain, opt-in enrichment
-- of an existing evidentiary record (Database Schema §4.3's append-only
-- audit_log_entries), not a new access-control or lookup dimension — a
-- row written outside an HTTP request's async chain (a scheduled job)
-- simply has no correlation id, which is a real, disclosed limitation of
-- that entry point, not something this column pretends to fix.

-- Up Migration

ALTER TABLE audit_log_entries ADD COLUMN correlation_id TEXT;

-- Down Migration

ALTER TABLE audit_log_entries DROP COLUMN correlation_id;
