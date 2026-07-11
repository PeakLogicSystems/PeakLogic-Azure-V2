# Domain Model

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v1.1 (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1 until v1.1 is approved)
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.5), [SRS](srs.md) (approved v1.5)
**Last updated:** 2026-07-11

---

## 1. Introduction

### 1.1 Purpose

The SRS specifies *how the system must behave*; it deliberately stops short of naming the actual entities and relationships behind that behavior (SRS §6, §2.6). This document formalizes them: the nouns of the system, the facts each one holds, and how they relate. It is the input to the Database Schema (#10) and API Specification (#11), but it is not itself a schema — no column types, indexes, or storage engine decisions live here.

**This project differs from a from-scratch domain model in one important way**: most of these entities already exist as real tables in `docs/data-model.sql`. This document formalizes what's there, reconciles it against the SRS, and calls out — explicitly, in §6 — anywhere the SRS's new requirements (device adapters, baseline analytics, channel partners) need something the existing schema doesn't have yet.

### 1.2 Scope

In scope: the entities needed to support every SRS §3 feature area (Device Adapter Framework, Sensing Modalities, Alerting, Device Management, Multi-Tenancy, Device & Command Networking, AI & MCP, Channel & Partner Support, Auth, Audit) at the MVP horizon.

Out of scope: exact column types/constraints (→ Database Schema, #10), API request/response shapes (→ API Specification, #11), pool-chemistry/gas-sensor threshold *content* (→ still unassigned, SRS Open Issue #1 — this document only models the *shape* an adapter's rules take, not their values).

### 1.3 Notation

- Entities are named in `PascalCase` and described in a table of key attributes (not exhaustive — only attributes that matter conceptually or are already named in the SRS/existing schema).
- Relationships use standard crow's-foot-style cardinality in prose: **1—1**, **1—***, ***—***, with **0..** prefixes where a relationship is optional.
- "Existing" marks an entity/attribute already present in `docs/data-model.sql`, kept as-is. "New" marks something this SRS's requirements need that isn't in the current schema yet.
- "Derived" marks a value that must never be stored as an independently-mutable field — computed by querying another entity's history instead, following the same principle IronQuill's Domain Model established for its own event-sourced state.

---

## 2. Core Entities

### 2.1 Tenancy & Identity

**Tenant** *(existing)* — an isolated customer organization. Everything else is tenant-scoped, directly or transitively, enforced structurally via Postgres RLS (MT-1.1).
| Attribute | Notes |
|---|---|
| tenant_id | |
| name, slug | |
| plan | trial / starter / professional / enterprise |
| status | active / suspended / trial |
| settings (JSONB) | Includes `webhook_url` (existing) |
| **channel_partner_id (nullable)** | **New** — attributes this tenant to a reseller relationship (CH-1.1) |

**User** *(existing)* — a person who can authenticate and act in the system.
| Attribute | Notes |
|---|---|
| user_id, cognito_sub, email, display_name | |
| role | Existing enum `admin` / `operator` / `service_partner`. **Naming reconciliation**: these map to the PRD/SRS's Tenant Admin / Facility Operator / Service Partner respectively — same values, no schema change, just the display names used in product docs going forward |
| status | |

**ChannelPartner** *(new)* — a reseller/supplier relationship (e.g. a pool-chemical supplier) whose customers' tenants are attributed to them (CH-1.1, CH-2.1).
| Attribute | Notes |
|---|---|
| channel_partner_id | |
| name | |
| contact_info | |
| branding (JSONB, nullable) | **New, added v1.1** — `logo_url`, `primary_color`, `secondary_color` for the white-label portal login (CH-3.1, §2.7). Null for a channel partner that's attribution-only (CH-1/CH-2, every vertical except pool-servicing) — branding only applies once a partner is onboarded to the portal |

A Tenant has **0..1** ChannelPartner (a tenant may or may not have come through a channel relationship); a ChannelPartner has **many** Tenants (CH-2.1's attribution report groups by this relationship).

### 2.2 Facilities & Assets

**Site** *(existing)* — a physical location (a restaurant, a nursing home, a pumping station).
| Attribute | Notes |
|---|---|
| site_id, tenant_id, name | |
| type | Broadened enum: `pumping_station`, `qsr`, `restaurant`, `pool`, `nursing_home`, `retail`, `light_industrial`, `multifamily_residential`, `other` |
| address, lat/lng, timezone, metadata | |

**Asset** *(existing)* — a piece of equipment at a Site being monitored (a pump, a walk-in cooler, a pool pump).
| Attribute | Notes |
|---|---|
| asset_id, tenant_id, site_id, name | |
| category | Free text — existing values `pump`, `hvac`, `pool_system`, `refrigeration`, `leak_sensor`, `energy_meter`; **new** values needed per SRS §3.2: `pool_chemistry`, `gas_sensor`, `air_quality` |
| make, model, serial_number, install_date | |
| specs (JSONB) | Manually entered; consumed by a Device Adapter's threshold functions (DA-2.1) |
| health_status | healthy / warning / critical / offline / unknown |

An Asset's `category` is the join point to exactly one **DeviceAdapter** (§2.3) — this is a resolution rule, not a stored foreign key, mirroring how IronQuill's JurisdictionConfig resolves to a ReferenceDataset by rule rather than a hard reference.

### 2.3 Devices & Adapters

**Device** *(existing)* — a physical IoT device identity, distinct from the Asset it monitors.
| Attribute | Notes |
|---|---|
| device_id, tenant_id, serial, thing_name | `thing_name` is the AWS IoT Core identity |
| asset_id (nullable) | A Device links to **0..1** Asset; an Asset may have **many** Devices (e.g. a walk-in cooler asset could carry both a temperature-probe device and a separate leak-sensor device) |
| firmware_version, status, last_seen_at, provisioned_at | |

**DeviceAdapter** *(new — conceptual entity, not necessarily its own database table at MVP)* — the contract a sensing modality plugs into (DA-1.1, DA-2.1). At MVP this is a **code-defined object** (formalizing `RULES_BY_CATEGORY` in `backend/ingest/handler.ts`), not a database row — per DA-3.1, adapters are code-deployed, not dynamically registered. It is modeled here because it's a real conceptual entity the system reasons about, even though its MVP storage location is source code rather than a table.
| Attribute | Notes |
|---|---|
| category (key) | Matches Asset.category |
| declared_metrics | Names + units this adapter expects (DA-2.1) |
| threshold_rules | metric, condition, threshold (static or specs-derived), severity, message |
| default_specs | Used when an Asset's `specs` are unset |

**MetricBaseline** *(new)* — a maintained, per-device-per-metric rolling statistical baseline (trailing-window mean/standard-deviation) supporting AI-3.1's anomaly detection. Modeled as a maintained entity (updated incrementally as telemetry arrives) rather than recomputed from scratch on every reading, for performance — flagged as a recommendation, not a settled decision, in §6.
| Attribute | Notes |
|---|---|
| device_id, metric, tenant_id | tenant_id denormalized, same rationale as §4.1 |
| trailing_mean, trailing_stddev | |
| window_start, window_end | |
| sample_count | Used to withhold a flag until a minimum history threshold is met (SRS §3.7 error condition) |

### 2.4 Telemetry & Alerting

**Telemetry** *(existing)* — a single timestamped reading from a Device.
| Attribute | Notes |
|---|---|
| time, device_id, tenant_id, metric, value, quality | |

A Telemetry row is evaluated against its Device's Asset's DeviceAdapter (§2.3) at ingest time, and separately against its MetricBaseline (§2.3), producing zero or more Alerts.

**Alert** *(existing, extended)* — a record produced when a telemetry value trips a rule.
| Attribute | Notes |
|---|---|
| alert_id, tenant_id, device_id, asset_id | |
| severity | info / warning / critical |
| type | Existing value `threshold`; **new** value `trend` or `anomaly` needed for AI-3.2, so a baseline-deviation flag is distinguishable from a static-threshold alert |
| message, context (JSONB) | |
| status | open / acknowledged / resolved / suppressed |
| triggered_at, acknowledged_at, resolved_at | |

**ServiceTicket** *(existing)* — auto-created for critical Alerts, or manually.
| Attribute | Notes |
|---|---|
| ticket_id, tenant_id, alert_id (nullable), asset_id, assigned_to | |
| title, description, priority, status | |
| webhook_url, external_ref, due_at, resolved_at | |

An Alert has **0..*** ServiceTickets (existing FK is nullable, not unique — in practice, MVP behavior (AL-2.1) creates exactly one per critical Alert).

### 2.5 AI & MCP — no new entities

The MCP server (MCP-1.1) and baseline analytics (AI-3.1) are an **access/computation layer over existing entities** (Device, Alert, Telemetry, MetricBaseline) — not a new domain concept requiring its own entity beyond MetricBaseline (§2.3). This is called out explicitly so the Database Schema and API Specification artifacts don't go looking for an "MCP entity" that isn't there by design.

### 2.6 Audit

**AuditLogEntry** *(new)* — a record of a state-changing administrative action (AUD-1).
| Attribute | Notes |
|---|---|
| audit_log_id, tenant_id | Tenant-scoped, same RLS enforcement as every other table (AUD-2) |
| actor (user_id) | |
| action, target_entity, target_id | |
| prior_value, new_value (nullable) | |
| timestamp | |

### 2.7 Channel Partner Portal & Dispatch *(new — added v1.1, see Revision History)*

For the pool-servicing vertical specifically — the entities behind the scoped operational-dispatch portal (CH-3.1) and territory/route management (TR-1.1–TR-3.2). None of this existed in `docs/data-model.sql` before this amendment.

**ChannelPartnerUser** *(new)* — a person who can authenticate into a channel partner's portal (CH-3.1). A genuinely new identity surface, not an extension of `User` — a channel partner is not a Tenant, so this is deliberately a separate table/identity space (§4 decision 6).
| Attribute | Notes |
|---|---|
| channel_partner_user_id, channel_partner_id | |
| cognito_sub, email, display_name | Same shape as `User`, different identity space |
| role | Single MVP value (e.g. `partner_admin`) — no RBAC tiers within the portal at MVP, consistent with the "operational dispatch view only" scope locked for CH-3 |

**Territory** *(new)* — a named geographic boundary a channel partner defines to group technician assignments (TR-1.1).
| Attribute | Notes |
|---|---|
| territory_id, channel_partner_id, name | |
| boundary | A geographic polygon. Exact storage type (PostGIS `geography`/`geometry` vs. a JSONB GeoJSON blob) is Database Schema's decision (§5) — `docs/data-model.sql` already has an unused `postgis` extension installed, a strong hint toward finally using it rather than reinventing polygon math in JSONB |

A Territory's Site membership is **derived, not stored** (§1.3 notation): a Site belongs to a Territory if (a) the Site's Tenant is attributed to the Territory's ChannelPartner (existing `Tenant.channel_partner_id`) and (b) the Site's `lat`/`lng` fall within the Territory's `boundary`. No `territory_id` column exists on `Site` — this mirrors the Asset→DeviceAdapter resolution-by-rule pattern (§4 decision 4), not a new precedent.

**Technician** *(new)* — a field worker employed by a channel partner, assignable to a Territory (TR-2.1).
| Attribute | Notes |
|---|---|
| technician_id, channel_partner_id, name, contact_info | |
| territory_id (nullable) | **0..1** — a Technician may be unassigned to any territory yet (SRS §3.12 error condition) |

**Deliberately modeled with no login**, mirroring the existing Field Service Partner precedent (User Personas §2.5 — no Cognito account, no dashboard access) rather than inventing a second class of portal user. A Technician's day would most likely be viewed via the same no-login opaque-token pattern already proposed for Service Ticket view (AL-2.1, `project-peaklogic-pending-decisions` item 1). **This is flagged as a real, unconfirmed judgment call, not a settled decision — see §6.4.**

**RouteAssignment** *(new)* — a Technician's suggested-or-confirmed route for one calendar day (TR-3.1, TR-3.2). Distinct from RP-2.1's live-computed urgency list: RP-2.1 is a plain, always-fresh query with no persisted state, but a route the AI has suggested (or a partner has confirmed) must stay stable through the day even as underlying alert/telemetry data keeps changing — that requires a real stored snapshot, not a re-derivable view.
| Attribute | Notes |
|---|---|
| route_assignment_id, technician_id, route_date | **1** RouteAssignment per (technician, date) |
| status | `suggested` (produced by the external AI agent via MCP, TR-3.1) or `confirmed` (a ChannelPartnerUser has reviewed and accepted it) |
| confirmed_by (channel_partner_user_id, nullable), confirmed_at (nullable) | Null until `status` transitions to `confirmed` — TR-3.1's "advisory only" requirement modeled as an explicit confirmation gate, not just a status label |
| generated_at | |

**RouteStop** *(new)* — one ordered stop within a RouteAssignment.
| Attribute | Notes |
|---|---|
| route_stop_id, route_assignment_id, site_id | |
| sequence_number | The AI-suggested (or partner-adjusted) visit order |

A RouteAssignment has **1—*** RouteStops, each referencing exactly **1** Site. A RouteStop's per-site readings (chemistry, alert status) are **not stored here** — queried live from the same Telemetry/Alert chain RP-2.1 already uses (Site→Asset→Device→Telemetry), the same "don't duplicate what's derivable" principle applied everywhere else in this document except MetricBaseline (§4 decision 3's caching rationale doesn't apply to a once-daily route view).

**Cardinalities:** A ChannelPartner has **many** ChannelPartnerUsers, **many** Territories, and **many** Technicians. A Territory has **0..*** Technicians. A Technician has **0..1** RouteAssignment per calendar date.

---

## 3. Relationship Diagram

```mermaid
erDiagram
    TENANT ||--o{ SITE : owns
    TENANT ||--o{ USER : employs
    TENANT ||--o{ ASSET : owns
    TENANT ||--o{ DEVICE : enrolls
    TENANT }o--o| CHANNEL_PARTNER : "attributed to"
    SITE ||--o{ ASSET : hosts
    ASSET ||--o{ DEVICE : monitored_by
    ASSET }o--|| DEVICE_ADAPTER : "resolves via category"
    DEVICE ||--o{ TELEMETRY : produces
    DEVICE ||--o{ METRIC_BASELINE : "baselines per metric"
    TELEMETRY }o..o{ ALERT : "may trigger"
    ALERT ||--o{ SERVICE_TICKET : "may create"
    TENANT ||--o{ AUDIT_LOG_ENTRY : logs
    CHANNEL_PARTNER ||--o{ CHANNEL_PARTNER_USER : "logs in as"
    CHANNEL_PARTNER ||--o{ TERRITORY : defines
    CHANNEL_PARTNER ||--o{ TECHNICIAN : employs
    TERRITORY ||--o{ TECHNICIAN : "assigned to"
    TERRITORY }o..o{ SITE : "derived: attribution + geo-contains"
    TECHNICIAN ||--o| ROUTE_ASSIGNMENT : "has for a date"
    ROUTE_ASSIGNMENT ||--o{ ROUTE_STOP : contains
    ROUTE_STOP }o--|| SITE : visits
    CHANNEL_PARTNER_USER ||--o{ ROUTE_ASSIGNMENT : confirms
```

---

## 4. Key Modeling Decisions & Rationale

1. **`tenant_id` is denormalized onto every tenant-scoped table** (Telemetry, Alert, ServiceTicket, and the new MetricBaseline/ChannelPartner/AuditLogEntry) even though it's derivable via joins in most cases — this is the existing schema's own established pattern (`docs/data-model.sql`'s RLS policies all key on a directly-present `tenant_id`), continued here for the same reason IronQuill denormalized tenant_id onto LedgerEvent: structural tenant isolation (MT-1.1) should never depend on a join succeeding correctly.
2. **DeviceAdapter is modeled as a real conceptual entity despite being code, not a database row, at MVP.** DA-3.1 is explicit that adapters are code-deployed for MVP — but the *shape* of an adapter (declared metrics, threshold rules, default specs) is real domain structure the system depends on, so it's documented here rather than treated as invisible implementation detail. When a self-service adapter marketplace is eventually built (explicitly out of MVP scope), this entity is the one that needs to move from code into a real table — this document is that future work's starting reference.
3. **MetricBaseline is a maintained entity, not a derived live-query**, unlike IronQuill's strict "always derive, never store mutable state" rule for status-like fields. This is a deliberate difference, not an inconsistency: a rolling statistical baseline over potentially high-volume telemetry is expensive to recompute from raw data on every reading, and unlike a "current assignee" or "completion status" (which represent authoritative state that must never silently diverge from its source events), a baseline is a *derived statistic* that's expected to be periodically recomputed/refreshed — storing it is a caching decision, not a risk to data integrity.
4. **Asset→DeviceAdapter is a resolution rule keyed on `category`, not a foreign key** — consistent with how IronQuill's JurisdictionConfig resolves to a ReferenceDataset by rule. This keeps `assets.category` free-text and adapter-agnostic at the schema level (no migration needed to add a new adapter), matching DA-1.1's requirement that new modalities not require core changes.
5. **User role naming is reconciled, not changed.** The existing `admin`/`operator`/`service_partner` enum values are kept; Tenant Admin/Facility Operator/Service Partner are the product-facing names used in the PRD/SRS/Vision going forward. No migration required.
6. **Channel-partner-scoped entities (§2.7) introduce a second scoping dimension alongside `tenant_id` — added v1.1.** Every entity before this amendment is scoped by exactly one `tenant_id`, enforced structurally by RLS (decision 1). ChannelPartnerUser, Territory, Technician, RouteAssignment, and RouteStop are scoped by `channel_partner_id` instead — and a RouteAssignment's stops can reference Sites belonging to *multiple different tenants* (every tenant attributed to that channel partner), which no existing entity in this schema does. **Flagged, not resolved, here**: the concrete RLS/access-control mechanism for this new scoping dimension is Multi-Tenant Architecture's (#14) job to amend; ChannelPartnerUser's concrete auth mechanism is Security Architecture's (#13). Modeled now so those two artifacts have a concrete shape to design against.
7. **Territory→Site is a derived resolution rule (geographic containment + existing tenant attribution), not a stored foreign key — added v1.1.** Consistent with decision 4's Asset→DeviceAdapter precedent. Keeps `sites` schema-stable as territories are redrawn — a territory boundary edit never requires a bulk `UPDATE sites`.
8. **Technician is modeled with no login, mirroring the Field Service Partner precedent — added v1.1.** Keeps the new Security Architecture auth surface scoped to ChannelPartnerUser only, rather than inventing a second class of portal user. Flagged as a real, unconfirmed judgment call, not a settled decision — see §6.4.

---

## 5. What This Document Does Not Decide

- Exact column types, constraints, indexing for any entity above — Database Schema (#10).
- Request/response payload shapes, including the MCP server's exact tool schema — API Specification (#11).
- Pool-chemistry and gas-sensor threshold *content* (the actual numbers) — still unassigned per SRS Open Issue #1; this document only models the shape a DeviceAdapter's `threshold_rules` take.
- Actuation/command entities (e.g. a future Command or CommandAck entity) — explicitly deferred to Device & Command Security Architecture (#12), since no actuation ships at MVP (CC-3/CC-4).
- **Added v1.1:** Territory's `boundary` exact storage type (PostGIS geography/geometry vs. JSONB GeoJSON) — Database Schema (#10). The concrete channel-partner-scoped RLS/access-control mechanism (§4 decision 6) — Multi-Tenant Architecture (#14). ChannelPartnerUser's concrete auth mechanism (new Cognito group vs. new user pool) — Security Architecture (#13).

---

## 6. Open Questions Surfaced While Modeling

### 6.1 MetricBaseline: maintained entity vs. live-derived — resolved
Confirmed as a maintained, incrementally-updated entity (§2.3/§4.3), per the performance rationale in §4.3 — recomputing a rolling statistical baseline from raw telemetry on every evaluation doesn't scale as telemetry volume grows across devices/tenants. Database Schema (#10) is free to design it as a real table.

### 6.2 DeviceAdapter's eventual home — flagged, not urgent
Confirmed as code (not a table) for MVP per DA-3.1. When a self-service third-party adapter marketplace is eventually built (Vision §10, explicitly post-MVP), DeviceAdapter will need to become a real, versioned database entity. No action needed now; noting it so that future work doesn't have to rediscover this transition point.

### 6.3 ChannelPartner cardinality — resolved
Confirmed a Tenant has at most one ChannelPartner (0..1), and a ChannelPartner has many Tenants. If a tenant's channel relationship changes over time (e.g. switches suppliers), MVP does not need to preserve history of that change — CH-1.1 only requires a current attribution, not an audit trail of past attributions. If that's wrong, it should surface now rather than after the Database Schema is written.

### 6.4 Technician login — real, unconfirmed judgment call *(added v1.1)*
Modeled with no login (§2.7, §4 decision 8), mirroring the Field Service Partner precedent. This is the *smaller* build if right — Security Architecture only needs to design auth for ChannelPartnerUser, not a second tier. But it's a real product judgment call, not just an implementation detail: a technician who can't check their own phone for today's route without going through their office admin may be real workflow friction the user hasn't weighed in on yet. **Flagged for confirmation before Security Architecture (#13) locks in the auth surface.**

### 6.5 RouteStop as a separate entity vs. a JSONB array on RouteAssignment — resolved, separate entity chosen *(added v1.1)*
Modeled as a separate table (§2.7) rather than an ordered JSONB array of site IDs on RouteAssignment, consistent with how every other domain-meaningful join in this schema (ServiceTicket→Alert, Device→Asset) is a real relational entity, not a JSONB blob. A per-stop entity also leaves room for a future per-stop completion field without a schema migration, though stop-level completion tracking is explicitly not required at MVP (TR-3.1/TR-3.2 don't ask for it).

---

## 7. Traceability

Every entity/attribute above cites the SRS requirement it formalizes inline, or is marked *(existing)* against `docs/data-model.sql`. No entity here should be treated as authoritative until the Open Questions in §6 are resolved and this document is marked Approved, at which point the Database Schema (#10) becomes free to depend on it. **Added v1.1:** §2.7 (ChannelPartnerUser, Territory, Technician, RouteAssignment, RouteStop) traces to PRD §5.8 (CH-3/CH-3a) + §5.10 (TR-1–TR-3) and SRS §3.8 (CH-3.1/CH-3a.1) + §3.12 (TR-1.1–TR-3.2) — **§6.4's open question (Technician login) should be treated as a real gate on Security Architecture, not a formality**, unlike §6.1–§6.3 which are fully closed.

---

## 8. Review Log

**v1 (2026-07-04):** all open items raised during review resolved; no outstanding sign-offs remained at that time.

1. **MetricBaseline maintained vs. live-derived (§6.1)**: confirmed as a maintained entity, for the performance reasons already stated in §4.3. No change to the modeling.
2. **DeviceAdapter's eventual home (§6.2)**: confirmed as code, not a table, for MVP — no action needed now; flagged for whenever a self-service adapter marketplace is scoped.
3. **ChannelPartner cardinality (§6.3)**: confirmed — a Tenant has at most one ChannelPartner, no attribution-history tracking required at MVP.

**v1.1 (2026-07-11), reviewed 2026-07-11:** one item deliberately left open, not a gap missed on review.

4. **Technician login (§6.4) is genuinely unresolved**, not just flagged for form's sake — modeled with no login as the working assumption (mirroring the Field Service Partner precedent), but this is a real product judgment call the user hasn't weighed in on. Called out explicitly in §7's traceability note so it isn't accidentally treated as settled once this document is approved.
5. **Re-verified, held up:** the claim that `docs/data-model.sql` has an installed-but-unused `postgis` extension (checked directly against the file's `CREATE EXTENSION` statements, not assumed from memory); the Field Service Partner no-login precedent (re-checked against User Personas §2.5's exact wording); that RP-2.1 is a live query with no persisted state, distinguishing it correctly from the new RouteAssignment's need for a stable, confirmable snapshot.

---

## Revision History

**v1.1 (2026-07-11)** — forced by the PRD v1.5/SRS v1.5 amendment (channel-partner portal, territory/dispatch management), per this document's own rule (§7) that a downstream — here, upstream-then-cascading — requirements change must amend this document explicitly rather than leaving Database Schema to invent entities unilaterally.

- **ChannelPartner amended**: added a nullable `branding` (JSONB) attribute for the white-label portal login (CH-3.1).
- **§2.7 added**: five new entities — ChannelPartnerUser (a genuinely new identity surface, separate from `User`), Territory (map-drawn boundary, Site membership derived not stored), Technician (modeled with no login, mirroring the Field Service Partner precedent — flagged as unconfirmed in §6.4), RouteAssignment and RouteStop (a stored, confirmable snapshot distinct from RP-2.1's live-computed urgency list).
- **§4 decisions 6–8 added**: channel-partner-scoping as a genuinely new second scoping dimension alongside `tenant_id` (flagged for Multi-Tenant Architecture and Security Architecture, not resolved here); Territory→Site as a derived resolution rule (consistent with the existing Asset→DeviceAdapter precedent); Technician's no-login design flagged as unconfirmed.
- **§6.4/§6.5 added**: Technician login left genuinely open (not resolved, unlike every other open question in this document); RouteStop's separate-entity-vs-JSONB question resolved in favor of a separate entity.
- **Explicitly not resolved in this pass** (tracked in `project-peaklogic-channel-partner-portal` memory): Territory's exact geometry storage type, the channel-partner-scoped RLS mechanism, ChannelPartnerUser's concrete Cognito mechanism, and the Technician-login product decision — all deferred to their respective downstream artifacts.
