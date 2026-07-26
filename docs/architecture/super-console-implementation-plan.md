# Platform Control Center — Frontend Implementation Plan (Sketch)

> **Naming (2026-07-26):** this is the UI plan for the **Platform Control Center** (`platform-control-center-architecture.md`) — the concept formerly called the "Super Admin Console" / "super-console". The **file name** (`super-console-implementation-plan.md`) and the prototype filenames are a deferred mechanical rename; the prose here uses the current name.

**Status:** 🟡 Draft v0.1 (2026-07-18) — implementation sketch, not a committed schedule
**Delivers:** Roadmap items 8–9 ([Azure Review Roadmap §5](azure-review-and-improvement-roadmap.md)) — the internal management platform ([Target Reference Architecture §5](target-reference-architecture.md)), resolving [TD-42](technical-debt-register.md) (admin console has backend but no frontend).
**Design target (UX/IA):** [`prototypes/super-console-demo.html`](prototypes/super-console-demo.html) — the operable mockup this plan turns into real, wired software.

---

## 0. Framing

The internal admin **backend** shipped on `dev` (v1.2 — 20 endpoints, `withStaffActingOnTenant`/`withStaffSession` built and typechecked). What's missing is the **frontend** and a handful of **read/aggregation endpoints** the frontend needs. This plan sequences that work so that at every phase the isolation guarantees from the reference architecture hold *by construction*, not by discipline.

The one non-negotiable that shapes every decision below: **the console never issues a cross-tenant query.** Global views are fan-outs of individually-scoped reads (§5). Everything else follows from protecting that.

---

## 1. Foundation that already exists

**Backend admin API (real, on `dev`)** — grounded in `backend/api/admin-router.ts`:

| Endpoint | Wrapper | Purpose |
|---|---|---|
| `GET /v1/admin` | `withStaffSession` | Who am I (role, book of business) |
| `GET /v1/admin/tenants` · `POST` · `GET /{id}` | `withStaffSession` | Tenant registry list/create/detail |
| `GET /v1/admin/channel-partners` · `POST` · `GET /{id}` | `withStaffSession` | Partner registry list/create/detail |
| `GET /v1/admin/staff-users` · `POST` | `withStaffSession` | Staff directory |
| `GET/POST /v1/admin/assignments` · `DELETE /{id}` | `withStaffSession` | Books of business |
| `POST /v1/admin/tenants/{id}/users` | `withStaffActingOnTenant` | Act-as **write**: create tenant user |
| `PUT /v1/admin/tenants/{id}/devices/{deviceId}` | `withStaffActingOnTenant` | Act-as **write**: update device |
| `PUT /v1/admin/tenants/{id}/assets/{assetId}` | `withStaffActingOnTenant` | Act-as **write**: update asset |
| `PUT /v1/admin/tenants/{id}/alerts/{alertId}` | `withStaffActingOnTenant` | Act-as **write**: update alert |

**The two wrappers are the load-bearing primitives, already built:**
- `withStaffSession(auth, fn)` — staff context over the platform-registry tables (tenants/partners/staff/assignments). Not tenant-operational data.
- `withStaffActingOnTenant(auth, tenantId, fn)` — verifies the staff assignment, sets the RLS scope var to that one tenant, audits to the staff `oid`. **This is the act-as handoff.** Every drill-down read we add rides on it.

**Frontend stack (reusable):** the tenant app is React + Vite + Tailwind with the PeakLogic brand tokens (`tailwind.config.ts`) and a `VITE_PREVIEW` mock mode. Same toolchain, same brand system — the console is a *sibling* app, not a rewrite.

**UX/IA spec:** the prototype is a complete, clickable information architecture. Treat it as the wireframe of record — nav structure, act-as banner, drawer, ZTP flow, severity encoding are all decided there.

---

## 2. Guiding constraints (the non-negotiables)

1. **Isolation by fan-out.** No console screen calls an endpoint that reads across tenants. "Global" endpoints are implemented as a server-side loop over the staff member's assigned orgs, each opened via a scoped wrapper. Enforced by a lint/architecture test (§8), not just review.
2. **Act-as, not impersonation.** The console holds *one* credential — the staff member's own workforce token. It never receives or mints a token scoped to a customer. "Manage &lt;Org&gt;" is client context + per-request server verification, stateless.
3. **Shared rendering, not shared sessions.** The Site→Asset→Device/Alerts/Tickets views are extracted into a shared UI package consumed by console + tenant + partner apps. Same pixels, three data sources.
4. **Identity on `oid`.** All staff identity keys on the stable Entra `oid` (the C1 fix), so one human is one identity across console, mobile, hub.
5. **Secretless.** The Functions backend keeps its Managed-Identity + Key Vault posture; the SPA holds no secrets (public client / PKCE).

---

## 3. App topology & tech choices

