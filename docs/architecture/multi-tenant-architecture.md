# Multi-Tenant Architecture

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.4), [SRS](srs.md) (approved v1.4), [Domain Model](domain-model.md) (approved v1), [Database Schema](database-schema.md) (approved v1), [Security Architecture](security-architecture.md) (approved v1)
**Last updated:** 2026-07-09

---

## 1. Introduction

### 1.1 Purpose

SRS §3.5 (MT-1–MT-3) states the multi-tenancy baseline — RLS-enforced isolation via `withTenant()`, Cognito-scoped auth claims, no modality-specific isolation logic — and Security Architecture §1.2 explicitly deferred "tenant-isolation architecture" here rather than redesigning it. This document formalizes that pattern, verifies it's actually complete (it wasn't — see §2.2), and covers what neither SRS nor Security Architecture scoped: tenant lifecycle (provisioning, suspension) and resource-sharing/noisy-neighbor posture.

### 1.2 Scope

In scope: the RLS tenant-isolation pattern and why it's safe under Lambda connection pooling, a full audit of RLS coverage across the schema (prompted by finding a real gap while starting this document), the tenant identity/role resolution path (`getAuth()`), tenant lifecycle (provisioning, status, suspension enforcement), and resource-sharing posture at MVP scale.

Out of scope: general RBAC/role-model design (→ Security Architecture, #13, already approved), infrastructure sizing/deployment topology beyond what's needed to reason about tenant isolation (→ Deployment Architecture, #15), and device-specific tenant scoping (→ Device & Command Security Architecture, #12, already approved — device/asset/site tenant scoping is inherited automatically via the existing foreign-key chain into RLS-protected tables, per MT-3.1, not redesigned here).

---

## 2. Tenant Isolation Architecture

### 2.1 The RLS Pattern (existing, reconciled)

Every tenant-scoped table carries a `tenant_id` column and an identical `tenant_isolation` RLS policy: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`. The application never sets this per-connection — `backend/shared/db.ts`'s `withTenant()` wraps every operation in an explicit transaction (`BEGIN` / `SET LOCAL app.current_tenant_id = $1` / the operation / `COMMIT`), then releases the connection back to the pool. **This is safe under connection pooling specifically because `SET LOCAL` is transaction-scoped, not session-scoped** — it automatically resets at `COMMIT`/`ROLLBACK`, so a warm Lambda container reusing a pooled connection across unrelated requests (`max: 2` per container) can never leak one tenant's scoping into the next request on the same connection. This is the correct pattern for this failure mode; it's worth stating explicitly because `SET` (session-scoped) instead of `SET LOCAL` here would have been a real, classic connection-pooling-plus-RLS bug — the code already gets this right (`db.ts`'s own comment already flags why).

### 2.2 Critical gap found and fixed: `telemetry` had no RLS at all

**The gap:** every tenant-scoped table in `docs/data-model.sql` enables RLS with the identical `tenant_isolation` policy — except the raw `telemetry` table, which had neither `ENABLE ROW LEVEL SECURITY` nor any policy. `backend/api/routes/telemetry.ts`'s `list()` handler queries `WHERE device_id = $1` with no `tenant_id` clause, relying entirely on RLS for tenant scoping (the same pattern every other read handler uses, e.g. `sites.getOne`'s `WHERE id = $1`). Since RLS wasn't active on this one table, **any authenticated user of any tenant could read any other tenant's raw sensor telemetry — pressure, temperature, leak-detection state, power draw — simply by supplying another tenant's `device_id`.** This was live and exploitable in already-shipped v1.0.0 code, not a design gap.

**Why SRS MT-1.1 and Compliance & Certification Roadmap §4 both said this was already reconciled:** both statements were true for every table anyone had checked against the pattern, but neither document's review actually enumerated every `CREATE TABLE` and verified RLS coverage row-by-row — they took the *pattern's* correctness as evidence of *universal application*, which doesn't follow. This document's §2.2 review is the first time that enumeration was actually done.

**Fixed 2026-07-09 (commit `cf581ee`, migration `1783569600000_telemetry-rls.sql`), before this document was even drafted, given severity** — the same `tenant_isolation` policy every other table uses, mirrored into `docs/data-model.sql`. A full sweep (`awk` over every `CREATE TABLE`/`ENABLE ROW LEVEL SECURITY` pair in the schema) confirmed this was the only table with the gap, and that `telemetry` is the only other place `telemetry` rows are touched at all — `backend/ingest/handler.ts`'s write path, which intentionally bypasses RLS via an unscoped pool connection since it's a trusted system process writing across tenants (existing, documented exception, not a gap).

**No change made to `telemetry.ts`'s query itself.** Every other read handler in this codebase (`sites.getOne`, `assets.getOne`, `devices.getOne`, etc.) also has zero explicit `tenant_id` filtering in SQL and relies purely on RLS — that's the established, single-source-of-truth pattern this system is built around (MT-1.1's own wording: isolation is enforced by RLS, not per-query filters). Adding a redundant filter to `telemetry.ts` alone, now that its RLS is fixed, would be inconsistent with every other route rather than a genuine improvement — the root-cause fix (§2.2) is complete on its own.

### 2.3 Real gap found: role resolution fails open, not closed

**The gap:** `backend/shared/auth.ts`'s `getAuth()` resolves tenant and role from Cognito JWT claims. The `tenant_id` claim fails **closed** correctly — a missing `custom:tenant_id` throws a 403 (`'User has no tenant assigned'`). But the role claim doesn't: `const role = groups[0] ?? 'operator'` — a Cognito user with **no group assignment at all** silently defaults to `'operator'`, a real, working role with read/write access to most of the tenant's data, rather than being rejected the same way the missing-tenant case is.

**Why this matters less than §2.2, but still matters:** this doesn't cross a tenant boundary — `tenantId` still comes correctly from the user's own JWT claim, so a role-less user only gets excess privilege within their *own* tenant, not access to another tenant's data. The realistic trigger is an operator mistake (an admin invites a Cognito user via the admin-invite-only flow and forgets to assign a group), not an external attack path — self-signup is disabled (`auth-stack.ts`), so there's no way for an outside party to create a role-less account themselves.

**Recommendation:** make this fail closed, mirroring the `tenant_id` check immediately above it in the same function — throw a 403 (`'User has no role assigned'`) when `groups.length === 0`, instead of defaulting to `'operator'`. This is a one-line change with no architectural implications, queued as code reconciliation (§7).

---

## 3. Tenant Lifecycle

### 3.1 Provisioning (existing, no gap — matches PRD §8's explicit scope)

No API endpoint or code path creates a `tenants` row — tenant provisioning is a manual, ops-side process today (documented only in the SysAdmin Guide). This isn't a gap to close: PRD §8 explicitly scopes "self-serve tenant onboarding" as intentionally not an MVP requirement, since MVP validates the product thesis with a small number of design-partner tenants, not general availability. Noted here so a future reader doesn't mistake the absence of a `POST /v1/tenants` endpoint for an oversight.

### 3.2 Real gap found: tenant suspension is schema-only, not enforced

**The gap:** `tenants.status` supports `active`/`suspended`/`trial` (`docs/data-model.sql`), but no code anywhere in `backend/` reads or checks it — grep for `status` in any tenant-related context returns nothing. A tenant marked `suspended` in the database can still fully use the platform: `withTenant()` only ever sets the RLS scoping variable, it never checks whether the tenant it's scoping to is actually allowed to be operating right now.

**Severity, and why this is different from §2.2:** this doesn't breach isolation either — a suspended tenant's users still only see their own tenant's data, correctly scoped. The gap is business-logic, not security-boundary: suspension (e.g., for non-payment or a ToS issue) currently has no actual effect on API access, which undermines the entire point of the `status` column existing.

**Recommendation:** add a check in `getAuth()` or `withTenant()` — most naturally `withTenant()`, since it's the one function every tenant-scoped operation already goes through — that queries `tenants.status` for the resolved `tenantId` and rejects (403) if `suspended`. This does mean one extra query per request; acceptable at MVP scale, and cacheable later if it becomes a real cost. Queued as code reconciliation (§7), not fixed in this draft — unlike §2.2, this requires an actual design call (where exactly the check belongs) rather than a pure one-liner, so it's left for review rather than implemented pre-emptively.

---

## 4. Resource Sharing & Noisy-Neighbor Posture (MVP-acceptable, flagged for later)

All tenants share one RDS instance (`db.t3.micro`, `multiAz: false` — both already have "flip for prod" comments in `data-stack.ts`), and each Lambda container's connection pool caps at 2 connections (`db.ts`, `max: 2`). There's no per-tenant resource quota, query timeout, or rate limit beyond the platform-wide API Gateway throttling (Security Architecture §3.4, 200 burst/100 rate, shared across all tenants). At the current design-partner-tenant scale (PRD §8) this is a reasonable MVP posture — the same reasoning Compliance & Certification Roadmap §5 already applied to `multiAz`/`deletionProtection`. **Not a gap to fix now**, but a real constraint to revisit before onboarding a tenant whose usage pattern could meaningfully starve others (e.g., a very high telemetry-ingest volume vertical) — most naturally as part of Deployment Architecture (#15), which owns infrastructure sizing.

---

## 5. Traceability

| Section | Traces to |
|---|---|
| §2.1 RLS Pattern | MT-1.1 (SRS §3.5) |
| §2.2 `telemetry` RLS gap | New finding — already fixed (commit `cf581ee`), corrects SRS MT-1.1 and Compliance & Certification Roadmap §4's "already reconciled" claims, which were accurate for the pattern but not for its universal application |
| §2.3 Role fail-open gap | New finding — no existing requirement covers this |
| §3.1 Provisioning | PRD §8 (explicitly out of MVP scope) |
| §3.2 Suspension enforcement gap | New finding — `tenants.status` (Database Schema) has no enforcing code |
| §4 Resource sharing | Compliance & Certification Roadmap §5 (same "flip for prod" reasoning already applied elsewhere) |

---

## 6. Open Questions

1. **§2.3's role fail-open fix is recommended but not yet implemented** — a one-line code-reconciliation change (`getAuth()` throws instead of defaulting to `'operator'`).
2. **§3.2's suspension enforcement is recommended but needs a design call** (where the check belongs — `getAuth()` vs. `withTenant()` — and whether to cache tenant status to avoid a query-per-request cost) before implementation, unlike §2.3's straightforward one-liner.
3. **§4's resource-sharing posture is explicitly deferred, not resolved** — revisit in Deployment Architecture (#15) before onboarding a tenant with a meaningfully different usage profile than today's design partners.

---

## 7. Review Log

Not yet reviewed — draft v0.1.
