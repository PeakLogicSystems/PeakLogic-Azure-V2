# Database Schema

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1.1 (amended — see Revision History, end of document)
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.5), [SRS](srs.md) (approved v1.5), [Domain Model](domain-model.md) (approved v1.1), [Compliance & Certification Roadmap](compliance-certification-roadmap.md) (approved v1), [User Personas](user-personas.md) (approved v1.1), [User Stories](user-stories.md) (approved v1), [UX Wireframes](ux-wireframes.md) (approved v1.2), [Information Architecture](information-architecture.md) (approved v1)
**Last updated:** 2026-07-11

---

## 1. Introduction

### 1.1 Purpose

The Domain Model named entities and relationships but explicitly deferred "exact column types, constraints, indexing for any entity" (Domain Model §5) to this document. This is also the first **implementation-facing** artifact in the sequence — everything before it described what the product does and looks like; this one, and API Specification (#11) after it, describe how it's actually built. `docs/data-model.sql` is this document's executable companion, not a competing source: this document narrates and justifies the decisions; the SQL file is where they're expressed as DDL.

### 1.2 Scope

In scope: physical schema conventions (naming, types, PK/FK strategy), the RLS multi-tenancy pattern as a mandatory template for future tables, the decisions the Domain Model explicitly left open (telemetry retention/rollup storage, and a migration strategy — `docs/data-model.sql` today is a "run once at first deploy" script with no versioned upgrade path), audit-log tamper protection, and indexing rationale. Out of scope: request/response payload shapes (→ API Specification, #11), the analytics *compute* that populates MetricBaseline and the rollup table defined here (a scheduled job, not yet designed), and the actuation/command audit schema (→ Device & Command Security Architecture, #12, though `audit_log_entries` already covers AUD-1/AUD-2 generally).

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
| Denormalized `tenant_id` | Present even on tables reachable via a join (`telemetry`, `alerts`, `metric_baselines`, `audit_log_entries`) | Domain Model §4 item 1's rationale: structural tenant isolation must never depend on a join succeeding correctly |

---

## 3. Schema Reference by Domain Area

Full DDL lives in `docs/data-model.sql`; this table is a navigational summary, not a duplicate of it.

| Domain area (Domain Model §) | Tables | RLS? |
|---|---|---|
| Tenancy & Identity (§2.1) | `tenants`, `channel_partners` | `tenants` yes; `channel_partners` no (§2 above) |
| Users & Access (§2.1) | `users` | Yes |
| Facilities & Assets (§2.2) | `sites`, `assets` | Yes |
| Devices (§2.3) | `devices` | Yes |
| Analytics baselines (§2.3) | `metric_baselines` | Yes |
| Telemetry & Alerting (§2.4) | `telemetry`, `telemetry_hourly` *(new, §4.1)*, `alerts` | Yes |
| Service (§2.4) | `service_tickets` | Yes |
| Audit (§2.6) | `audit_log_entries` — append-only, §4.3 | Yes |
| Channel Partner Portal & Dispatch (§2.7, *added v1.1*) | `territories`, `channel_partner_users`, `route_assignments`, `route_stops` — §4.4 | **No** — channel-partner-scoped, not tenant-scoped (§4.4) |

`DeviceAdapter` (Domain Model §2.3) has no table, by design (DA-3.1) — it stays a code-defined object in `backend/ingest/handler.ts`'s `RULES_BY_CATEGORY`.

---

## 4. New Decisions

Two things the Domain Model explicitly deferred, plus one gap this document's own review surfaced, are decided here.

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

### 4.3 Audit Log Immutability

The PRD frames alerts and service tickets as "the evidentiary record of what the customer was warned about and when, which matters for both SOC 2 and liability" (PRD §6). `audit_log_entries` (AUD-1) is the same category of record — arguably more sensitive, since it's the log of every administrative action — but as originally reconciled it had no protection beyond ordinary RLS: the same application role that does everything else had full `INSERT`/`UPDATE`/`DELETE` on it, identical to any other table. A bug or a compromised code path could silently edit or delete the rows meant to prove what happened, which is exactly what a SOC 2 auditor evaluating audit logging as a control would ask about (Compliance & Certification Roadmap §4: "Audit logging | Specified, not yet implemented... needs to actually ship before an auditor can observe it operating").

**Decision: enforce append-only at the database level with a trigger**, not a second, more restrictive DB role. The backend currently uses a single pooled role for everything (`backend/shared/db.ts`), and introducing role separation just for one table is disproportionate infrastructure for what a trigger solves directly — it works regardless of which connection or role touches the table, costs nothing on the normal `INSERT` path, and only fires on the mutation it exists to block.

```sql
CREATE OR REPLACE FUNCTION reject_audit_log_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log_entries is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_entries_append_only
  BEFORE UPDATE OR DELETE ON audit_log_entries
  FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();
```

- Scoped intentionally to `audit_log_entries` only — other tables (`alerts`, `service_tickets`) already express their own lifecycle via status-transition columns rather than deletion, and don't need this.
- Does not protect against a database superuser dropping the trigger — that's out of scope for an application-layer control; SOC 2 audit-logging controls are normally scoped to what the application's own access path can do, not superuser access.

### 4.4 Channel Partner Portal & Dispatch Schema *(new — added v1.1, see Revision History)*

Domain Model §2.7 (v1.1) specified four new entities and a branding attribute on `channel_partners`; this section makes the physical decisions Domain Model explicitly left open (§5 of that document).

**`channel_partners.branding`** — a nullable `JSONB` column (`{logo_url, primary_color, secondary_color}`), following this schema's existing convention (§2) of `JSONB` for variable-shape, non-queried attributes — nothing here is filtered/joined on, so no promotion to real columns is warranted.

**`territories`, `channel_partner_users`, `route_assignments`, `route_stops` are channel-partner-scoped, not tenant-scoped — a second instance of the `channel_partners` exception (§2), not a new pattern.** None of these four tables has a `tenant_id` column. This is a direct, necessary consequence of Domain Model §4 decision 6: a `route_stops` row can reference a `site_id` belonging to any tenant attributed to the relevant channel partner, so there is no single `tenant_id` to scope by.

**Resolved during review, not left deferred: these four tables *do* get real RLS, keyed on a new session variable instead of `tenant_id`.** `app.current_channel_partner_id` (set by a channel-partner session the same way `app.current_tenant_id` is set by a tenant session) drives a `channel_partner_isolation` policy on all four tables, mirroring `tenant_isolation`'s exact shape. `route_assignments`/`route_stops` add a second layer: a `technician`-role session (`app.current_channel_partner_role = 'technician'`) is further restricted to only their own rows (`app.current_channel_partner_user_id`), since route visibility reveals a colleague's schedule and customer visit pattern — meaningfully more sensitive than territory or user-list visibility, which any `channel_partner_users` row under the same partner can see (mirroring how any tenant `User` can already see any other tenant `User`, with no per-role restriction).

**The harder half — reading back into the existing tenant-scoped tables (`sites`, `assets`, `devices`, `telemetry`, `alerts`) across every tenant attributed to a partner, further scoped to a technician's territory — is also resolved, not deferred**, via a second, additional *permissive* RLS policy on each of those five tables (Postgres OR-combines multiple permissive policies for the same command, so this is additive, not a replacement for `tenant_isolation`). All five call one shared function, `channel_partner_can_read_site(site_id)`, rather than duplicating the territory-containment logic five times:
```sql
CREATE OR REPLACE FUNCTION channel_partner_can_read_site(p_site_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM sites s JOIN tenants t ON t.id = s.tenant_id
    WHERE s.id = p_site_id
      AND t.channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid
      AND (
        current_setting('app.current_channel_partner_role', true) = 'partner_admin'
        OR EXISTS (
          SELECT 1 FROM channel_partner_users cpu JOIN territories terr ON terr.id = cpu.territory_id
          WHERE cpu.id = current_setting('app.current_channel_partner_user_id', true)::uuid
            AND ST_Contains(terr.boundary, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography)
        )
      )
  );
$$ LANGUAGE sql STABLE;
```
`assets`/`devices`/`telemetry`/`alerts` each call this same function via their own FK chain back to a `site_id` (`assets.site_id` directly; `devices`/`telemetry` via `asset_id`; `alerts` via `asset_id` or, falling back, `device_id`). A row with no resolvable site (e.g. a `device` with a null `asset_id`) is simply never visible to a channel-partner session — the safe default is deny, not error. **Not extended to `service_tickets`, `metric_baselines`, or `telemetry_hourly`** — no approved requirement (TR-1–TR-3, CH-3.1) needs a channel-partner session to read any of those yet; adding policies preemptively would be scope not asked for.

**A real, separate bug found and fixed in the same pass, not a second deferred item: every existing `tenant_isolation` policy would have errored, not just denied, for a channel-partner session.** `current_setting('app.current_tenant_id')` **without** the `missing_ok` argument *raises an exception* if that session variable was never set — and a channel-partner session never sets it (it sets the three `app.current_channel_partner_*` variables instead). Since Postgres does not guarantee short-circuiting an erroring permissive policy just because a sibling policy would evaluate true, the new `channel_partner_read` policies alone would not have been sufficient — the *existing* `tenant_isolation` policy on `sites` (and every other tenant-scoped table) needed to change too, from `current_setting('app.current_tenant_id')::uuid` to `current_setting('app.current_tenant_id', true)::uuid`, so it safely evaluates to `false` (row excluded, not query-aborting error) when unset. This touches nine existing tables' policies (`users`, `sites`, `assets`, `devices`, `telemetry`, `telemetry_hourly`, `metric_baselines`, `alerts`, `service_tickets`) — a real, necessary migration, not a cosmetic one. A normal tenant session's behavior is completely unchanged (it always sets `app.current_tenant_id`, so the `missing_ok` branch never triggers for it).

**`territories.boundary` uses PostGIS `GEOGRAPHY(POLYGON, 4326)`**, resolving Domain Model §5's open storage-type question in favor of PostGIS over a JSONB GeoJSON blob — `docs/data-model.sql` already declares the extension (`CREATE EXTENSION IF NOT EXISTS "postgis"`, present since the original schema but never used until now), and `GEOGRAPHY` (vs. the planar `GEOMETRY` type) correctly handles the ellipsoidal-earth distance/containment math for real-world lat/lng coordinates rather than treating them as flat-plane Cartesian points, which would be inaccurate at territory scale (multiple miles). SRID 4326 is the standard WGS84 lat/lng reference system, matching how `sites.lat`/`sites.lng` are already stored as plain degrees.

**Territory→Site membership stays a derived query, exactly as Domain Model §2.7 specified — no `territory_id` column exists on `sites`.** The query joins the existing `tenants.channel_partner_id` attribution with a PostGIS containment check:
```sql
SELECT s.* FROM sites s
JOIN tenants t ON t.id = s.tenant_id
JOIN territories terr ON terr.channel_partner_id = t.channel_partner_id
WHERE terr.id = $1
  AND ST_Contains(terr.boundary, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography);
```
`sites.lat`/`sites.lng` are **not** migrated to a `GEOGRAPHY(POINT)` column — they stay plain `DOUBLE PRECISION` as today, cast to a geography point inline per query. Promoting them is a real future option if territory-containment queries become measurably slow (a `GiST` index on a stored geography column would help), but at MVP's design-partner-tenant scale (a handful of territories per partner, queried interactively rather than in a hot path) this is disproportionate now — the same "revisit when it's a measured problem, not a calendar date" principle §5's telemetry-partitioning deferral already uses.

**`route_assignments.technician_user_id`/`confirmed_by` reference `channel_partner_users` without a `CHECK`-enforced role constraint** — Postgres has no native cross-row constraint mechanism for "this FK must point to a row where `role = 'technician'`" without a trigger, and a trigger here would be disproportionate (unlike `audit_log_entries`' append-only trigger, §4.3, which protects an evidentiary record — a mis-scoped `technician_user_id` is an application bug to catch in code/tests, not a tamper-evidence concern). Same soft-constraint category as `assets.category` matching a `DeviceAdapter` key (Domain Model §4 decision 4) — enforced by application logic, not the schema.

**`route_assignments` enforces "one assignment per (technician, date)" via `UNIQUE (technician_user_id, route_date)`**, directly implementing Domain Model §2.7's stated cardinality rather than leaving it as an application-level assumption.

**Resolved during review, not left as a disclosed gap: `audit_log_entries` now covers `channel_partner_users` actions too.** The original shape (`tenant_id NOT NULL`, `actor_id` referencing `users` only) had no way to represent a channel-partner-scoped action at all — a `partner_admin` creating a technician's credential, or confirming a route, didn't fit. Extended, not replaced:
- `tenant_id` is now nullable; a new nullable `channel_partner_id` column is added, with `CHECK ((tenant_id IS NOT NULL AND channel_partner_id IS NULL) OR (tenant_id IS NULL AND channel_partner_id IS NOT NULL))` — every row is scoped to exactly one dimension, never both, never neither.
- A new nullable `actor_channel_partner_user_id` column (referencing `channel_partner_users`) sits alongside the existing `actor_id` (referencing `users`), with `CHECK (NOT (actor_id IS NOT NULL AND actor_channel_partner_user_id IS NOT NULL))` — deliberately **not** "exactly one actor required," since a system-triggered entry with no human actor (both null) is a legitimate existing case; what's actually invalid is claiming both actor types on one row.
- A new `channel_partner_isolation` policy (`channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid`) grants channel-partner sessions read access to their own scope's entries, additive alongside the existing (now `missing_ok`-fixed) `tenant_isolation` policy.
- The append-only trigger (§4.3) needed **no change** — it blocks `UPDATE`/`DELETE` regardless of which scope dimension a row belongs to, so the evidentiary guarantee already covers the new rows automatically.

---

## 5. Indexing Strategy

| Index | Table | Supports |
|---|---|---|
| `telemetry_lookup` | `telemetry` | `(tenant_id, device_id, time DESC)` — the dominant query shape: this tenant's device's most recent readings |
| `telemetry_hourly_lookup` *(new)* | `telemetry_hourly` | Same shape, once a query's time range moves past the 90-day raw window |
| `assets_site_idx` | `assets` | RP-1.1's portfolio roll-up joining sites → assets |
| `devices_asset_idx` | `devices` | Site Detail's per-asset device lookup (UX-2.1) |
| `tenants_channel_partner_idx` | `tenants` | CH-2.1's attribution report, joining the opposite direction (partner → its tenants) |
| `metric_baselines_tenant_idx` | `metric_baselines` | Tenant-scoped baseline list/lookup (AI-3.1) |
| `audit_log_entries_lookup` | `audit_log_entries` | `(tenant_id, target_entity, target_id, occurred_at DESC)` — AUD-1's "history of actions on this entity" query |
| `territories_channel_partner_idx` *(new)* | `territories` | TR-1.1's "list this partner's territories" |
| `channel_partner_users_partner_idx` *(new)* | `channel_partner_users` | "list this partner's admins/technicians" |
| `channel_partner_users_territory_idx` *(new)* | `channel_partner_users` | TR-2.1's "list technicians assigned to this territory" |
| `route_stops_assignment_idx` *(new)* | `route_stops` | Fetching an assignment's ordered stop list (also served by the `UNIQUE (route_assignment_id, sequence_number)` constraint's implicit index) |
| `route_assignments_partner_idx` *(new)* | `route_assignments` | `channel_partner_isolation`'s own filter — every read goes through this column |
| `audit_log_entries_channel_partner_idx` *(new)* | `audit_log_entries` | The channel-partner-scoped analog of `audit_log_entries_lookup`, for the same "history of actions" query pattern |

**No `GiST` spatial index on `territories.boundary` at MVP** — deferred for the same reason `sites.lat`/`lng` aren't promoted to a geography column (§4.4): a handful of territories per partner, queried interactively, doesn't need one yet.

**Telemetry partitioning (the existing `-- partition by month in v2` comment): deliberately still deferred.** Not required at MVP's design-partner-tenant scale (PRD §8's assumption). Revisit trigger is a measurable one — raw table size or query latency degrading — not a calendar date.

---

## 6. Open Questions

1. **Rollup/purge job mechanism** (scheduled Lambda vs. `pg_cron` vs. something else) that populates `telemetry_hourly` and deletes expired raw/rolled-up rows is undecided — needed before Deployment Architecture (#15) or Infrastructure as Code (#16), not this document's job to settle.
2. **Migration tool choice (§4.2)** is this draft's recommendation, not a confirmed decision — needs sign-off before `node-pg-migrate` scaffolding gets built. **Resolved in practice, added v1.1**: `node-pg-migrate` with plain `.sql` files in `scripts/migrations/` is now the real, in-use pattern (`1751654400000_baseline.sql`, `1783569600000_telemetry-rls.sql`, and this amendment's `1783728000000_channel-partner-portal.sql`) — this section's "recommendation, not yet implemented" framing is stale as of v1.1; leaving it as historical record rather than rewriting §4.2 itself, which is out of this amendment's scope.
3. **MetricBaseline's update mechanism** (the compute side, not its storage) remains undecided per Domain Model §6.1 — unaffected by anything in this document.
4. ~~The cross-tenant access-control mechanism for `territories`/`channel_partner_users`/`route_assignments`/`route_stops` is explicitly not decided here~~ **Resolved 2026-07-11** (§4.4): `channel_partner_isolation` RLS policies on all four tables, plus `channel_partner_read` policies (backed by `channel_partner_can_read_site()`) on `sites`/`assets`/`devices`/`telemetry`/`alerts`. **What remains genuinely open**: this is the data-layer mechanism only — the application code that actually sets `app.current_channel_partner_id`/`app.current_channel_partner_user_id`/`app.current_channel_partner_role` per request (a `withChannelPartner()` helper mirroring `withTenant()` in `backend/shared/db.ts`) doesn't exist yet, and depends on Security Architecture (#13) defining the concrete Cognito/JWT shape for a `channel_partner_users` session first.
5. ~~No audit logging exists for `channel_partner_users` actions~~ **Resolved 2026-07-11** (§4.4): `audit_log_entries` extended with a nullable `channel_partner_id` + `actor_channel_partner_user_id`, scope/actor `CHECK` constraints, and a `channel_partner_isolation` policy. The append-only trigger needed no change.
6. **New, added during this review**: the `missing_ok` fix to nine existing `tenant_isolation` policies (§4.4) has never been exercised against a real database (no AWS account exists yet, `mvp-roadmap.md` Blocker #1) — the reasoning is sound (documented Postgres `current_setting()` behavior), but "sound reasoning, unverified against a real instance" is a real caveat this project applies consistently elsewhere (e.g. the migration tool choice, item 2) and should apply here too, not be presented as more certain than it is.

---

## 7. Traceability

| Section | Traces to |
|---|---|
| §2 Conventions | Domain Model §4 item 1 (denormalized tenant_id), §4 item 4 (adapter-agnostic category), SRS MT-1.1 |
| §4.1 Telemetry Hourly Rollup | PRD §6 / SRS §5.4 (data retention NFR) |
| §4.2 Migration Strategy | Existing `docs/data-model.sql` header comment (no versioned upgrade path) — Domain Model §5 defers schema *detail* generally but doesn't itself anticipate a migration-strategy gap |
| §4.3 Audit Log Immutability | PRD §6 (evidentiary-record framing), AUD-1, Compliance & Certification Roadmap §4 |
| §5 Indexing Strategy | RP-1.1, UX-2.1, CH-2.1, AUD-1, AI-3.1 |
| §4.4 Channel Partner Portal & Dispatch Schema *(added v1.1)* | Domain Model §2.7, PRD §5.10 (TR-1–TR-3), SRS §3.12 (TR-1.1–TR-3.2) |

---

## 8. Review Log

**v1 (2026-07-04):** Five issues found, all resolved.

1. **Citation errors (§2, §7)**: cited "Domain Model §4.1"/"§4.4" as if §4 had subsections — it's a single section with a plain numbered list. Corrected to "§4 item 1" / "§4 item 4."
2. **Wrong section number (§3)**: Audit was cited as "§2.5-equivalent"; Domain Model has a real §2.6 "Audit" section (§2.5 is unrelated — "AI & MCP — no new entities"). Corrected to §2.6.
3. **Traceability overclaim (§7)**: cited Domain Model §5 as the source of the migration-strategy gap; §5 only defers column/constraint/index detail, not migration strategy. Corrected to cite the real driver — `docs/data-model.sql`'s own header comment — without overstating what Domain Model anticipated.
4. **`audit_log_entries` had no tamper protection**: the same app role had full write access as any other table, undermining its evidentiary purpose (PRD §6, AUD-1). Resolved by §4.3 — a `BEFORE UPDATE OR DELETE` trigger enforcing append-only, chosen over DB role separation since the backend has no role-separation infrastructure today and a trigger closes the gap regardless of which connection touches the table.
5. **Missing requirement citation (§5)**: `metric_baselines_tenant_idx` had no citation unlike its sibling rows. Added AI-3.1.

**v1.1 (2026-07-11), reviewed 2026-07-11:** One real gap found, flagged rather than silently left out; everything else re-verified directly.

6. **No audit logging exists for the new channel-partner-scoped tables (§6 item 5)** — found by checking directly whether `channel_partner_users` actions would actually satisfy AUD-1 as currently shaped; they don't, since `audit_log_entries` is `tenant_id`-scoped and these tables deliberately aren't. Not fixed here (a real schema decision, not this amendment's scope) — flagged explicitly rather than assumed covered.
7. **Re-verified, held up:** `docs/data-model.sql`'s `postgis` extension declaration (checked directly, confirmed present and previously unused); the exact migration file-naming/header convention (checked against both existing files in `scripts/migrations/`, matched exactly); that `GEOGRAPHY` (not `GEOMETRY`) is the correct PostGIS type for real-world lat/lng containment math at territory scale (a multi-mile-scale polygon on a flat-plane `GEOMETRY` type would introduce real distance distortion depending on latitude — verified this is a genuine, not cosmetic, distinction, not just convention).

**v1.1, second pass (2026-07-11), same day — user asked for both disclosed gaps to actually be fixed, not left deferred.** One additional real bug found and fixed as a consequence, not two separate items resolved cleanly.

8. **§6 items 4 and 5 resolved for real** — real RLS policies (`channel_partner_isolation` on the four new tables, `channel_partner_read` + `channel_partner_can_read_site()` on the five existing tenant-scoped tables a partner session needs to read), and a real `audit_log_entries` schema extension (nullable `channel_partner_id`/`actor_channel_partner_user_id`, scope/actor `CHECK` constraints). Not a stub or a "TODO" comment — actual DDL, in both the migration and `docs/data-model.sql`.
9. **A real, separate bug found while designing the fix for item 8, not assumed away**: every *existing* `tenant_isolation` policy used `current_setting('app.current_tenant_id')` without `missing_ok` — which raises an exception, not just denies, when that variable is unset. A channel-partner session never sets it, so without a fix, the new cross-tenant read policies would never even get evaluated; the pre-existing policy would error first. Verified this is genuine Postgres behavior (`current_setting()`'s documented two-argument form), not assumed — and that Postgres does not short-circuit around an erroring permissive policy just because a sibling policy would pass. Fixed by re-creating all nine affected policies with `missing_ok=true`; a normal tenant session's behavior is provably unaffected, since it always sets the variable.
10. **A real ordering bug caught and fixed in `docs/data-model.sql` specifically (not in the migration file, which was already correctly ordered)**: `docs/data-model.sql` is one linear script, and the first draft of this fix placed `sites`' `channel_partner_read` policy (which calls `channel_partner_can_read_site()`) immediately after `sites`' own block — before `territories`/`channel_partner_users`/the function itself were ever defined later in the file. Caught by tracing the actual statement order top-to-bottom, not assumed correct because the migration file (a different execution context, building on an already-existing schema) happened to be fine. Fixed by consolidating the function and all five `channel_partner_read` policies into one section at the end of the file, after every table they depend on already exists.

---

## Revision History

**v1.1 (2026-07-11)** — forced by the PRD v1.5/SRS v1.5/Domain Model v1.1 amendment (channel-partner portal, territory/dispatch management), per this document's own rule (implicit in §1.1's "narrates and justifies the decisions" framing, made explicit here) that a new domain-model entity needs a real physical-schema decision, not an assumed one.

- **`channel_partners` amended**: added a nullable `branding` `JSONB` column.
- **Four new tables**: `territories` (PostGIS `GEOGRAPHY(POLYGON, 4326)` boundary — resolving Domain Model §5's open storage-type question), `channel_partner_users`, `route_assignments` (`UNIQUE (technician_user_id, route_date)`, a `source` column distinguishing AI-suggested from manually-built routes, `channel_partner_id` denormalized per this schema's own convention), `route_stops`.
- **New precedent (§4.4)**: these four tables are channel-partner-scoped, not tenant-scoped — the second table (after `channel_partners` itself) with no `tenant_id`. First drafted with no RLS at all and the cross-tenant access mechanism explicitly deferred to Multi-Tenant Architecture — **revised in the same-day second pass below, once the user asked for it to actually be resolved, not deferred.**
- **Real migration shipped**: `scripts/migrations/1783728000000_channel-partner-portal.sql`, mirrored into `docs/data-model.sql` by hand in the same commit, per this project's established migration discipline (§4.2).

**v1.1, second pass, same day (2026-07-11)** — the user asked for both disclosed gaps (§6 items 4 and 5 as first drafted) to be actually fixed before treating this amendment as resolvable, not carried forward as open questions.

- **Real cross-tenant RLS mechanism added**: `channel_partner_isolation` policies on all four new tables (keyed on a new `app.current_channel_partner_id` session variable, mirroring `app.current_tenant_id`); `route_assignments`/`route_stops` additionally restrict a `technician`-role session to their own rows only. A second, additive `channel_partner_read` policy on `sites`/`assets`/`devices`/`telemetry`/`alerts`, backed by one shared `channel_partner_can_read_site()` function, grants the read-back into tenant-scoped data a partner/technician session actually needs — territory-scoped for a technician, unrestricted (within their partner) for a `partner_admin`.
- **`audit_log_entries` extended**: nullable `channel_partner_id` + `actor_channel_partner_user_id`, with scope/actor `CHECK` constraints (exactly one scope, never both actor types at once) — closes §6 item 5 for real, not just disclosed.
- **A real, separate bug found and fixed as a consequence of designing the above, not a second deferred item**: every existing `tenant_isolation` policy (nine tables) used `current_setting()` without `missing_ok`, which raises an exception rather than denying when a channel-partner session (which never sets `app.current_tenant_id`) queries them — fixed by re-creating all nine with `missing_ok=true`. Verified this is genuine, documented Postgres behavior, not assumed.
- **A real ordering bug caught and fixed in `docs/data-model.sql`** (not present in the migration file, which was already correctly ordered against an existing schema): the file is one linear script, and `channel_partner_can_read_site()` — which the new `sites` policy calls — itself depends on `territories`/`channel_partner_users`, which didn't exist yet at the point `sites` was originally defined. Fixed by consolidating the function and all five `channel_partner_read` policies into one section at the end of the file.
- **What's still genuinely open, not resolved by this pass** (tracked in `project-peaklogic-channel-partner-portal` memory): the *application code* that sets the new `app.current_channel_partner_*` session variables per request (a `withChannelPartner()` helper mirroring `withTenant()`) doesn't exist yet — this document resolved the data-layer mechanism, not the auth/API-layer wiring, which depends on Security Architecture (#13) defining the concrete Cognito/JWT shape for a `channel_partner_users` session first. Also still open: this fix has never run against a real database (no AWS account exists yet).