```
apps/
  frontend/                 (exists) tenant portal        → PeakLogicCustomers auth
  channel-partner-portal/   (exists) partner white-label  → PeakLogicPartners auth
  super-console/            (NEW)    staff console         → Corporate workforce auth
packages/
  ui/                       (NEW)    shared presentational components (Site→Asset→Device, etc.)
  api-client/               (NEW)    typed admin API client + fan-out helpers
```

- **New app `super-console/`** — its own Vite build, its own Entra app registration (workforce tenant), served at a staff-only hostname (e.g. `console.peaklogicsolutions.com`), gated by Conditional Access at Entra.
- **Auth: MSAL** (`@azure/msal-browser` + `@azure/msal-react`), authorization-code + PKCE, public client. Acquires an access token for the **admin API audience**. App roles (`superadmin`, `account_manager`, `support_engineer`) read from the token; PIM elevation is an Entra concern — the app only sees whether the elevated role claim is present.
- **Shared packages** turn this from "three apps" into "one product." Introducing a workspace (npm/pnpm workspaces) is a prerequisite of Phase 0.

---

## 4. The shared UI package (roadmap item 9) — build it first

The package is **presentational and data-source-agnostic**: components take already-fetched, already-scoped data as props and render it. They never fetch, never know about auth, never know whether the caller is a customer or a staff member acting-as.

In `packages/ui`:
- `SiteList`, `AssetList`, `DeviceTable`, `DeviceTwinDrawer`, `AlertList`, `TicketList`, `UserList`
- Primitives the prototype already defines: `SeverityPill`, `StatePill`, `RollupBar`, `Sparkline`, `Pill`, brand tokens
- Layout shells: `ConsoleShell` (dark rail + content plane), `ActAsBanner`

Why first: it's a hard prerequisite for "the console renders the same views the tenant sees" *and* it lets the existing tenant/partner apps adopt the same components incrementally, retiring their divergent copies. Extract from the prototype's markup — the visual decisions are done.

---

## 5. Data layer & the fan-out pattern

Two kinds of console screen, two data strategies:

**(a) Single-org screens** (a tenant/partner drill-down) → one scoped call.
`GET /v1/admin/tenants/{id}/sites` etc., each backed by `withStaffActingOnTenant`. Straightforward.

**(b) Cross-org screens** (Fleet Overview, global device inventory, "needs attention") → **server-side fan-out aggregation endpoint.**
A new endpoint (e.g. `GET /v1/admin/fleet/overview`) whose handler:
```
const orgs = assignedOrgs(auth);              // this staff member's book only
const perOrg = await Promise.all(orgs.map(o =>
  withStaffActingOnTenant(auth, o.id, client => summarize(client))));  // N scoped reads
return merge(perOrg);                          // merge in app code
```
The browser makes **one** request; the fan-out happens inside the Function — still N individually-scoped queries, **never a cross-tenant `SELECT`**. This mirrors the already-designed channel-partner-manager overview (`GET /v1/partner-manager/overview`, API Spec §4.10) and keeps the isolation logic in one audited place rather than scattered across the client.

> **Why server-side over client-side fan-out:** performance (one round trip, parallelized server-side close to the DB), one place to audit and rate-limit, and the browser never holds a list of every org's data assembled ad hoc. Client-side fan-out stays acceptable for tiny cases but the dashboard uses the aggregation endpoint.

`packages/api-client` exposes typed methods (`listTenants()`, `getFleetOverview()`, `actAs(tenantId).listDevices()`) so screens never hand-build URLs or forget the scope.

---

## 6. Auth & the act-as session model

- **Sign-in:** MSAL against the corporate workforce tenant. Conditional Access (compliant device + MFA) enforced at Entra — the app doesn't implement it, it benefits from it.
- **Authorization:** app-role claims drive nav (`superadmin` sees all orgs and Staff & Access; `account_manager` sees only their book; `support_engineer` read-only). PIM handles just-in-time `superadmin` elevation upstream.
- **Act-as is stateless client context.** Clicking "Manage &lt;Org&gt;" sets an active-org in client state; subsequent calls hit `/v1/admin/tenants/{id}/...`. The backend re-verifies the assignment **on every request** via `withStaffActingOnTenant` and audits it. There is no server-side impersonation session, no minted customer token, nothing to steal or revoke — exit is just clearing client state.
- **Audit is automatic.** Because every act-as read/write goes through the wrapper, entering a context, every action within it, and every command are attributed to the staff `oid` in `audit_log_entries` with no extra frontend work. The Audit Log screen is just a read of that table (new endpoint, §7).

---

## 7. Backend gaps to fill (grounded)

