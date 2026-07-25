# API Specification

**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Company:** PeakLogic
**Project codename:** Project Vantage
**Status:** Draft v1.4 (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1.1 until v1.2/v1.3/v1.4 are approved)
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (Draft v1.7, pending), [SRS](srs.md) (Draft v1.7, pending), [Domain Model](domain-model.md) (Draft v1.4, pending), [Database Schema](database-schema.md) (Draft v1.4, pending), [Security Architecture](security-architecture.md) (Draft v1.3, pending), [Multi-Tenant Architecture](multi-tenant-architecture.md) (Draft v1.2, pending), [User Personas](user-personas.md) (approved v1.2), [User Stories](user-stories.md) (Draft v1.1, pending), [UX Wireframes](ux-wireframes.md) (Draft v1.4, pending), [Information Architecture](information-architecture.md) (Draft v1.1, pending), [iOS Application](ios-application.md) (Draft v1.1)
**Last updated:** 2026-07-17
**Fork note (v1.4):** the first amendment specific to the `PeakLogic-Azure` fork's Azure-pivot feature backlog (map, 3D rendering). See §4.11/§4.12 and Revision History.

---

> **⚡ Unified Platform (v2.0) amendment — 2026-07-25.** New endpoint groups are needed over the v2.0 schema (migrations `1784142000000`–`…240000`): **Hubs** (`/v1/hubs` — fleet register/status), **PeakView360** (`/v1/hmi-screens`, `/v1/tags`, `/v1/historian` reading existing `telemetry`), **CMMS** (`/v1/work-orders`, `/v1/pm-schedules`, `/v1/service-visits` — extends the existing ticket + CMMS-connector routes), **Compliance** (`/v1/compliance/reports`, templates, exceedances — generation only; delivery blocked, CP-5), and **PeakAssist** (`/v1/help` — content by context key / alarm type). All tenant-scoped routes use the existing `withTenant()` RLS pattern; global catalogs (compliance templates, help content) are non-RLS reads. **Implemented (2026-07-25)** in `backend/api/routes/` over the tested handlers, registered in `api/router.ts`: `GET/POST /v1/hubs`, `POST /v1/hubs/{hubId}/heartbeat`, `GET /v1/hubs/{hubId}/peakassist-sync`, `GET /v1/hmi-screens`, `GET /v1/tags`, `POST /v1/tickets/{ticketId}/advance` (CMMS funnel advance + `service_visit`), `GET /v1/tickets/funnel`. Still design-stage: the compliance report endpoints (generation built, delivery blocked — CP-5) and the PeakAssist `/v1/help` read + authoring UI. Requirements: PRD §5.18–§5.22. Full plan: [`unified-platform-integration-plan.md`](unified-platform-integration-plan.md).

## 1. Introduction

### 1.1 Purpose

