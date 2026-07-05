# Database Schema

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.4), [SRS](srs.md) (approved v1.4), [Domain Model](domain-model.md) (approved v1), [Compliance & Certification Roadmap](compliance-certification-roadmap.md) (approved v1), [User Personas](user-personas.md) (approved v1.1), [User Stories](user-stories.md) (approved v1), [UX Wireframes](ux-wireframes.md) (approved v1.2), [Information Architecture](information-architecture.md) (approved v1)
**Last updated:** 2026-07-04

---

## 1. Introduction

### 1.1 Purpose

The Domain Model named entities and relationships but explicitly deferred "exact column types, constraints, indexing for any entity" (Domain Model §5) to this document. This is also the first **implementation-facing** artifact in the sequence — everything before it described what the product does and looks like; this one, and API Specification (#11) after it, describe how it's actually built. `docs/data-model.sql` is this document's executable companion, not a competing source: this document narrates and justifies the decisions; the SQL file is where they're expressed as DDL.

### 1.2 Scope

In scope: physical schema conventions (naming, types, PK/FK strategy), the RLS multi-tenancy pattern as a mandatory template for future tables, the two new decisions the Domain Model explicitly left open (telemetry retention/rollup storage, and a migration strategy — `docs/data-model.sql` today is a "run once at first deploy" script with no versioned upgrade path), and indexing rationale. Out of scope: request/response payload shapes (→ API Specification, #11), the analytics *compute* that populates MetricBaseline and the rollup table defined here (a scheduled job, not yet designed), and the actuation/command audit schema (→ Device & Command Security Architecture, #12, though `audit_log_entries` already covers AUD-1/AUD-2 generally).

---

## 2. Conventions

These conventions already describe the existing schema; from this document forward they are the **required template** for any new table, not just an observation about what's there.

| Convention | Rule | Rationale |
|---|---|---|
| Primary keys | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` for every entity table | Existing pattern; avoids sequential-ID enumeration across tenants |
| Composite-key tables | `telemetry`, `metric_baselines`, and the new `telemetry_hourly` (§4.1) use a composite key (or none, for `telemetry`'s append-only rows) instead of a surrogate `id` | These are high-volume or upsert-target tables where a surrogate key adds no value and only costs an extra index |
| Table/column naming | `snake_case`, plural table names | Existing pattern |
| Timestamps | `TIMESTAMPTZ`, never bare `TIMESTAMP` | Avoids timezone ambiguity across tenants in different timezones (`sites.timezone` already tracks the site's local zone separately, for display only) |
| Flexible attributes | `JSONB` only for data that is genuinely variable-shape and not queried/filtered/joined relationally (`settings`, `specs`, `address`, `metadata`, `contact_info`) | The moment a JSONB field needs to be filtered or joined on, it gets promoted to a real column — this already happened once: `channel_partner_id` was pulled out as its own FK column rather than living in `tenants.settings` |
| Enumerated values | `TEXT NOT NULL CHECK (col IN (...))`, never a native Postgres `ENUM` type | Existing pattern (`tenants.plan`, `sites.type`, `assets.health_status`, etc.). A `CHECK` constraint is added/altered with an ordinary migration; native enum types have `ALTER TYPE ... ADD VALUE` transaction restrictions that are needlessly fussy for a value list expected to grow (new site verticals, new asset categories per DA-1.1) |
| Multi-tenancy (RLS) | Every tenant-scoped table: `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, and a `tenant_isolation` policy keyed on `current_setting('app.current_tenant_id')::uuid` | MT-1.1; this is the existing, load-bearing pattern (`backend/shared/db.ts`'s `withTenant()`) — formalized here as mandatory for every future table, not just today's |
| Non-tenant tables | `channel_partners` is the one deliberate exception — no `tenant_id`, no RLS, access controlled at the application layer only | It's PeakLogic-internal reference data (CH-1.2), not tenant data; there is nothing to isolate a tenant *from* |
| Denormalized `tenant_id` | Present even on tables reachable via a join (`telemetry`, `alerts`, `metric_baselines`, `audit_log_entries`) | Domain Model §4.1's rationale: structural tenant isolation must never depend on a join succeeding correctly |

---

## 3. Schema Reference by Domain Area

Full DDL lives in `docs/data-model.sql`; this table is a navigational summary, not a duplicate of it.

| Domain area (Domain Model §) | Tables | RLS? |
|---|---|---|
| Tenancy & Partners (§2.1) | `tenants`, `channel_partners` | `tenants` yes; `channel_partners` no (§2 above) |
| Users & Access (§2.1) | `users` | Yes |
| Facilities & Assets (§2.2) | `sites`, `assets` | Yes |
| Devices (§2.3) | `devices` | Yes |
| Analytics baselines (§2.3) | `metric_baselines` | Yes |
| Telemetry & Alerting (§2.4) | `telemetry`, `telemetry_hourly` *(new, §4.1)*, `alerts` | Yes |
| Service (§2.4) | `service_tickets` | Yes |
| Audit (Domain Model §2.5-equivalent) | `audit_log_entries` | Yes |

`DeviceAdapter` (Domain Model §2.3) has no table, by design (DA-3.1) — it stays a code-defined object in `backend/ingest/handler.ts`'s `RULES_BY_CATEGORY`.

---

## 4. New Decisions

Two things the Domain Model explicitly deferred are decided here.

### 4.1 Telemetry Retention: Hourly Rollup Table

PRD §6 / SRS §5.4 require raw telemetry at full resolution for 90 days, then hourly rollups for 2 years — but no rollup table has existed anywhere in the schema until now. Adding it:

```sql
CREATE TABLE telemetry_hourly (
  tenant_id    UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id    UUID             NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  metric       TEXT             NOT NULL,
  hour_start   TIMESTAMPTZ      NOT NULL,   -- truncated to the hour
  avg_value    DOUBLE PRECISION NOT NULL,
  min_value    DOUBLE PRECISION NOT NULL,
  max_value    DOUBLE PRECISION NOT NULL,
  sample_count INTEGER          NOT NULL,
  PRIMARY KEY (device_id, metric, hour_start)
);

ALTER TABLE telemetry_hourly ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telemetry_hourly
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE INDEX telemetry_hourly_lookup ON telemetry_hourly (tenant_id, device_id, hour_start DESC);
```

- Mirrors `telemetry`'s column/index shape so any code querying a time range can be written the same way regardless of which table backs it.
- **Who populates it and when raw rows get purged is a scheduled compute job, not a schema question** — out of scope here, same deferral Domain Model §6.1 already made for MetricBaseline's own update mechanism. Flagged in §6 Open Questions.

### 4.2 Migration Strategy

`docs/data-model.sql`'s own header says "run against the peaklogic database after first deploy" — accurate for a schema that has only ever been created once. It has no answer for changing a schema a live database with real tenant data already depends on (exactly the situation this artifact's own `channel_partners`/`metric_baselines`/`audit_log_entries` additions were just reconciled into, by hand, with no safety net beyond care).

**Recommendation: `node-pg-migrate`**, with plain `.sql` migration files in a new `scripts/migrations/` directory.

- Fits the codebase's existing raw-SQL-and-`pg`-driver style (`backend/shared/db.ts`, `scripts/provision-devices.ts`) — no ORM (Prisma, TypeORM) gets introduced anywhere else, so one shouldn't get introduced just for migrations.
- Lives in `scripts/` because that package already owns direct, credentialed DB access (device provisioning) — the same connection-resolution logic (`DB_HOST`/`DB_USER`/`DB_PASSWORD` or `DB_SECRET_ARN` via Secrets Manager) can be reused.
- Applied as an **explicit, separate step** — never wired into `cdk deploy` automatically. An infrastructure deploy should never have the side effect of silently altering a live schema.
- `docs/data-model.sql` stays the hand-maintained canonical snapshot (per CLAUDE.md's existing "source of truth" framing) — every migration gets mirrored into it in the same commit, the same discipline already used reconciling it against the Domain Model.
- The current contents of `docs/data-model.sql` become migration `0001` (baseline) once this is actually wired up.

**This is a recommendation, not yet implemented** — scaffolding the tool, writing the baseline migration, and adding the `telemetry_hourly` table to `docs/data-model.sql` itself are follow-up work once this draft is reviewed, the same sequencing used for every prior artifact (decide first, reconcile code after).

---

## 5. Indexing Strategy

| Index | Table | Supports |
|---|---|---|
| `telemetry_lookup` | `telemetry` | `(tenant_id, device_id, time DESC)` — the dominant query shape: this tenant's device's most recent readings |
| `telemetry_hourly_lookup` *(new)* | `telemetry_hourly` | Same shape, once a query's time range moves past the 90-day raw window |
| `assets_site_idx` | `assets` | RP-1.1's portfolio roll-up joining sites → assets |
| `devices_asset_idx` | `devices` | Site Detail's per-asset device lookup (UX-2.1) |
| `tenants_channel_partner_idx` | `tenants` | CH-2.1's attribution report, joining the opposite direction (partner → its tenants) |
| `metric_baselines_tenant_idx` | `metric_baselines` | Tenant-scoped baseline list/lookup |
| `audit_log_entries_lookup` | `audit_log_entries` | `(tenant_id, target_entity, target_id, occurred_at DESC)` — AUD-1's "history of actions on this entity" query |

**Telemetry partitioning (the existing `-- partition by month in v2` comment): deliberately still deferred.** Not required at MVP's design-partner-tenant scale (PRD §8's assumption). Revisit trigger is a measurable one — raw table size or query latency degrading — not a calendar date.

---

## 6. Open Questions

1. **Rollup/purge job mechanism** (scheduled Lambda vs. `pg_cron` vs. something else) that populates `telemetry_hourly` and deletes expired raw/rolled-up rows is undecided — needed before Deployment Architecture (#15) or Infrastructure as Code (#16), not this document's job to settle.
2. **Migration tool choice (§4.2)** is this draft's recommendation, not a confirmed decision — needs sign-off before `node-pg-migrate` scaffolding gets built.
3. **MetricBaseline's update mechanism** (the compute side, not its storage) remains undecided per Domain Model §6.1 — unaffected by anything in this document.

---

## 7. Traceability

| Section | Traces to |
|---|---|
| §2 Conventions | Domain Model §4.1 (denormalized tenant_id), §4.4 (adapter-agnostic category), SRS MT-1.1 |
| §4.1 Telemetry Hourly Rollup | PRD §6 / SRS §5.4 (data retention NFR) |
| §4.2 Migration Strategy | Domain Model §5 (explicitly deferred), existing `docs/data-model.sql` header comment |
| §5 Indexing Strategy | RP-1.1, UX-2.1, CH-2.1, AUD-1 |

---

## 8. Review Log

Draft v0.1 — no review conducted yet.