| Need | Status today | Work |
|---|---|---|
| Tenant registry list/detail, partner registry, staff, assignments | ✅ Exists | — |
| Tenant act-as **writes** (user/device/asset/alert) | ✅ Exists | — |
| Tenant act-as **reads**: `GET /v1/admin/tenants/{id}/sites\|assets\|devices\|alerts\|tickets\|users` | ❌ Missing | New handlers, each via `withStaffActingOnTenant` (reuse tenant-portal query logic, staff-scoped) |
| Fleet Overview aggregation `GET /v1/admin/fleet/overview` | ❌ Missing | New fan-out endpoint (§5) |
| Global device inventory `GET /v1/admin/fleet/devices` | ❌ Missing | New fan-out endpoint |
| Audit log read `GET /v1/admin/audit` | ❌ Missing | New handler over `audit_log_entries` (filter by actor/org/action) |
| Partner act-as reads (territories/technicians/routes) | ❌ Missing | Needs a `withStaffActingOnChannelPartner()` wrapper (sibling of the tenant one; note `withManagerActingOnChannelPartner` is design-only v1.3) |
| Device-twin read + Direct Method invoke | ❌ Missing | Device-plane — **gated on a real IoT Hub deploy**; twins/Direct Methods designed (Target Ref §8) not built |
| ZTP registration (intent record) `POST /v1/admin/fleet/devices` | ❌ Missing | Creates `devices` intent row + staged desired-config (Target Ref §9) |

**Read-endpoint note:** the tenant portal's `sites.ts`/`devices.ts`/etc. serve data via `withTenant()` keyed on the *caller's own* JWT — they can't be reused directly for staff acting on another org. The new admin reads reuse the *query logic* but swap the wrapper to `withStaffActingOnTenant`. Factor the shared SQL out so there's one query, two entry points.

---

## 8. Isolation enforcement & testing

- **Architecture test (the hard constraint):** a lint rule / unit test asserting that (a) every handler under `/v1/admin/tenants/{id}/*` and `/v1/admin/channel-partners/{id}/*` uses a scoped wrapper, and (b) no admin handler calls `pool.query` / `pool.connect` directly except the fan-out orchestrator, which itself only calls the scoped wrappers. This is what keeps §2.1 true as the surface grows.
- **Assignment-denial test:** a staff member with no assignment to org X gets `403` from every `.../X/*` route and X never appears in their fan-out result.
- **`oid` cross-client test:** the C1 bug class is invisible to single-client tests — add a real integration test once a workforce tenant exists (Roadmap item 13).
- **Shared-package component tests** (Vitest + Testing Library) so console/tenant/partner render identically.
- **Contract tests** for each new admin endpoint against the API Spec.

---

## 9. Phased delivery

Each phase is independently shippable and leaves the isolation guarantees intact.

**Phase 0 — Foundation.** Workspace + `packages/ui` (extract from prototype) + `packages/api-client` + `super-console/` app scaffold + MSAL workforce auth + `GET /v1/admin` (who-am-I) wired. *Unlocks:* a real staff login landing on an empty shell.

**Phase 1 — Organizations & act-as reads.** Tenants list (exists) + partner list (exists) + tenant act-as drill-down using **new read endpoints** (§7) + the act-as banner + Audit Log screen (new read endpoint). *Unlocks:* the core "manage any assigned tenant as they see it," fully audited — the heart of the product.

**Phase 2 — Fleet Overview & partner act-as.** The fan-out aggregation endpoint + Fleet Overview screen + needs-attention list + partner drill-down (needs `withStaffActingOnChannelPartner`). *Unlocks:* the true single-pane-of-glass.

**Phase 3 — Device plane** *(gated on IoT Hub deploy).* Global device inventory (fan-out) + device-twin drawer (desired/reported reads) + Direct Methods invoke. *Unlocks:* the operable device management + command path.

**Phase 4 — Zero-touch registration.** The intent-record endpoint + the "Register devices" flow (individual + DPS enrollment-group). *Unlocks:* register-in-cloud → connect → config-push, per Target Ref §9.

---

## 10. Dependencies & gates (must clear before the noted phase)

- **Entra workforce app registration + Conditional Access + PIM** — before Phase 0 auth.
- **Custom-claim name verification** (`extension_*`, app-id infix) against a real tenant — before Phase 1 (A7).
- **Key Vault network ACL for the compute subnet (C4)** — before *any* deployed phase; nothing authenticates to the DB without it.
- **A real IoT Hub + DPS deploy** — before Phase 3–4 (device plane).
- **`dev` plaintext DB credential (TD-43)** — revert to Key Vault before any real customer data touches a deployed console.
- **No Azure subscription exists yet** — the standing blocker on everything deployed. Phases 0–2 can be built and tested against mock/`VITE_PREVIEW` + local Postgres; deployment waits on the subscription.

---

## 11. Explicitly out of scope

- **Option B impersonation / launch-in-context tokens** — a separate, threat-modeled artifact; not part of this build (Target Ref §5.2).
- **Rewriting the tenant/partner portals** — they adopt `packages/ui` incrementally; this plan doesn't block on that migration.
- **3D facility rendering / site map** — their own tracked features, unrelated to the console's core management surface.