Domain Model §5 deferred "request/response payload shapes, including the MCP server's exact tool schema" to this document (SRS §4.1's own deferral — "detailed screen specs" — went to UX Wireframes, a separate matter). SRS §4.4 separately deferred MCP's transport specifically here too. `backend/api/router.ts` and `backend/api/routes/*.ts` already implement 24 REST endpoints — this document formalizes their contract, decides the handful of things they leave inconsistent or unbuilt, and specifies the endpoints later artifacts (RP-1.1, RP-4.1, CH-1.2, MCP-1.1) require but that don't exist in code yet.

### 1.2 Scope

In scope: REST conventions (casing, pagination, error format — the existing code is inconsistent on the first two, decided here), the endpoint contract for every existing route plus every new one required by an already-approved requirement, and the MCP tool contract (MCP-1.1/MCP-2.1). Out of scope: infrastructure wiring beyond what's needed to reason about the contract (→ Infrastructure as Code, #16), the actuation/command endpoint (→ Device & Command Security Architecture, #12 — CC-3/CC-4 are explicit nothing ships at MVP), and the rollup/purge job's own internal interface (it's not user-facing).

---

## 2. Conventions

### 2.1 Wire Format: snake_case, both directions

**Decision: request and response bodies both use `snake_case`, matching database column names 1:1.**

The existing code is inconsistent, and not in the direction a first guess would suggest. Response bodies are already `snake_case` (`SELECT *` returned as-is — `site.tenant_id`, `alert.triggered_at`), and `assets.ts`'s own `AssetBody` request interface already matches (`site_id`, `serial_number`, `install_date`) — real existing precedent for this decision. The outliers are `tickets.ts`'s `TicketBody` (`assetId`, `webhookUrl`, `dueAt`) and `devices.ts`'s inline update-body type (`assetId`, `firmwareVersion`), both `camelCase`, manually mapped to snake_case SQL params inside each handler. Query string parameters are inconsistent too — existing routes use camelCase (`?deviceId=`, `?siteId=`, `?assetId=`), while this document's own new §4.2 endpoint used snake_case (`sort_by`, `state`) before this fix. **The decision covers both bodies and query parameters**: `snake_case` throughout, matching `assets.ts`'s already-established precedent, removing the per-field mapping entirely for the two outlier routes — a request body can be spread almost directly into a parameterized query — and costing nothing to change now, since the frontend is still on mock data and not yet wired to the real API (CLAUDE.md). Reconciling the existing route handlers (and their query param names) to match is follow-up work (§7 Open Questions), not done in this draft.

### 2.2 Pagination

**Decision: every list endpoint takes `?limit=&offset=`, default `limit=100`, max `limit=500`.**

Today's behavior is inconsistent and, in three cases, unbounded: `alerts.list` and `tickets.list` both hardcode `LIMIT 200`, `telemetry.list` allows up to `LIMIT 5000` via a query param, but `sites.list`, `assets.list`, and `devices.list` have **no limit at all** — they return every row for the tenant. Not urgent at today's design-partner-tenant scale (PRD §8), but a real gap once a tenant has hundreds of sites or years of device history. Retrofitting the three uncapped endpoints is follow-up work (§7).

### 2.3 Versioning, Errors, Auth (existing — restated, not changed)

- All routes are under `/v1/*`; no versioning scheme beyond the path prefix exists yet, and none is needed at MVP.
- Errors are `{ "message": string }` with the appropriate 4xx/5xx status (`backend/shared/response.ts`) — unchanged.
- Every route (except the two exceptions in §5) authenticates via the Cognito authorizer at the API Gateway layer; `getAuth()` extracts `tenantId`/`role` from JWT claims; every DB-touching handler wraps its query in `withTenant()` (MT-1.1). ~~`devices.claim` is the one existing, intentional exception — it uses the unscoped pool because a device has no `tenant_id` yet at the moment of claiming.~~ **Stale as of v1.1 — corrected, not true anymore.** Multi-Tenant Architecture §2.5.3 found this "intentional exception" was actually the same table-owner RLS bug as everywhere else, not a deliberate design choice — `claim()` now runs inside `withTenant()` like every other route, with a narrowly-scoped `unclaimed_lookup` RLS policy (gated on a new `app.claim_context` marker) handling the "device has no tenant yet" case instead of bypassing RLS entirely.

---

## 3. Endpoint Reference by Domain Area

Full request/response implementation lives in `backend/api/routes/*.ts`; this table is a navigational summary formalizing the contract, not a duplicate of the code.

| Domain | Endpoints | Source |
|---|---|---|
| Sites | `GET/POST /v1/sites`, `GET/PUT/DELETE /v1/sites/{siteId}` | `routes/sites.ts` |
| Assets | `GET/POST /v1/assets`, `GET/PUT/DELETE /v1/assets/{assetId}` | `routes/assets.ts` |
| Devices | `GET /v1/devices`, `POST /v1/devices` (claim, not create), `GET/PUT/DELETE /v1/devices/{deviceId}` | `routes/devices.ts` |
| Alerts | `GET /v1/alerts`, `GET /v1/alerts/{alertId}`, `PUT /v1/alerts/{alertId}` (status transition only — no create/delete; alerts originate from the ingest Lambda) | `routes/alerts.ts` |
| Tickets | `GET/POST /v1/tickets`, `GET/PUT/DELETE /v1/tickets/{ticketId}` (`DELETE` is soft — sets `status: cancelled`) | `routes/tickets.ts` |
| Telemetry | `GET /v1/telemetry?deviceId=&metric=&from=&to=&limit=` (read-only — writes arrive via IoT Core, not this API) | `routes/telemetry.ts` |

24 endpoints total today. All six domains above are unchanged by this document except where §4 says otherwise.

**Added v1.1 — a second, parallel endpoint tree under `/v1/partner/*`**, authenticated by a completely separate Cognito authorizer bound to `PartnerPool` (Security Architecture §2.4), not the tenant `userPool` authorizer every endpoint above uses:

| Domain | Endpoints | Source |
|---|---|---|
| Partner self-read & branding | `GET /v1/partner`, `PUT /v1/partner/branding` | `routes/partner.ts` *(new)* |
| Territories | `GET/POST /v1/partner/territories`, `GET/PUT/DELETE /v1/partner/territories/{territoryId}` | `routes/partner-territories.ts` *(new)* |
| Channel partner users | `GET/POST /v1/partner/users`, `GET/PUT/DELETE /v1/partner/users/{userId}` | `routes/partner-users.ts` *(new)* |
| Routes | `GET/POST /v1/partner/routes`, `GET/PUT /v1/partner/routes/{routeId}`, `POST /v1/partner/routes/{routeId}/confirm` | `routes/partner-routes.ts` *(new)* |

17 new endpoints *(corrected 2026-07-11 — see §8 Review Log)*. See §4.5.

**Added v1.2 — a third, parallel endpoint tree under `/v1/admin/*`, authenticated by `StaffPool` (Security Architecture §2.5). Also, `GET /v1/devices` (existing, in the table above) gained `assetId`/`siteId` filtering — no new row, an existing endpoint's contract changed.** *(This table itself was found stale while writing this v1.3 amendment — it never gained this v1.2 block despite §4.7/§4.8/§4.9 shipping real code; fixed here rather than left to compound further, see §8 Review Log.)*

| Domain | Endpoints | Source |
|---|---|---|
| Self-read | `GET /v1/admin` | `routes/admin.ts` *(new)* |
| Tenants | `GET/POST /v1/admin/tenants`, `GET /v1/admin/tenants/{tenantId}` | `routes/admin-tenants.ts` *(new)* |
| Channel partners | `GET/POST /v1/admin/channel-partners`, `GET /v1/admin/channel-partners/{partnerId}` | `routes/admin-partners.ts` *(new)* |
| Staff users | `GET/POST /v1/admin/staff-users` | `routes/admin-staff.ts` *(new)* |
| Assignments | `GET/POST/DELETE /v1/admin/assignments` | `routes/admin-assignments.ts` *(new)* |
| Acting on a tenant | `POST /v1/admin/tenants/{tenantId}/users`, `PUT /v1/admin/tenants/{tenantId}/devices/{deviceId}`, `PUT /v1/admin/tenants/{tenantId}/assets/{assetId}`, `PUT /v1/admin/tenants/{tenantId}/alerts/{alertId}` | `routes/admin-tenant-actions.ts` *(new)* |
| Settings *(tenant-pool authenticated, not `/v1/admin/*`)* | `GET/PUT /v1/settings`, `PUT /v1/settings/password`, `GET /v1/settings/mfa`, `GET/POST /v1/settings/team`, `PUT/DELETE /v1/settings/team/{userId}` | `routes/settings.ts` *(new)* |

20 new endpoints. See §4.7/§4.8/§4.9.

**Added v1.3 — a fourth, parallel endpoint tree under `/v1/partner-manager/*`, authenticated by `PartnerPool` with `getManagerAuth()` (Security Architecture §2.6) rather than `getPartnerAuth()`. Existing `/v1/partner/*` routes above are also reused, unchanged in shape, when called by a manager session — see §4.10.**

| Domain | Endpoints | Source |
|---|---|---|
| Cross-account overview | `GET /v1/partner-manager/overview` | `routes/partner-manager.ts` *(new)* |
| Invite-or-link/revoke (`partner_admin`-initiated) | `POST /v1/partner/managers`, `DELETE /v1/partner/managers/{channelPartnerManagerId}` | `routes/partner-managers.ts` *(new)* |
| Invite-or-link/revoke (`superadmin`-initiated) | `POST /v1/admin/channel-partners/{partnerId}/managers`, `DELETE /v1/admin/channel-partners/{partnerId}/managers/{channelPartnerManagerId}` | `routes/admin-partners.ts` |

2 genuinely new resource paths, 2 new methods on an existing admin resource. See §4.10.

**Added v1.4 — no new tenant-side resource path; `GET /v1/portfolio` (§4.1) gains additive fields. One genuinely new partner-side endpoint.**

| Domain | Endpoints | Source |
|---|---|---|
| Portfolio map data | `GET /v1/portfolio` *(existing, response extended — see §4.11)* | `routes/portfolio.ts` |
| Partner portfolio map | `GET /v1/partner/portfolio` *(new)* | `routes/partner-portfolio.ts` *(new)* |

1 new endpoint, 1 extended response shape. See §4.11. **3D facility asset delivery has no endpoint at all in this pass — see §4.12.**

---

## 4. New Decisions

### 4.1 Portfolio Roll-Up (RP-1.1)

```
GET /v1/portfolio
```
Returns every site the caller's tenant operates, grouped into the three buckets RP-1.1/UX Wireframes §2.1 require: `trending` (open `trend`/`anomaly`-type alert per AI-3.2), `alarmed` (open `threshold`-type alert), `healthy` (neither). A **new** endpoint, not an extension of `GET /v1/sites` — RP-1.1's grouping is a fundamentally different shape (risk-bucketed) from a flat list, and Information Architecture §2 already treats Portfolio Roll-Up and Sites as two separate screens for the same reason.

```json
{
  "trending": [{ "site_id": "...", "name": "...", "alert_summary": "pH drifting low" }],
  "alarmed":  [{ "site_id": "...", "name": "...", "alert_summary": "Pressure critical" }],
  "healthy":  [{ "site_id": "...", "name": "..." }]
}
```

Available to Tenant Admin and Corporate/Regional Ops Leader (Information Architecture §2) — both roles map to the existing `admin` Cognito group; there is no separate "Ops Leader" role in AUTH-2's model, and this draft does not propose adding one (out of scope — see §7).

### 4.2 Sites Directory Query Parameters (RP-4.1)

Extends the **existing** `GET /v1/sites` rather than adding a new endpoint — RP-4.1 is a sort/filter variant of the same flat list `sites.list` already returns, not a new shape:

```
GET /v1/sites?sort_by=city|state|name&state=TX&limit=&offset=
```

`sort_by` defaults to `name` (today's behavior, unchanged if the param is omitted). `state` filters against `address->>'state'`. Requires no schema change — `sites.address` (JSONB) already carries street/city/state (Database Schema §3).

### 4.3 Tenant Self-Read, Including Supplier Attribution (CH-1.2)

No endpoint returns tenant-level data today — not even the tenant's own name/plan/settings. UX Wireframes §2.8 ("Your Supplier") needs one:

```
GET /v1/tenant
```
Returns the caller's own tenant row, with `channel_partner_id` resolved to the partner's name (never the raw ID or the classification term "channel partner" — CH-1.2, Information Architecture §4):
```json
{ "id": "...", "name": "...", "plan": "professional", "supplier_name": "AquaChem Supply Co." }
```
`supplier_name` is `null` when `channel_partner_id` is unset — most tenants at MVP, since the channel relationship is real but not every tenant comes through it (CH-1's "optional" framing, Domain Model §2.1).
**No `PUT`/`PATCH` exists for `channel_partner_id` on this or any endpoint.** This is CH-1.2 enforced at the API layer, not just the UI layer — the UX Wireframes' read-only screen (§2.8) is necessary but not sufficient; a tenant-editable field with no corresponding write endpoint is the actual guarantee.

### 4.4 MCP Server Tool Contract (MCP-1.1, MCP-2.1)

No MCP server code exists yet. Three read-only tools, minimum required by MCP-1.1:

| Tool | Equivalent to | Notes |
|---|---|---|
| `list_devices_and_alerts` | `GET /v1/devices` + `GET /v1/alerts` | Combined per MCP-1.1's "list devices/alerts for a tenant" wording — one tool call, not two |
| `get_telemetry` | `GET /v1/telemetry` | Same params: `device_id`, `metric`, `from`, `to` |
| `get_alert_detail` | `GET /v1/alerts/{alertId}` | |

MCP-2.1: same Cognito token, same `withTenant()` scoping — no separate auth path. This means the MCP server shares `backend/shared/auth.ts`/`backend/shared/db.ts`, not a parallel implementation. Exact transport (stdio vs. HTTP/SSE) is unsettled — SRS §4.4 already flagged this as this document's job and it remains open (§7).

### 4.5 Channel Partner Portal Endpoints (new — added v1.1, TR-1.1–TR-3.2, CH-3.1)

**A genuinely parallel request path, not a variant of the tenant one.** Security Architecture §2.4 built `PartnerPool`, `getPartnerAuth()`, and `withChannelPartner()` but deliberately didn't wire an API Gateway authorizer to anything, since no routes existed yet — this is where that gets finished. `backend/api/handler.ts` now branches on whether `event.resource` starts with `/v1/partner/`: tenant routes call `getAuth()` + the existing `route()` dispatcher (`AuthContext`, `withTenant()`); partner routes call `getPartnerAuth()` + a new `partnerRoute()` dispatcher (`PartnerAuthContext`, `withChannelPartner()`) in a new `backend/api/partner-router.ts`, mirroring `router.ts`'s exact shape. Two separate route maps, not one map with a union auth type — keeps each dispatcher's type simple and matches how the two Cognito pools are already kept structurally separate (Security Architecture §2.4's own reasoning).

**Casing/pagination conventions from §2.1/§2.2 apply identically** — no new inconsistency introduced for the sake of being new.

#### `GET /v1/partner`

Returns the caller's own `channel_partners` row — analogous to `GET /v1/tenant` (§4.3), same reasoning: no endpoint returned partner-level data before this. Available to both roles.
```json
{ "id": "...", "name": "Pinch-A-Penny — Riverside", "status": "active", "branding": { "logo_url": "...", "primary_color": "#0EA5E9", "secondary_color": "#0369A1" } }
```

#### `PUT /v1/partner/branding`

`requirePartnerRole(session, 'partner_admin')`. Body: `{ "logo_url"?: string, "primary_color"?: string, "secondary_color"?: string }`, merged into the existing `branding` JSONB (Database Schema §4.4), not replaced wholesale — omitting a field leaves it unchanged.

#### Territories (`TR-1.1`)

```
GET/POST /v1/partner/territories
GET/PUT/DELETE /v1/partner/territories/{territoryId}
```
List/read available to both roles (a technician can see their own assigned territory's boundary); create/update/delete require `partner_admin`. `boundary` is accepted and returned as **GeoJSON** (`{"type":"Polygon","coordinates":[[[lng,lat],...]]}`), not raw WKT — matches what Mapbox GL Draw (the locked map technology, `project-peaklogic-channel-partner-portal` memory) natively produces/consumes, so the frontend never hand-converts geometry formats. Converted at the database boundary: `ST_GeomFromGeoJSON($1)::geography` on write, `ST_AsGeoJSON(boundary)::json` on read — the conversion is the API layer's job, consistent with this document's existing "the contract, not the storage format" framing (Database Schema owns storage; this document owns the wire shape).
```json
{ "id": "...", "name": "North Riverside Route", "boundary": { "type": "Polygon", "coordinates": [[[-77.05,38.9],[-77.0,38.9],[-77.0,38.95],[-77.05,38.95],[-77.05,38.9]]] } }
```

#### Channel partner users (`Domain Model §4 decision 8`)

```
GET/POST /v1/partner/users
GET/PUT/DELETE /v1/partner/users/{userId}
```
All operations require `partner_admin` — **provisioning is admin-initiated, no self-service signup**, the same principle already locked in Domain Model §4 decision 8, enforced here at the API layer the same way CH-1.2 enforces PeakLogic-internal-only channel-partner assignment (§4.3).

`POST` body: `{ "email": string, "display_name"?: string, "role": "partner_admin" | "technician", "territory_id"?: string }`. **Creates a real Cognito user in `PartnerPool`, not just a database row** — `AdminCreateUserCommand` (temporary password, `MessageAction: 'SUPPRESS'` so PeakLogic's own invite email template controls delivery rather than Cognito's default one — matches the tenant pool's `selfSignUpEnabled: false`, admin-invited-only posture), then inserts the `channel_partner_users` row with the returned `sub` as `cognito_sub`. **Not atomic across both systems** — flagged explicitly in §7, not silently assumed safe. `territory_id` is only meaningful when `role: "technician"` (Domain Model §2.7); rejected with `400` if supplied alongside `role: "partner_admin"`.

#### Routes (`TR-2.1`, `TR-3.1`, `TR-3.2`)

```
GET  /v1/partner/routes?date=&technician_id=
GET  /v1/partner/routes/{routeId}
POST /v1/partner/routes
PUT  /v1/partner/routes/{routeId}
POST /v1/partner/routes/{routeId}/confirm
```

**`GET /v1/partner/routes` needs no role-based branching in application code at all — RLS already does it.** `route_assignments`' `channel_partner_isolation` policy (Database Schema §4.4) restricts a `technician`-role session to only their own rows; a `partner_admin` sees every route under their partner. The same query, run through `withChannelPartner()`, transparently returns "my day" for a technician and "the whole team's schedule" for an admin — the endpoint doesn't need to know which.

`GET /v1/partner/routes/{routeId}` returns the route with its ordered stops, each stop's **live** site status/chemistry reading — not stored on `route_stops` (Domain Model §2.7's "don't duplicate what's derivable" principle), queried the same Site→Asset→Device→Telemetry chain RP-2.1 already uses:
```json
{
  "id": "...", "technician_user_id": "...", "route_date": "2026-07-13", "source": "ai_suggested", "status": "suggested",
  "stops": [
    { "sequence_number": 1, "site_id": "...", "site_name": "Lakeside Pool Route", "readings": { "ph": 6.8, "free_chlorine_ppm": 1.2, "temp_c": 27.5 }, "alert_status": "warning" }
  ]
}
```

`POST /v1/partner/routes` — **submits a route (AI-suggested or manually built), does not compute one.** Body: `{ "technician_user_id": string, "route_date": string, "source": "ai_suggested" | "manual", "stops": [{"site_id": string, "sequence_number": number}] }`. Available to `partner_admin` only. **PeakLogic's backend never calls out to an AI agent to generate this — TR-3.2's "no in-house routing algorithm" constraint** (already locked, Domain Model §4/PRD §5.10) means the *ordering* is computed entirely outside this system, by an external agent consuming the MCP server's read tools (§4.6, below), and submitted back here as a finished, ordered list. This endpoint's job is to store and validate a submission, not to orchestrate the AI call — keeps the "external agent, not PeakLogic-built routing logic" boundary exactly where TR-3.2 drew it, rather than this document quietly redrawing it by giving PeakLogic's backend an orchestration role.

`PUT /v1/partner/routes/{routeId}` — `partner_admin` only, replaces the stop list (manual adjustment of an AI suggestion before confirming, or of a route generally). Rejected with `409` if `status = 'confirmed'` — a confirmed route is immutable; re-plan by submitting a new one.

`POST /v1/partner/routes/{routeId}/confirm` — `requirePartnerRole(session, 'partner_admin')`, sets `status = 'confirmed'`, `confirmed_by`, `confirmed_at` (Database Schema §4.4's `device_claim`-style transition pattern, applied here to `route_assignments` instead). **This is TR-3.1's "advisory only" requirement made concrete as an actual state transition**, not just a status label nobody checks — a `suggested` route has no operational effect until this call.

### 4.6 MCP Server: Territory/Technician Tool Extension (new — added v1.1, extends §4.4)

SRS §3.7 (v1.5) already committed to extending MCP-1.1's tool list for the pool-servicing vertical's external dispatch agent. Formalized here, alongside the original three tools (§4.4):

| Tool | Equivalent to | Notes |
|---|---|---|
| `list_partner_territories` | `GET /v1/partner/territories` | |
| `list_technicians` | `GET /v1/partner/users?role=technician` | |
| `get_territory_sites` | (no direct REST equivalent — the derived Territory→Site query, Domain Model §2.7) | Returns each site's current chemistry/alert status, the exact data an external dispatch agent needs to compute an ordering |

Same MCP-2.1 auth reuse principle, extended: a request presenting a `PartnerPool`-issued token authenticates exactly like a `GET /v1/partner/*` call would, resolved through `withChannelPartner()` — no third auth path invented for MCP specifically. **The MCP server itself still doesn't exist in code** (§4.4's standing note) — this section specifies the contract these tools will need to satisfy once it's built, the same "mechanism before implementation" sequencing every other MCP-related decision in this project has followed.

### 4.7 Internal Administration Console Endpoints (new — added v1.2, IA-1.1–IA-8.1)

Base path `/v1/admin/*`, a third parallel resource tree authenticated by `StaffPool` (Security Architecture §2.5) — same pattern as `/v1/partner/*`'s own separate authorizer.

| Domain | Endpoints | Source |
|---|---|---|
| Self-read | `GET /v1/admin` | `routes/admin.ts` *(new)* |
| Tenants | `GET/POST /v1/admin/tenants` (POST is `superadmin`-only, `requireStaffRole`), `GET /v1/admin/tenants/{tenantId}` | `routes/admin-tenants.ts` *(new)* |
| Channel partners | `GET/POST /v1/admin/channel-partners` (POST is `superadmin`-only), `GET /v1/admin/channel-partners/{partnerId}` | `routes/admin-partners.ts` *(new)* |
| Staff users | `GET/POST /v1/admin/staff-users` (POST is `superadmin`-only) | `routes/admin-staff.ts` *(new)* |
| Assignments | `GET/POST/DELETE /v1/admin/assignments` (all `superadmin`-only — granting/revoking a book of business) | `routes/admin-assignments.ts` *(new)* |
| **Acting on a tenant** (IA-5.1) | `POST /v1/admin/tenants/{tenantId}/users`, `PUT /v1/admin/tenants/{tenantId}/devices/{deviceId}`, `PUT /v1/admin/tenants/{tenantId}/assets/{assetId}`, `PUT /v1/admin/tenants/{tenantId}/alerts/{alertId}` | `routes/admin-tenant-actions.ts` *(new)* |

**The "acting on a tenant" endpoints deliberately do not reimplement business logic** — each one calls `withStaffActingOnTenant(auth, tenantId, ...)` (Security Architecture §2.5) instead of `withTenant(auth.tenantId, ...)`, then runs the *exact same* query the corresponding tenant-side route already runs (`routes/devices.ts`'s claim/update logic, `routes/assets.ts`'s specs update, `routes/alerts.ts`'s status update, and a new user-creation query mirroring the manual Cognito-console process the SysAdmin Guide currently documents). This is a direct consequence of Database Schema §4.5's design choice — the handoff exists specifically so this layer doesn't need its own parallel implementation of "how to create a tenant user" or "how to claim a device."

**Every write through this resource tree calls `writeAuditLog()` with `actorStaffUserId` set (IA-7.1)** — not optional, not a follow-up item the way the channel-partner portal's call sites were disclosed as unwired (Security Architecture §2.4's §8 item 5). Given this pass already knows to check for that gap, it isn't repeated here.

**`channel_partners` creation is checked at the application layer, not RLS** (Database Schema §4.5's disclosed scope decision) — `POST /v1/admin/channel-partners`'s handler calls `requireStaffRole(auth, 'superadmin')` explicitly before the `INSERT`, since there's no policy backing it the way `POST /v1/admin/tenants` has.

### 4.8 Settings & Preferences Endpoints (new — added v1.2, SET-1.1–SET-8.1)

Base path `/v1/settings`, tenant-pool authenticated — the existing `getAuth()`/`withTenant()` path, no new auth surface.

| Domain | Endpoints | Notes |
|---|---|---|
| Profile & display preferences | `GET/PUT /v1/settings` | `PUT` body: `{ display_name?, clock_format?, timezone?, theme? }`, partial update (only provided fields change) — mirrors `PUT /v1/partner/branding`'s merge-not-replace convention |
| Password | `PUT /v1/settings/password` | Proxies to Cognito's `ChangePassword` API — no parallel credential store (SET-2.1) |
| MFA | `GET /v1/settings/mfa` | Returns enrolled method status; re-enrollment reuses Cognito's existing associate-software-token flow, not a new mechanism (SET-6.1) |
| Team (Tenant Admin only) | `GET/POST /v1/settings/team`, `PUT/DELETE /v1/settings/team/{userId}` | `requireRole(auth, 'admin')` — a product-facing equivalent of the AWS-Console process, calling the same underlying Cognito `AdminCreateUser`/group-management calls the SysAdmin Guide currently documents as manual (SET-7.1) |

**SET-8 (notification preferences) has no endpoint here** — PRD/SRS both marked it `Could`, conditioned on verifying real email-notification infrastructure exists beyond Cognito's transactional emails and the existing webhook-on-critical-alert path. Not building an endpoint for an unverified capability.

### 4.9 Site → Asset → Device Drill-Down (new — added v1.2, NAV-1.1–NAV-5.1)

**Most of this drill-down needs no new endpoint at all — checked directly against what already exists, not assumed missing.** `GET /v1/assets?siteId=` already exists and already satisfies NAV-1.1 (Site Detail's asset list). `GET /v1/telemetry?deviceId=` already exists and already satisfies NAV-3.1 (Device Detail's telemetry). The **one real gap** is NAV-2.1/NAV-5.1's asset→device lookup:

| Change | Before | After |
|---|---|---|
| `GET /v1/devices` | Ignores all query parameters (verified directly, `backend/api/routes/devices.ts`), always returns the full tenant device list | Accepts optional `assetId` and `siteId` query parameters, filtering server-side. `siteId` requires a join through `assets` (a device has no direct `site_id`) — resolves via `devices.asset_id → assets.id → assets.site_id` |

No new route, no new resource — the existing `GET /v1/devices` handler gains a `WHERE` clause. **The channel-partner portal's equivalent** (NAV-4.1) reuses this same parameter shape on `GET /v1/partner/routes/{routeId}` territory-adjacent site queries where applicable, rather than inventing a second filtering convention.

### 4.10 Channel Partner Manager Endpoints (new — added v1.3, see Revision History)

Domain Model §2.9 / Database Schema §4.6 / Security Architecture §2.6 built the entity, RLS, and identity/handoff mechanism for a manager acting across multiple `ChannelPartner` accounts; this section is the final step of the amendment sequence — the actual request/response contract.

**A manager acting on one specific account reuses the existing `/v1/partner/*` routes (§4.5) unchanged — this is not a fourth copy of every partner endpoint.** The whole point of §2.6's handoff design is that once `app.current_channel_partner_id`/`app.current_channel_partner_role` are set, every downstream query is identical regardless of whether a real `channel_partner_users` `partner_admin` or a manager acting-as one issued the request. This document extends that principle up to the API layer: `backend/api/handler.ts`'s existing `/v1/partner/` branch (§4.5) checks whether the caller's token carries the `channel_partner_manager` group (Security Architecture §2.6). If not, behavior is completely unchanged — `getPartnerAuth()` + `withChannelPartner()`, exactly as today. **If so**, the handler instead requires a new `X-Channel-Partner-Id` request header (400 if missing — a manager request with no target account is meaningless, there's no implicit single scope the way a real partner session has), calls `getManagerAuth()` + `withManagerActingOnChannelPartner(auth, headerValue, ...)`, and then dispatches into the **exact same `partnerRoute()` function** (`backend/api/partner-router.ts`) every ordinary partner request already uses. No new route handler exists anywhere for territories, branding, users, or routes — a manager managing a specific account's technicians calls the identical `GET/POST /v1/partner/users` a real `partner_admin` would, just with one extra header.

**Why a header, not a path segment (e.g. `/v1/partner-manager/{channelPartnerId}/territories`) or a body field:** a path-segment or body-field design would require either duplicating every `/v1/partner/*` route under a second path prefix (real, unwarranted duplication — exactly what reusing `partnerRoute()` above avoids) or teaching every existing handler to read the target ID from two different places depending on caller type. A header keeps the URL and body **identical** to the ordinary partner request in every case, so `partnerRoute()`'s dispatch table needs zero changes — only `handler.ts`'s auth-resolution step (already the one place that branches on caller type) needs to know about the header.

**`GET /v1/partner-manager/overview`** — the locked landing-screen decision (Domain Model §2.9, iOS doc §2.1a). `getManagerAuth()` + `withManagerSession()` (Security Architecture §2.6) resolves the manager's own row, then the handler loops the manager's own `channel_partner_manager_assignments` (RLS-scoped to only their rows), calling the *same* open-issues query `GET /v1/partner/routes`'s underlying logic and RP-1.1's portfolio-roll-up both already use — once per assigned account, via the identical single-account handoff §4.10's opening paragraph describes, not a new cross-account query. Results are merged and severity-ranked in application code (an in-memory sort over a handful of accounts' worth of results, not a database-level cross-account query — deliberately, per Security Architecture §2.6's own reasoning for avoiding a new cross-account RLS shape).
```json
{
  "issues": [
    { "channel_partner_id": "...", "channel_partner_name": "...", "site_id": "...", "site_name": "...",
      "severity": "critical", "alert_id": "...", "type": "threshold", "message": "Freezer temp exceeded 41°F" }
  ]
}
```
Flat, not grouped-by-account — "ranked by severity" (Domain Model §2.9's exact framing) means one global ranking, not a severity ranking nested within a per-account grouping; the client groups/re-scopes by `channel_partner_id` when the user drills into a specific issue, which is what re-scopes the active account context (setting `X-Channel-Partner-Id` for all subsequent requests) per the locked UX decision.

**`POST /v1/partner/managers`** — the `partner_admin`-initiated half of the invite-or-link flow (Domain Model §2.9's disclosed provisioning gap). Ordinary `/v1/partner/*` auth (`getPartnerAuth()` + `withChannelPartner()`, `requirePartnerRole(session, 'partner_admin')`) — **not** the manager handoff, since granting access *to* a manager is an action the account's own real `partner_admin` takes, not something a manager grants themselves. `channel_partner_id` is never a request parameter here — it's always the calling `partner_admin`'s own session scope, preventing a `partner_admin` from granting manager access to an account that isn't theirs.
```json
// Request
{ "email": "manager@example.com" }
// Response
{ "channel_partner_manager_id": "...", "created": false }
```
Handler logic: look up `channel_partner_managers` by email — a query the invite handler itself runs as trusted application code, not exposed to the RLS-restricted `partner_admin` session directly (`manager_self_or_staff`, Database Schema §4.6, would otherwise correctly deny this exact lookup to an ordinary session, which is the point). **If found**: insert only a new `channel_partner_manager_assignments` row (`assigned_by_partner_user_id` set), `created: false`. **If not found**: create a new Cognito user in `PartnerPool` with the `channel_partner_manager` group (`AdminCreateUserCommand`, `MessageAction: 'SUPPRESS'` — identical posture to `POST /v1/partner/users`, §4.5), insert the `channel_partner_managers` row, then the assignment row, `created: true`. **Not atomic across Cognito and Postgres**, same disclosed limitation §4.5 already carries for ordinary channel-partner-user creation (§7) — not a new risk category, the same one, applied a second time.

**`POST /v1/admin/channel-partners/{partnerId}/managers`** — the `superadmin`-initiated half, structurally identical body/response/lookup-or-create logic to the endpoint above, `requireStaffRole(auth, 'superadmin')` instead of `requirePartnerRole`, `assigned_by_staff_user_id` set instead of `assigned_by_partner_user_id`. Lives under `/v1/admin/*` (§4.7's existing tree) rather than inventing a third base path for the same underlying operation — a staff-initiated grant is exactly the kind of "acting on behalf of an account" action §4.7's resource tree already exists for, even though this one grants access rather than modifying tenant/asset/device data. `{partnerId}` names the target explicitly in the path, mirroring `/v1/admin/tenants/{tenantId}/*`'s existing shape rather than requiring a header the way the manager-session case above does — a staff session has no implicit single-account scope to omit a target from, the same reasoning `/v1/admin/tenants/{tenantId}/*` already established.

**Revocation, checked against precedent rather than left unspecified: `/v1/admin/assignments` (§4.7) already has a working `DELETE` for `account_assignments` — the manager-grant endpoints mirror it directly, not left as a gap.**
```
DELETE /v1/partner/managers/{channelPartnerManagerId}     -- partner_admin, own account only
DELETE /v1/admin/channel-partners/{partnerId}/managers/{channelPartnerManagerId}  -- superadmin
```
Both delete the matching `channel_partner_manager_assignments` row (not the `channel_partner_managers` row itself — a manager who loses access to one account keeps their identity and any other accounts' assignments, the same "assignment ≠ identity" separation `account_assignments`/`peaklogic_staff_users` already model). `manager_assignment_visibility` (Database Schema §4.6) already scopes which rows each caller can see/delete — a `partner_admin` can only ever match a row for their own `channel_partner_id`, so no additional application-layer ownership check is needed beyond what RLS already enforces, the same pattern `staff_tenant_access` already established for `/v1/admin/tenants`.

### 4.11 Portfolio Map Data (new — added v1.4, GEO-1.1–GEO-6.1)

**Extends `GET /v1/portfolio` (§4.1) additively — no new tenant-side endpoint.** UX Wireframes §2.16 established the map is a view-mode toggle on the existing Portfolio Roll-Up, not a separate screen; the API follows the same shape. Every site object in `trending`/`alarmed`/`healthy` gains `lat`/`lng` (nullable, mirroring `sites.lat`/`sites.lng` exactly — Database Schema §4.7 confirmed no schema change was needed):

```json
{
  "trending": [{ "site_id": "...", "name": "...", "alert_summary": "pH drifting low", "lat": 30.2672, "lng": -97.7431 }],
  "alarmed":  [{ "site_id": "...", "name": "...", "alert_summary": "Pressure critical", "lat": null, "lng": null }],
  "healthy":  [{ "site_id": "...", "name": "...", "lat": 32.7767, "lng": -96.7970 }],
  "unlocated_count": 1
}
```
`unlocated_count` is a derived count (sites across all three buckets where `lat`/`lng` is null) — GEO-6.1's "unlocated" indicator, computed server-side in the same query rather than requiring the client to scan three arrays itself. No new role/auth path — identical `admin`-group access §4.1 already established for Portfolio Roll-Up.

**`GET /v1/partner/portfolio` — a genuinely new endpoint, unlike the tenant-side case, since no equivalent flat "every site attributed to me" endpoint existed on the partner side to extend.** Existing `/v1/partner/*` endpoints are territory-scoped (`GET /v1/partner/territories`) or route-scoped (`GET /v1/partner/routes`) — neither returns a flat, portfolio-style list of every site a partner is attributed to. Mirrors `GET /v1/portfolio`'s exact response shape (same `trending`/`alarmed`/`healthy`/`unlocated_count` fields) for frontend consistency (GEO-5.1's "same screen, different data scope" requirement, UX Wireframes §2.16). **Requires no new RLS** — the query runs through `withChannelPartner()` exactly like every other `/v1/partner/*` route, and reads `sites`/`alerts` through the `channel_partner_read` permissive policies Database Schema §4.4 already built (backed by `channel_partner_can_read_site()`), the same mechanism `GET /v1/partner/routes/{routeId}`'s per-stop readings already use. For a `technician`-role session, this is automatically restricted to their assigned territory's sites (the same RLS-driven role-branching-free pattern §4.5 already established for `GET /v1/partner/routes` — the endpoint doesn't need to know which role is asking).

### 4.12 3D Facility Asset Delivery — deliberately not designed (added v1.4, 3DR-1.1–3DR-3.1)

**No endpoint is specified here, on purpose.** Domain Model §6.7 and Database Schema §4.7 both declined to model a concrete 3D-model-asset-reference shape (format, storage, cardinality all unresolved pending a dedicated scoping pass) — designing a delivery endpoint on top of an entity that doesn't exist yet would mean inventing the very shape those documents deliberately deferred, one layer further downstream. UX Wireframes §2.17's collapsed panel is the entire committed UI surface; there is nothing for this document to specify a contract against yet. **Action for whoever picks up the 3D-rendering scoping pass**: return here once Domain Model/Database Schema have a concrete entity to design an endpoint against — likely a signed-URL-style delivery pattern (given a model file is a static asset, not a queryable record) similar in spirit to how a CDN-fronted static asset would normally be served, but not assumed or named here.

---

## 5. Unauthenticated Access: Two Screens With No Login (open, not yet resolved)

Two already-approved UX screens are, by design, accessed with **no Cognito account at all**:

- **Service Ticket view** (UX Wireframes §2.6) — the Field Service Partner "needs no account on the full platform" (User Personas §2.5).
- **Attribution Report** (UX Wireframes §2.10) — the Channel Partner is "not a daily platform user... no login" (User Personas §2.6, CH-2.1).

**Neither has an SRS requirement specifying how that access actually works.** AL-2.1 only specifies that a critical alert auto-creates a ticket and fires a webhook (a server-to-server POST to the partner's own system) — it says nothing about a human viewing a ticket in a browser without an account. And as written today, **AUTH-1 directly forbids what both screens need**: "no API... endpoint that reads or writes tenant data shall accept unauthenticated requests."

**Proposed resolution (not yet confirmed — see §7):** an opaque, unguessable per-resource token, generated at creation and embedded in the link sent to the external party, checked by the Lambda itself rather than Cognito:

```
GET /v1/public/tickets/{ticketId}?token=...
GET /v1/public/partners/{partnerId}/attribution?token=...
```

- Namespaced under `/v1/public/` deliberately, so the security model is visible in the route table itself, not buried in a conditional.
- Infra-feasible without restructuring: `infra/lib/api-stack.ts` already attaches the Cognito authorizer per-`addMethod` call, not globally — a route can simply omit it.
- Requires a new `access_token` column on `service_tickets` (generated at ticket creation) and on `channel_partners` (generated at partner setup, alongside the already-internal-only assignment mechanism from CH-1.2) — a Database Schema amendment, not yet made.
- This is a form of authentication (proof of possessing an unguessable link), just not Cognito — **AUTH-1 needs an explicit amendment carving out this exception**, not a silent exception. Not done in this draft.

**Partially superseded, v1.1 — the Attribution Report line above no longer applies to every Channel Partner.** CH-3's revision (PRD v1.5) split the Channel Partner persona in two, and this section's proposal was written before that split existed:
- A channel partner **onboarded to the operational-dispatch portal** (the pool-servicing vertical, `channel_partners.branding` set, real `channel_partner_users` accounts) now has a real, authenticated way to see their own attribution-adjacent data — logging in and calling `GET /v1/partner` (§4.5) — the opaque-token design was solving a problem this cohort no longer has.
- A channel partner **not onboarded to the portal** (every other vertical — CH-1/CH-2 attribution-only, the original, larger population this section was written for) still has no login of any kind and still needs *some* resolution — **this section's proposal remains exactly as open as it was in v1**, not resolved by this amendment. The Service Ticket view (Field Service Partner) is completely untouched by any of this work either.

**Not a full close of this open item — a narrowing of its scope**, worth stating precisely rather than either claiming victory or leaving the whole section looking unaddressed.

---

## 6. Traceability

| Section | Traces to |
|---|---|
| §4.1 Portfolio Roll-Up | RP-1.1, UX Wireframes §2.1 |
| §4.2 Sites Directory | RP-4.1, UX Wireframes §2.9 |
| §4.3 Tenant Self-Read | CH-1.2, UX Wireframes §2.8, Information Architecture §4 |
| §4.4 MCP Tool Contract | MCP-1.1, MCP-2.1, SRS §4.4 |
| §5 Unauthenticated Access | UX Wireframes §2.6/§2.10, User Personas §2.5/§2.6, CH-2.1 — in tension with AUTH-1 as currently written |
| §4.5 Channel Partner Portal Endpoints *(added v1.1)* | Domain Model §2.7, Database Schema §4.4, Security Architecture §2.4, PRD §5.10/SRS §3.12 (TR-1.1–TR-3.2) |
| §4.6 MCP Territory/Technician Tools *(added v1.1)* | SRS §3.7 (extended v1.5) |
| §4.7 Internal Administration Console *(added v1.2)* | Domain Model §2.8, Database Schema §4.5, Security Architecture §2.5, PRD §5.11/SRS §3.13 (IA-1–IA-8) |
| §4.8 Settings & Preferences *(added v1.2)* | Domain Model §2.1, PRD §5.12/SRS §3.14 (SET-1–SET-8) |
| §4.9 Site→Asset→Device Drill-Down *(added v1.2)* | PRD §5.13/SRS §3.15 (NAV-1–NAV-5) |
| §4.10 Channel Partner Manager Endpoints *(added v1.3)* | Domain Model §2.9, Database Schema §4.6, Security Architecture §2.6, iOS Application doc §2.1a (no PRD/SRS requirement ID yet — Domain Model §6.6) |
| §4.11 Portfolio Map Data *(added v1.4)* | PRD §5.14/SRS §3.16 (GEO-1.1–GEO-6.1), UX Wireframes §2.16, Database Schema §4.7 |
| §4.12 3D Facility Asset Delivery *(added v1.4, deliberately undesigned)* | PRD §5.15/SRS §3.17 (3DR-1.1–3DR-3.1), Domain Model §6.7, Database Schema §4.7 |

---

## 7. Open Questions

1. **AUTH-1 vs. §5's proposed token-based access**: needs an explicit SRS amendment before §5 is authoritative — not this document's call to make silently. **Narrowed in scope, v1.1** — no longer applies to portal-onboarded channel partners (§5), only to the original, larger no-login population (attribution-only partners, Field Service Partner ticket view).
2. ~~**RP-2.1 (Route View) has no backing data model.**~~ **Partially resolved, v1.1 — precisely, not a full close.** Domain Model §2.7's `RouteAssignment`/`RouteStop` entities and this document's `GET /v1/partner/routes` (§4.5) close this gap **for the channel-partner-technician case specifically** (the pool-servicing vertical, a `channel_partner_users` technician). RP-2.1's original, broader wording — "a Service Partner's assigned sites," not scoped to channel partners at all — still has no backing data model for a tenant's own in-house or directly-associated field technician who isn't going through a channel-partner relationship. That broader case remains exactly as open as it was in v1.
3. **MCP transport** (stdio vs. HTTP/SSE) is unsettled, per SRS §4.4's own deferral. **Now also applies to §4.6's territory/technician tools**, not just the original three.
4. **§2.1's casing decision and §2.2's pagination decision both require reconciling existing code** — `tickets.ts`/`devices.ts`'s request-body interfaces, several routes' camelCase query param names, adding `LIMIT`/`OFFSET` to `sites.list`/`assets.list`/`devices.list`, and `backend/shared/types.ts`, which is already stale against the current schema (`Site.type` still lists the old 4-value enum, not the 9 values `docs/data-model.sql` has had since the verticals broadened; `Tenant` is missing `channel_partner_id` entirely). Not done in this draft.
5. **§4.1's Portfolio Roll-Up has no distinct "Ops Leader" role.** Both Tenant Admin and Corporate/Regional Ops Leader currently map to the same `admin` Cognito group (AUTH-2) — fine for now since neither this document nor Information Architecture requires them to see different data, only different nav chrome, but worth confirming that stays true as more role-gated endpoints appear.
6. **§4.5's `POST /v1/partner/users` is not atomic across Cognito and the database, added v1.1.** If `AdminCreateUserCommand` succeeds but the subsequent `channel_partner_users` INSERT fails (or vice versa in a future retry), the two systems can drift — a real Cognito account with no matching DB row, or (less likely, since the DB insert happens second) a DB row with a `cognito_sub` that doesn't resolve. No compensating transaction/cleanup logic exists yet. Flagged, not fixed — proportionate to note, not to solve, at current design-partner-tenant scale, but a real gap a production-hardening pass should close (e.g., a cleanup Lambda reconciling orphaned Cognito users, or wrapping both calls in a saga).
7. **§4.5's `PUT /v1/partner/territories/{territoryId}` doesn't specify what happens to `route_assignments` already built against the old boundary, added v1.1.** Redrawing a territory could silently strand an already-`suggested` (not yet confirmed) route whose stops no longer match the new shape. Not resolved here — a real UX/product question (warn the partner_admin? invalidate pending suggestions automatically?) more than an API contract one.
8. **§4.7's `POST /v1/admin/tenants/{tenantId}/users` has the same non-atomicity risk as item 6 above, added v1.2** — it also calls `AdminCreateUserCommand` then inserts a DB row, the exact same two-system-drift shape already flagged for the partner portal's user creation. Not re-solved independently here; whichever fix item 6 eventually gets should cover both call sites, not just one.
9. **No frontend exists yet for the admin console, Settings page, or drill-down views, added v1.2** — this document specifies the API contract only; sequenced as real frontend work in the same pass as this amendment (`project-peaklogic-admin-console-and-settings` memory), not left purely theoretical.
10. **§4.10's `POST /v1/partner/managers`/`POST /v1/admin/channel-partners/{partnerId}/managers` share item 6's non-atomicity risk, added v1.3** — same `AdminCreateUserCommand`-then-DB-insert shape, same disclosed limitation, not a new risk category. Whichever fix items 6/8 eventually get should cover this third call site too.
11. **§3's navigational table was found stale for v1.2 and fixed here, added v1.3** — it never gained a block for the Internal Administration/Settings endpoints despite §4.7/§4.8 shipping real specification content; a documentation-lag bug in this document's own summary table, not a code gap. Fixed alongside adding this amendment's own v1.3 block, same self-correction category as Domain Model §4 item 11 and Database Schema §6 item 10.
12. **None of §4.10's endpoints have been implemented, added v1.3** — unlike §4.5/§4.7/§4.8 (which shipped real route handlers verified by typecheck), no `routes/partner-manager.ts`/`partner-managers.ts` exists in `backend/` yet, and no `X-Channel-Partner-Id` branch exists in `handler.ts`. Consistent with Security Architecture §2.6 being design-only too — this whole amendment sequence (Domain Model → Database Schema → Security Architecture → API Specification) was explicitly formalization-before-implementation, per the iOS doc's (#26) own stated requirement, not a shortcut taken here specifically.
13. **None of §4.11's endpoints/response changes have been implemented, added v1.4** — no `lat`/`lng`/`unlocated_count` fields exist in `routes/portfolio.ts` yet, and `routes/partner-portfolio.ts` doesn't exist. Consistent with this whole Azure-pivot amendment sequence being design-first, matching the same discipline every prior amendment in this document has followed.
14. **§4.12's 3D delivery contract is unresolved by design, not an oversight, added v1.4** — flagged so a future reader doesn't mistake the absence of a `/v1/.../3d-model` endpoint for something this pass forgot rather than something it deliberately declined to invent ahead of Domain Model/Database Schema having a concrete entity.

---

## 8. Review Log

**v1 (2026-07-04):** Four issues found and fixed; the two substantive open items from the original draft (§5's AUTH-1 conflict, §7 item 2's RP-2.1 data-model gap) remain deliberately unresolved — decisions to make later, not oversights to fix now.

1. **Introduction citation error**: attributed "payload shapes... deferred to this document" to SRS §4.1, which actually only defers screen specs to UX Wireframes. The real source is Domain Model §5. Corrected to cite both deferrals accurately and separately.
2. **Pagination finding was factually wrong**: claimed `tickets.list` was uncapped; it hardcodes `LIMIT 200`, same as `alerts.list`. Corrected the uncapped set from four endpoints to the real three (`sites.list`, `assets.list`, `devices.list`).
3. **Casing evidence was inaccurate and missed the strongest evidence**: "SiteBody.address" doesn't demonstrate camelCase (single word), and "DeviceBody" isn't a real named type. Missed that `assets.ts`'s `AssetBody` is already snake_case — real precedent for the recommended decision, strengthening rather than weakening the case once cited correctly.
4. **Casing decision didn't cover query parameters**, while this draft's own new §4.2 endpoint used snake_case query params inconsistent with existing camelCase ones. Extended §2.1 to cover both bodies and query strings explicitly.

Also added the nullable-`supplier_name` case to §4.3's example, which the first draft omitted.

**v1.1 (2026-07-11), reviewed 2026-07-11.** One real overclaim caught and narrowed; everything else re-verified directly.

5. **§7 item 2's first draft claimed RP-2.1 was fully resolved by the new `route_assignments` work — checked directly against SRS §3.11's actual wording and found this overstated it.** RP-2.1 says "a Service Partner's assigned sites," not "a channel-partner technician's" — the new entities are `channel_partner_id`-scoped by design (Domain Model §2.7), so they don't cover a tenant's own in-house field technician who isn't going through a channel-partner relationship at all. Corrected from "resolved" to "partially resolved," with the remaining gap stated precisely rather than left implied.
6. **Re-verified, held up:** that `devices.claim()` really was rewritten to use `withTenant()` (checked directly against `backend/api/routes/devices.ts`'s current content, not assumed from memory of the earlier fix); that `PartnerPool`/`getPartnerAuth()`/`withChannelPartner()` exist exactly as Security Architecture §2.4 described them; that `route_assignments`/`route_stops` really do carry no stored per-stop reading data (Domain Model §2.7), confirming §4.5's "live query, not stored" design is consistent with the entity as actually built, not just as originally envisioned.

**v1.1, second review pass, 2026-07-11 — while reviewing MVP Roadmap (§8a there), which cited this document's endpoint count.** Two real, related bugs found and fixed, not just a documentation nit:

7. **§3's "14 new endpoints" was a simple miscount.** Recounting the very table it summarizes (§3): 2 (partner self-read/branding) + 5 (territories) + 5 (users) + 5 (routes) = **17**, not 14. No design content was wrong, only the arithmetic — corrected in §3.
8. **A real, separate infra bug surfaced while verifying the count against the actual deployed contract, not just the doc's own table.** `infra/lib/api-stack.ts`'s `addPartnerCrud()` helper unconditionally added a `DELETE` method to every resource it built, including `routes` — but this table (and `partner-router.ts`'s handler map) never included `DELETE /v1/partner/routes/{routeId}`, consistent with §4.5's own stated design that a confirmed route is immutable ("re-plan by submitting a new one," not delete it). The result: API Gateway had a real, Cognito-authenticated `DELETE /v1/partner/routes/{routeId}` method wired to the Lambda with no corresponding handler — it would always 404, not a security hole, but a genuine infra/application-code mismatch (18 methods deployed, 17 actually functional). Verified via `cdk synth`'s JSON output, not assumed from reading the CDK source alone. Fixed by adding an opt-out flag to `addPartnerCrud()` and using it for `routes`; re-ran `cdk synth` and confirmed exactly 17 non-OPTIONS `/v1/partner/*` methods now exist, matching this table precisely.

**v1.3, reviewed 2026-07-13.** A real inaccuracy caught and fixed mid-draft (not after, the way item 8 above was); §3's staleness gap found by the same kind of direct cross-check that's caught several of this project's own documentation-lag bugs before.

9. **This section's own first draft claimed no revocation precedent existed for `channel_partner_manager_assignments` and left it "flagged as follow-up" — checked against §4.7's actual table before finalizing and found this was wrong: `/v1/admin/assignments` already ships a working `DELETE`.** Corrected before this amendment was ever committed, not left as a shipped inaccuracy to catch later — designed real `DELETE /v1/partner/managers/{id}`/`DELETE /v1/admin/channel-partners/{partnerId}/managers/{id}` endpoints mirroring the existing precedent instead.
10. **§3's navigational table was checked against §4.7/§4.8's actual shipped content, not assumed complete, and found stale** — it never gained a v1.2 block despite those sections specifying 20 real endpoints. Fixed alongside adding this amendment's own v1.3 block (§7 item 11).
11. **Verified the header-vs-path-segment design decision (§4.10) against `partnerRoute()`'s actual dispatch mechanism, not asserted from convenience.** Confirmed `backend/api/partner-router.ts` (as described in §4.5's Revision History) dispatches purely on `event.httpMethod`/`event.resource`, with no dependency on which pool authenticated the caller — meaning a header-based target-account selection genuinely requires zero changes to the dispatcher itself, only to `handler.ts`'s auth-resolution step. This was checked against the documented shape of the existing code, not assumed to work by analogy alone.

---

## Revision History

**v1.1 (2026-07-11)** — forced by the PRD v1.5/SRS v1.5/Domain Model v1.1/Database Schema v1.1/Security Architecture v1.1/Multi-Tenant Architecture v1.1 amendment (channel-partner portal), the last artifact in that amendment's sequenced roadmap (`project-peaklogic-channel-partner-portal` memory) before implementation.

- **§4.5 added**: 17 new `/v1/partner/*` endpoints *(corrected from an initial miscount of 14 — see §8 Review Log's second pass)* — self-read/branding, territory CRUD (GeoJSON boundary format), channel-partner-user provisioning (real `AdminCreateUserCommand` Cognito calls, not just DB rows), and route management. `GET /v1/partner/routes` deliberately does no role-branching in application code — Database Schema §4.4's RLS already produces the right result for either role. `POST /v1/partner/routes` explicitly does not orchestrate the AI dispatch call — TR-3.2's "no in-house routing algorithm" boundary stays exactly where Domain Model/PRD already drew it. Routes are also deliberately not deletable via the API — a stray `DELETE` method that had been wired in infra despite this was found and removed in the same review pass.
- **§4.6 added**: MCP tool contract extended for territory/technician/site-status tools (SRS §3.7, already committed to this).
- **§5 narrowed, not fully resolved**: the opaque-token no-login proposal no longer applies to portal-onboarded channel partners (they have real login now), but still applies, unchanged, to every other attribution-only partner and to the Field Service Partner ticket view. Stated precisely as a narrowing, not claimed as a close.
- **§7 item 2 (RP-2.1) corrected during review, not left overstated**: the new route entities close this gap for the channel-partner-technician case only, not RP-2.1's original, broader "any Service Partner" wording.
- **Two new open items added** (§7 items 6–7): `POST /v1/partner/users`'s Cognito/DB non-atomicity, and territory redraws potentially stranding pending route suggestions — both real, both disclosed, neither fixed in this pass.
- **A stale claim corrected**: §2.3 previously described `devices.claim()`'s unscoped-pool pattern as an "intentional exception" — Multi-Tenant Architecture §2.5.3 found this was actually a bug, not a design choice, and the code has since changed. Updated to match reality instead of quietly going stale.
- **Real infrastructure and code shipped alongside this document**, not left as design-only: a second Cognito authorizer wired to `PartnerPool` in `infra/lib/api-stack.ts`; a new `backend/api/partner-router.ts` mirroring `router.ts`'s shape; four new route handler files (`routes/partner.ts`, `routes/partner-territories.ts`, `routes/partner-users.ts`, `routes/partner-routes.ts`); `backend/api/handler.ts` branching on path to select `getAuth()`/`getPartnerAuth()`.

**v1.2 (2026-07-12)** — forced by the PRD v1.6/SRS v1.6/Domain Model v1.2/Database Schema v1.2/Security Architecture v1.2/Multi-Tenant Architecture v1.2 amendment (Internal Administration Console, Settings & Preferences, Site→Asset→Device Drill-Down).

- **§4.7 added**: a third parallel resource tree, `/v1/admin/*`, authenticated by `StaffPool`. The "acting on a tenant" endpoints deliberately call `withStaffActingOnTenant()` and reuse the *exact same* query logic the tenant-side routes already run, rather than reimplementing "how to create a user"/"how to claim a device" a second time — a direct consequence of Database Schema §4.5's handoff design, not a new decision made here.
- **§4.8 added**: `/v1/settings` on the existing tenant-pool auth path — no new identity surface, since these are ordinary per-user preferences. Password/MFA endpoints proxy Cognito's own APIs rather than building parallel credential handling. SET-8 (notification preferences) deliberately has no endpoint, matching its `Could`, not-yet-verified status in PRD/SRS.
- **§4.9 added**: **checked directly, not assumed** — most of the drill-down (Site→Assets, Device→Telemetry) needs zero new endpoints, since `GET /v1/assets?siteId=` and `GET /v1/telemetry?deviceId=` already exist and already do this. The one real gap, verified against the live handler code: `GET /v1/devices` ignores every query parameter today. Fixed by adding `assetId`/`siteId` filters to the existing endpoint, not a new one.
- **Real infrastructure and code sequenced immediately after this document, in the same pass**: a third Cognito authorizer for `StaffPool`, `backend/api/admin-router.ts`, new route handler files, `backend/api/handler.ts` branching extended to a third path prefix. Not yet complete as this section is written — this entry will be corrected with real `cdk synth`/typecheck/test results once that pass finishes, matching v1.1's own standard of not claiming verification ahead of when it actually happened.
- **Two new open items added** (§7 items 8–9): `POST /v1/admin/tenants/{tenantId}/users`'s Cognito/DB non-atomicity (the same shape as the existing, still-open item 6); no frontend exists yet for any of §4.7/§4.8/§4.9's new endpoints.

**v1.3 (2026-07-13)** — forced by the Security Architecture v1.3 amendment (§2.6 Channel Partner Manager Authentication), the fourth and final step of the iOS Application doc's (#26) required amendment sequence (Domain Model → Database Schema → Security Architecture → API Specification).

- **§4.10 added**: a manager acting on one specific account reuses the existing `/v1/partner/*` routes and `partnerRoute()` dispatcher unchanged, distinguished only by an `X-Channel-Partner-Id` request header and `getManagerAuth()`/`withManagerActingOnChannelPartner()` in `handler.ts`'s auth-resolution step — zero new route handlers for territories, branding, users, or routes. Two genuinely new endpoints: `GET /v1/partner-manager/overview` (the locked cross-account landing screen, merging per-account results via the same single-account handoff rather than a new cross-account query) and the email-based invite-or-link flow, split across `POST /v1/partner/managers` (`partner_admin`-initiated, own account only) and `POST /v1/admin/channel-partners/{partnerId}/managers` (`superadmin`-initiated) — mirroring the dual-grantor design Database Schema §4.6 already locked.
- **Revocation designed against real precedent, not left open**: `DELETE /v1/partner/managers/{id}` / `DELETE /v1/admin/channel-partners/{partnerId}/managers/{id}`, directly mirroring `/v1/admin/assignments`'s already-shipped `DELETE` for `account_assignments` — a real inaccuracy in this section's own first draft (claiming no such precedent existed) was caught and corrected before this amendment was finalized (§8 item 9).
- **Two real, disclosed documentation-lag bugs found and fixed while amending, not new gaps**: §3's navigational table never gained a v1.2 block despite §4.7/§4.8 shipping 20 real endpoints (§7 item 11); this section's own header-vs-path-segment design choice was verified against `partnerRoute()`'s actual documented dispatch mechanism rather than assumed to work (§8 item 11).
- **One new open item added** (§7 item 10): the invite endpoints share the existing Cognito/DB non-atomicity risk (items 6/8) — same shape, not a new risk category.
- **Honestly scoped as design-only, matching Security Architecture §2.6's own disclosure**: no code exists yet for any of §4.10 — `handler.ts`'s `X-Channel-Partner-Id` branch, `routes/partner-manager.ts`, `routes/partner-managers.ts` are all follow-up implementation work, not shipped in this pass. **This completes the formalization half of the iOS Application doc's (#26) required amendment sequence** — Domain Model v1.3 → Database Schema v1.3 → Security Architecture v1.3 → API Specification v1.3, all four now drafted and internally consistent with each other (cross-checked section references, matching table/column/endpoint names throughout). Real implementation (Cognito group, `backend/` code, frontend) and formal Draft→Approved review remain, tracked in `project-peaklogic-client-apps`/`project-peaklogic-next-steps` memory, not done here.

**v1.4 (2026-07-17)** — the first amendment specific to the `PeakLogic-Azure` fork, forced by the PRD/SRS v1.7, Database Schema v1.4, and UX Wireframes v1.4 amendments (geospatial site map, 3D facility rendering).

- **§4.11 added**: `GET /v1/portfolio` (§4.1) extended additively with nullable `lat`/`lng` per site and a server-computed `unlocated_count` — no new tenant-side endpoint, matching UX Wireframes §2.16's view-toggle-not-new-screen design. One genuinely new endpoint, `GET /v1/partner/portfolio`, since no flat "every attributed site" endpoint existed on the partner side to extend — designed to require zero new RLS by reusing Database Schema §4.4's existing `channel_partner_read` policies, the same "additive, not a new pattern" discipline every prior partner-side addition in this document has followed.
- **§4.12 added, deliberately left undesigned**: no 3D-facility-asset-delivery endpoint is specified — Domain Model §6.7 and Database Schema §4.7 both declined to model a concrete entity, so an endpoint contract would have nothing real to describe yet. Flagged as a real "come back here" marker for the future scoping pass, not a silent gap.
- **§3 endpoint table extended** with the one new endpoint and the one extended response shape.
- **§7 gained 2 new items (13–14)**: neither §4.11 nor §4.12 has any implementation yet, consistent with this whole amendment sequence being design-first; §4.12's absence is flagged explicitly as deliberate.
- **This is the last product/implementation-facing artifact in the Azure-pivot amendment sequence before the infrastructure rewrites** (`azure-restructuring-plan.md` §2 items 12–17) — Device & Command Security Architecture, Security Architecture, Multi-Tenant Architecture, Deployment Architecture, Infrastructure as Code, and CI/CD Pipeline.
