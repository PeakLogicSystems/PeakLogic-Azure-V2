# API Specification

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.4), [SRS](srs.md) (approved v1.4), [Domain Model](domain-model.md) (approved v1), [Database Schema](database-schema.md) (approved v1), [User Personas](user-personas.md) (approved v1.1), [User Stories](user-stories.md) (approved v1), [UX Wireframes](ux-wireframes.md) (approved v1.2), [Information Architecture](information-architecture.md) (approved v1)
**Last updated:** 2026-07-04

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
- Every route (except the two exceptions in §5) authenticates via the Cognito authorizer at the API Gateway layer; `getAuth()` extracts `tenantId`/`role` from JWT claims; every DB-touching handler wraps its query in `withTenant()` (MT-1.1). `devices.claim` is the one existing, intentional exception — it uses the unscoped pool because a device has no `tenant_id` yet at the moment of claiming.

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

---

## 6. Traceability

| Section | Traces to |
|---|---|
| §4.1 Portfolio Roll-Up | RP-1.1, UX Wireframes §2.1 |
| §4.2 Sites Directory | RP-4.1, UX Wireframes §2.9 |
| §4.3 Tenant Self-Read | CH-1.2, UX Wireframes §2.8, Information Architecture §4 |
| §4.4 MCP Tool Contract | MCP-1.1, MCP-2.1, SRS §4.4 |
| §5 Unauthenticated Access | UX Wireframes §2.6/§2.10, User Personas §2.5/§2.6, CH-2.1 — in tension with AUTH-1 as currently written |

---

## 7. Open Questions

1. **AUTH-1 vs. §5's proposed token-based access**: needs an explicit SRS amendment before §5 is authoritative — not this document's call to make silently.
2. **RP-2.1 (Route View) has no backing data model.** "A Service Partner's assigned sites for the current day" implies some technician-to-site-for-a-day assignment concept — no such entity exists in the Domain Model or `docs/data-model.sql`. This draft deliberately does **not** invent a `GET /v1/route` endpoint or a RouteAssignment table to paper over that — it needs to go back through Domain Model / Database Schema first, the same direction every other cross-artifact gap in this project has been resolved.
3. **MCP transport** (stdio vs. HTTP/SSE) is unsettled, per SRS §4.4's own deferral.
4. **§2.1's casing decision and §2.2's pagination decision both require reconciling existing code** — `tickets.ts`/`devices.ts`'s request-body interfaces, several routes' camelCase query param names, adding `LIMIT`/`OFFSET` to `sites.list`/`assets.list`/`devices.list`, and `backend/shared/types.ts`, which is already stale against the current schema (`Site.type` still lists the old 4-value enum, not the 9 values `docs/data-model.sql` has had since the verticals broadened; `Tenant` is missing `channel_partner_id` entirely). Not done in this draft.
5. **§4.1's Portfolio Roll-Up has no distinct "Ops Leader" role.** Both Tenant Admin and Corporate/Regional Ops Leader currently map to the same `admin` Cognito group (AUTH-2) — fine for now since neither this document nor Information Architecture requires them to see different data, only different nav chrome, but worth confirming that stays true as more role-gated endpoints appear.

---

## 8. Review Log

Reviewed 2026-07-04. Four issues found and fixed; the two substantive open items from the original draft (§5's AUTH-1 conflict, §7 item 2's RP-2.1 data-model gap) remain deliberately unresolved — decisions to make later, not oversights to fix now.

1. **Introduction citation error**: attributed "payload shapes... deferred to this document" to SRS §4.1, which actually only defers screen specs to UX Wireframes. The real source is Domain Model §5. Corrected to cite both deferrals accurately and separately.
2. **Pagination finding was factually wrong**: claimed `tickets.list` was uncapped; it hardcodes `LIMIT 200`, same as `alerts.list`. Corrected the uncapped set from four endpoints to the real three (`sites.list`, `assets.list`, `devices.list`).
3. **Casing evidence was inaccurate and missed the strongest evidence**: "SiteBody.address" doesn't demonstrate camelCase (single word), and "DeviceBody" isn't a real named type. Missed that `assets.ts`'s `AssetBody` is already snake_case — real precedent for the recommended decision, strengthening rather than weakening the case once cited correctly.
4. **Casing decision didn't cover query parameters**, while this draft's own new §4.2 endpoint used snake_case query params inconsistent with existing camelCase ones. Extended §2.1 to cover both bodies and query strings explicitly.

Also added the nullable-`supplier_name` case to §4.3's example, which the first draft omitted.
