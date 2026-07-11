# API Specification

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1.1 (amended — see Revision History, end of document)
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.5), [SRS](srs.md) (approved v1.5), [Domain Model](domain-model.md) (approved v1.1), [Database Schema](database-schema.md) (approved v1.1), [Security Architecture](security-architecture.md) (approved v1.1), [Multi-Tenant Architecture](multi-tenant-architecture.md) (approved v1.1), [User Personas](user-personas.md) (approved v1.1), [User Stories](user-stories.md) (approved v1), [UX Wireframes](ux-wireframes.md) (approved v1.2), [Information Architecture](information-architecture.md) (approved v1)
**Last updated:** 2026-07-11

---

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

14 new endpoints. See §4.5.

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

---

## 7. Open Questions

1. **AUTH-1 vs. §5's proposed token-based access**: needs an explicit SRS amendment before §5 is authoritative — not this document's call to make silently. **Narrowed in scope, v1.1** — no longer applies to portal-onboarded channel partners (§5), only to the original, larger no-login population (attribution-only partners, Field Service Partner ticket view).
2. ~~**RP-2.1 (Route View) has no backing data model.**~~ **Partially resolved, v1.1 — precisely, not a full close.** Domain Model §2.7's `RouteAssignment`/`RouteStop` entities and this document's `GET /v1/partner/routes` (§4.5) close this gap **for the channel-partner-technician case specifically** (the pool-servicing vertical, a `channel_partner_users` technician). RP-2.1's original, broader wording — "a Service Partner's assigned sites," not scoped to channel partners at all — still has no backing data model for a tenant's own in-house or directly-associated field technician who isn't going through a channel-partner relationship. That broader case remains exactly as open as it was in v1.
3. **MCP transport** (stdio vs. HTTP/SSE) is unsettled, per SRS §4.4's own deferral. **Now also applies to §4.6's territory/technician tools**, not just the original three.
4. **§2.1's casing decision and §2.2's pagination decision both require reconciling existing code** — `tickets.ts`/`devices.ts`'s request-body interfaces, several routes' camelCase query param names, adding `LIMIT`/`OFFSET` to `sites.list`/`assets.list`/`devices.list`, and `backend/shared/types.ts`, which is already stale against the current schema (`Site.type` still lists the old 4-value enum, not the 9 values `docs/data-model.sql` has had since the verticals broadened; `Tenant` is missing `channel_partner_id` entirely). Not done in this draft.
5. **§4.1's Portfolio Roll-Up has no distinct "Ops Leader" role.** Both Tenant Admin and Corporate/Regional Ops Leader currently map to the same `admin` Cognito group (AUTH-2) — fine for now since neither this document nor Information Architecture requires them to see different data, only different nav chrome, but worth confirming that stays true as more role-gated endpoints appear.
6. **§4.5's `POST /v1/partner/users` is not atomic across Cognito and the database, added v1.1.** If `AdminCreateUserCommand` succeeds but the subsequent `channel_partner_users` INSERT fails (or vice versa in a future retry), the two systems can drift — a real Cognito account with no matching DB row, or (less likely, since the DB insert happens second) a DB row with a `cognito_sub` that doesn't resolve. No compensating transaction/cleanup logic exists yet. Flagged, not fixed — proportionate to note, not to solve, at current design-partner-tenant scale, but a real gap a production-hardening pass should close (e.g., a cleanup Lambda reconciling orphaned Cognito users, or wrapping both calls in a saga).
7. **§4.5's `PUT /v1/partner/territories/{territoryId}` doesn't specify what happens to `route_assignments` already built against the old boundary, added v1.1.** Redrawing a territory could silently strand an already-`suggested` (not yet confirmed) route whose stops no longer match the new shape. Not resolved here — a real UX/product question (warn the partner_admin? invalidate pending suggestions automatically?) more than an API contract one.

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

---

## Revision History

**v1.1 (2026-07-11)** — forced by the PRD v1.5/SRS v1.5/Domain Model v1.1/Database Schema v1.1/Security Architecture v1.1/Multi-Tenant Architecture v1.1 amendment (channel-partner portal), the last artifact in that amendment's sequenced roadmap (`project-peaklogic-channel-partner-portal` memory) before implementation.

- **§4.5 added**: 14 new `/v1/partner/*` endpoints — self-read/branding, territory CRUD (GeoJSON boundary format), channel-partner-user provisioning (real `AdminCreateUserCommand` Cognito calls, not just DB rows), and route management. `GET /v1/partner/routes` deliberately does no role-branching in application code — Database Schema §4.4's RLS already produces the right result for either role. `POST /v1/partner/routes` explicitly does not orchestrate the AI dispatch call — TR-3.2's "no in-house routing algorithm" boundary stays exactly where Domain Model/PRD already drew it.
- **§4.6 added**: MCP tool contract extended for territory/technician/site-status tools (SRS §3.7, already committed to this).
- **§5 narrowed, not fully resolved**: the opaque-token no-login proposal no longer applies to portal-onboarded channel partners (they have real login now), but still applies, unchanged, to every other attribution-only partner and to the Field Service Partner ticket view. Stated precisely as a narrowing, not claimed as a close.
- **§7 item 2 (RP-2.1) corrected during review, not left overstated**: the new route entities close this gap for the channel-partner-technician case only, not RP-2.1's original, broader "any Service Partner" wording.
- **Two new open items added** (§7 items 6–7): `POST /v1/partner/users`'s Cognito/DB non-atomicity, and territory redraws potentially stranding pending route suggestions — both real, both disclosed, neither fixed in this pass.
- **A stale claim corrected**: §2.3 previously described `devices.claim()`'s unscoped-pool pattern as an "intentional exception" — Multi-Tenant Architecture §2.5.3 found this was actually a bug, not a design choice, and the code has since changed. Updated to match reality instead of quietly going stale.
- **Real infrastructure and code shipped alongside this document**, not left as design-only: a second Cognito authorizer wired to `PartnerPool` in `infra/lib/api-stack.ts`; a new `backend/api/partner-router.ts` mirroring `router.ts`'s shape; four new route handler files (`routes/partner.ts`, `routes/partner-territories.ts`, `routes/partner-users.ts`, `routes/partner-routes.ts`); `backend/api/handler.ts` branching on path to select `getAuth()`/`getPartnerAuth()`.
