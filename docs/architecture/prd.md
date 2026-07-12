# Product Requirements Document (PRD)

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v1.6 (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1.5 until v1.6 is approved)
**Depends on:** [Vision Document](vision-document.md) (approved v1)
**Last updated:** 2026-07-11

---

## 1. Purpose of This Document

The Vision Document says *why* PeakView exists and what principles govern it. This PRD says *what* we are actually building — for which release, in what priority order, with what's explicitly out of scope. Every requirement below should be traceable to a Vision Document pillar, principle, or success criterion; where it isn't, that's a bug in this PRD, not a license to add scope.

**This project differs from a from-scratch PRD in one important way:** PeakLogicSystems already has a working v1.0.0 (infra, backend, frontend) built before the architecture-first governance was adopted. Per `docs/architecture/README.md`, that code is reference, not authoritative — this PRD explicitly calls out, requirement by requirement, where existing implementation is being **reconciled and kept** versus where **new work** is required, rather than treating everything as a blank slate.

This PRD covers two horizons, kept clearly separate:

- **MVP** — the multi-tenant cloud SaaS system that proves the core product thesis: proactive, cross-modality facility risk detection, on an extensible device-adapter architecture, sold through a real device management UX.
- **Enterprise Roadmap (directional only)** — full compliance certification, remote actuation, active electrical load conditioning, a self-service third-party device marketplace. Named here so scope isn't accidentally designed out of reach, but detailed sequencing belongs to the future MVP Roadmap and Enterprise Roadmap documents (#22–23), not this PRD.

This is a first draft — open items are tracked in §10 for review, not pre-resolved.

---

## 2. Goals & Objectives

Translating the Vision's success criteria (§12) into what the MVP specifically needs to prove:

1. Demonstrate that a device (starting with a leak sensor and a refrigeration probe) produces a real-time alert before a loss occurs — the core proactive-detection claim, end to end, on real infrastructure.
2. Demonstrate that a new sensing modality (e.g. water chemistry or gas) can be added through the device-adapter contract without forking core ingest logic — proving the extensibility pillar before a third-party adapter is attempted.
3. Demonstrate that the existing multi-tenant isolation pattern (Postgres RLS) and outbound-only device networking (AWS IoT Core MQTT/TLS) — both already implemented in v1.0.0 — hold up as the platform, not just the pilot, scales.
4. Demonstrate the MCP server exposing PeakView data as a real, usable tool for at least one external AI/agent consumer.
5. Produce a working pilot a design-partner customer in one beachhead vertical can run on a real site, with a device management experience that doesn't require a manual.

---

## 3. Users & Roles (MVP)

Full persona development is its own artifact (#6). For PRD purposes, the roles that drive requirements:

| Role | Who | Primary need |
|---|---|---|
| **Facility Operator** | Day-to-day, non-technical staff at a site (restaurant manager, nursing home facilities lead, pool service tech) | Radically simple device add/view/manage, clear alerts, no manual required |
| **Tenant Admin** | Manages sites, assets, devices, users, tenant settings, webhook/integration config | Full CRUD, tenant-level configuration, oversight across all sites |
| **Service Partner** | Resolves auto-generated service tickets on-site | Ticket queue, asset/alert context, status updates (existing `service_partner` role/`service_tickets` table) |
| **Channel Partner / Reseller** | Sells or provisions devices under a co-branded or white-label arrangement | Attribution for devices/tenants sold through them (all verticals). **For the pool-servicing vertical specifically**, also a scoped operational dispatch portal — branded login, technician territory/route management, AI-assisted daily dispatch suggestions (§5.10) — not full self-service tenant administration or billing *(added v1.5)* |
| **External AI/Agent Consumer** *(system actor via MCP, not a login role)* | A customer's own AI/agent stack, or PeakLogic's own analytics | Query device/alert/telemetry data as a tool through the MCP server |
| **PeakLogic Superadmin** *(added v1.6)* | Internal PeakLogic staff, not a customer or partner | The only role able to create a new Tenant (customer) or Channel Partner — top-level business-entity provisioning (§5.11) |
| **PeakLogic Account Manager** *(added v1.6)* | Internal PeakLogic staff, assigned to a specific subset of tenants/partners (a "book of business") | Sets up user access, onboards devices, configures preliminary alert baselines, and manages alerts on behalf of their assigned accounts — cannot create new tenants or partners (§5.11) |

---

## 4. MVP Scope: In / Out

### In scope for MVP

- Multi-tenant cloud SaaS on the existing stack (AWS IoT Core, Lambda, RDS Postgres + RLS, Cognito, API Gateway, CloudFront/S3) — **reconciled and kept**, not rebuilt
- Existing sensing categories retained: `pump`, `hvac`, `pool_system`, `refrigeration`, `leak_sensor`, `energy_meter`
- New sensing modalities: water chemistry (pool), gas leak detection, air quality — added as new device-adapter categories (see §5.2)
- A formalized **device-adapter contract** (see §5.1) — MVP proves the pattern is config-shaped and documented; full dynamic third-party self-registration is deferred (see Out of Scope)
- An **MCP server** exposing devices, alerts, and telemetry as tools, authenticated through existing tenant-scoped auth
- Baseline real-time analytics (trend/anomaly detection over telemetry beyond static thresholds) — included at MVP per Vision §10's guidance to ship it now rather than defer if it isn't meaningfully harder than the alternative (see AI-3, and the open question in §10)
- Reconciling the existing frontend (currently mock data per `CLAUDE.md`) onto the real API, with device management UX redesigned against the "simpler than Alexa/Smart Home" bar
- Channel-partner attribution (tagging) for all verticals; **for the pool-servicing vertical**, additionally a scoped operational dispatch portal — white-label branded partner login, technician territory management (map-drawn boundaries), AI-assisted daily dispatch suggestions (§5.10) *(added v1.5 — see Out of Scope for what remains excluded)*
- **An internal PeakLogic Administration Console** *(added v1.6)* — a genuinely new, PeakLogic-staff-only identity surface with two roles (Superadmin, Account Manager) for creating and operating tenant/channel-partner accounts (§5.11). This is **not** customer or partner self-service signup — see the narrowed Out of Scope item below.
- **A Settings & Preferences area in the main web application** *(added v1.6)* — a standard, discoverable location for profile, security, display (clock format, timezone, light/dark theme), and (for Tenant Admins) team/user management (§5.12)
- Architecture that does not preclude SOC 2 certification later (not certified at MVP)

### Explicitly out of scope for MVP

- **Actuation of any kind** (leak/gas valve shutoff) — the `commands` MQTT topic already scoped in the device IoT policy stays unused; this is a Device & Command Security Architecture artifact (#12), not this PRD's horizon
- **Active electrical load conditioning/management** — long-term, partnership-first per Vision §11, not a near-term build
- **Dynamic, self-service third-party device marketplace** — MVP adapters are added by PeakLogic engineering through the adapter contract; a true runtime plugin/marketplace model (arbitrary third parties registering adapters without PeakLogic code changes) is post-MVP
- **PeakLogicSystems acting as an MCP client** (consuming external MCP servers) — deferred until a specific integration need justifies it, per Vision §10
- **Formal compliance certification** (SOC 2 Type II, ISO 27001) — architected to not preclude these later, not achieved now
- **Full channel-partner tenant-management portal** — a *partner* managing a tenant's own settings, billing, or users (this is distinct from §5.11's *PeakLogic-internal* Administration Console added v1.6 — a partner still cannot manage a tenant directly at MVP) — and **automated revenue-share/billing calculation**. The pool-servicing vertical's scoped operational dispatch portal (§5.10) is now in scope (v1.5), but full self-service tenant administration and billing automation are not *(narrowed v1.5 — previously excluded the whole portal concept; see Revision History)*
- **Customer or channel-partner self-service signup** *(added v1.6)* — the new Administration Console (§5.11) is PeakLogic-staff-only; it does not open a public "create your own account" path for tenants or partners, and does not relax AUTH-1's no-unauthenticated-access boundary. Tenant/partner provisioning remains a deliberate, staff-initiated action — just through a console instead of manual SQL/AWS CLI now
- **A proprietary/in-house AI route-optimization engine** — the AI-assisted dispatch suggestion (TR-3) consumes the existing MCP server through an external agent; PeakLogic does not build its own routing/optimization algorithm at MVP
- **Native mobile app** — MVP is a responsive web dashboard; a native Android/iOS app is not required to prove the product thesis
- **Predictive/ML-trained analytics models** — baseline trend/anomaly detection is in scope (AI-3); custom-trained predictive maintenance models are not
- **Per-tenant custom branding/theming of the main tenant web app** *(added v1.6)* — the light/dark mode toggle (§5.12, SET-5) is a personal display preference available to every user, not a white-label branding system; that concept is already scoped narrowly to the channel-partner portal's own branding (CH-3, §5.10) and is not being extended to the tenant-side app here

---

## 5. Functional Requirements

### 5.1 Device Adapter Framework (Vision Pillar 2)

| ID | Requirement | Priority |
|---|---|---|
| DA-1 | New device/sensor categories are addable via a defined adapter contract (metric names + units, alert-rule shape, default specs) without modifying core ingest dispatch logic | Must |
| DA-2 | MVP formalizes the existing `RULES_BY_CATEGORY` pattern (`backend/ingest/handler.ts`) into a documented, versioned adapter contract — each category's rules, thresholds, and default specs live in its own adapter definition | Must |
| DA-3 | Adapters are code-deployed for MVP (added by PeakLogic engineering); dynamic, self-service third-party adapter registration is explicitly deferred (see §4) | Must (MVP boundary) |
| DA-4 | Each adapter declares its required/optional telemetry metrics and units, enabling validation at ingest time | Should |
| DA-5 | White-label PeakView 360 devices and third-party/open-source devices are onboarded through the same adapter contract — no privileged code path exists for "official" hardware | Must |

### 5.2 Sensing Modalities (Vision Pillar 3)

| ID | Requirement | Priority |
|---|---|---|
| SN-1 | Electrical: instantaneous power draw (kW) — extends existing `energy_meter`/`pump` categories | Must |
| SN-2 | Water — flow: volumetric flow rate (L/min) — existing `pump`/`pool_system` categories | Must |
| SN-3 | Water — leak: binary leak-detected trigger, immediate critical alert — existing `leak_sensor` category | Must |
| SN-4 | Water — chemistry: pH, free/total chlorine, dissolved solids (TDS), conductivity as new telemetry metrics under a new `pool_chemistry` adapter, with threshold rules reflecting standard pool water-safety ranges | Must |
| SN-5 | Gas: binary gas-leak-detected trigger via a new `gas_sensor` adapter, structurally parallel to `leak_sensor` (SN-3) | Must |
| SN-6 | Temperature: ambient and product-probe temperature — existing `hvac`/`refrigeration`/`pool_system` categories | Must |
| SN-7 | Air quality: at least one representative metric (e.g. CO2 ppm) under a new `air_quality` adapter — MVP proves the pattern extends to air quality; full multi-pollutant coverage is a content-breadth task afterward, not a re-architecture | Should (breadth) / Must (architecture, see DA-1) |

### 5.3 Alerting & Service Tickets

| ID | Requirement | Priority |
|---|---|---|
| AL-1 | Every adapter's threshold rules produce alerts through the existing alert/dedup/ticket pipeline (`alerts`, `service_tickets` tables) — no new alert pathway per modality | Must |
| AL-2 | Critical alerts continue to auto-generate a service ticket and fire the tenant's webhook, unchanged from existing behavior | Must |
| AL-3 | New sensing modalities (chemistry, gas, air quality) reuse the existing severity/status/dedup model — no new alert-lifecycle states | Must |

### 5.4 Device Management UX (Vision Pillar 4)

| ID | Requirement | Priority |
|---|---|---|
| UX-1 | Adding a device is completable by a non-technical operator in a small number of steps — explicitly benchmarked against the Alexa/Smart Home baseline named in Vision §9/§11 as the anti-example | Must |
| UX-2 | Device list/detail views surface health status, last-seen, and active alerts without requiring the user to understand tenant/asset/device data-model distinctions | Must |
| UX-3 | Existing frontend pages (Devices, Assets, Sites) are reconciled from mock data to the real API — currently disconnected per `CLAUDE.md`'s "Frontend Auth Bypass" note | Must |

### 5.5 Multi-Tenancy

| ID | Requirement | Priority |
|---|---|---|
| MT-1 | Tenant isolation enforced at the data layer via Postgres RLS (`withTenant()`) — already implemented in v1.0.0, reconciled not rebuilt | Must |
| MT-2 | Tenant isolation enforced at the auth layer via Cognito — already implemented, reconciled | Must |
| MT-3 | New sensing modalities/adapters inherit tenant isolation automatically via the existing `assets`/`devices` foreign-key model — no modality-specific isolation logic | Must |

### 5.6 Device & Command Networking (Vision Pillar 5 / actuation boundary)

| ID | Requirement | Priority |
|---|---|---|
| CC-1 | Devices connect outbound-only via persistent MQTT/TLS (AWS IoT Core) — already implemented, reconciled | Must |
| CC-2 | New device firmware defaults to port 443 (not 8883), per `CLAUDE.md`'s existing recommendation | Should |
| CC-3 | The per-device `commands` topic (already scoped in the IoT policy, currently unused) remains unused for MVP — no actuation ships | Won't (MVP) |
| CC-4 | Gas and water valve shutoff are explicitly deferred to a post-MVP Device & Command Security Architecture artifact (#12) | Won't (MVP) |

### 5.7 AI & MCP Orchestration (Vision §10)

| ID | Requirement | Priority |
|---|---|---|
| MCP-1 | PeakLogicSystems exposes an MCP server surfacing devices, alerts, and telemetry as callable tools for external AI/agent consumers | Must |
| MCP-2 | MCP server authentication/authorization reuses existing tenant-scoped API auth (Cognito) — no parallel auth system | Must |
| AI-3 | Baseline real-time analytics: **rate-of-change/trend detection** (e.g. flag a refrigeration unit trending toward its limit before it crosses it) plus **simple statistical anomaly detection** (a rolling per-device/metric baseline — e.g. z-score against a trailing window) — both computed over already-stored telemetry, no ML training/model infrastructure required. Sensitivity (how far a deviation must go before it flags) shall be configurable at minimum per adapter/category, not a single hardcoded constant — added per User Personas §6 item 3: alert-fatigue tolerance is the single biggest driver of whether a Site-Level Facility Operator keeps trusting the product | Must |
| AI-4 | PeakLogicSystems acting as an MCP *client* (consuming external MCP servers) is explicitly deferred until a specific integration need justifies it | Won't (MVP) |

### 5.8 Channel & Partner Support

| ID | Requirement | Priority |
|---|---|---|
| CH-1 | A tenant/device can be tagged with a channel-partner/reseller reference for attribution — the pool-chemical/equipment-supplier channel relationship is real and active, not hypothetical, so this is confirmed **Must**, not just a nice-to-have. **Assignment is PeakLogic-internal only** — a tenant may view their current attribution (by the supplier's actual name) but has no self-service way to set or change it, and the generic classification term "channel partner" itself is internal vocabulary, never shown in tenant-facing product copy — added v1.4, correcting Information Architecture's discovery that the approved UX Wireframes let a tenant edit this via a dropdown | Must |
| CH-2 | Basic partner attribution reporting (which tenants/devices came through which partner) — supports a manual/offline revenue-share process; not automated billing | Should |
| CH-3 | A scoped, **operational-only** partner portal — white-label branded login (the partner's own logo/brand colors) and a dispatch-focused view (technician territories, daily route assignments, per-site chemistry/status readings) — for the pool-servicing beachhead vertical. Justified the same way CH-1 was bumped: a real, active channel-partner sales motion (pool-service companies reselling/installing sensors), not speculative demand. Read-only/operational scope only — no tenant settings, billing, or user-management access for the partner *(revised v1.5 — previously blanket-deferred; see Revision History)* | Must |
| CH-3a | Full tenant-management access for partners (managing a tenant's own settings/billing/users), automated revenue-share/billing calculation, and any proprietary AI-routing/optimization engine remain deferred past MVP — the scoped dispatch portal (CH-3) proves the channel relationship's value without taking on full self-service administration or billing automation *(added v1.5)* | Won't (MVP) |

### 5.9 Portfolio & Route Reporting *(added v1.1 — see Revision History)*

Surfaced by the User Personas artifact: both the Small Business Owner-Operator (§2.2) and the Corporate/Regional Facilities Operations Leader (§2.1) need a view across *many* sites, not one device at a time — and a Route-Based Service Technician (§2.4) needs the same idea filtered to just their own day's stops. Neither had a home in the original §5.4 (Device Management UX), which was written at the single-device level. RP-4 was added later, when the Information Architecture artifact surfaced a distinct need: a plain lookup/directory of sites by location, independent of RP-1's risk-status framing.

| ID | Requirement | Priority |
|---|---|---|
| RP-1 | A tenant-scoped, multi-site roll-up view shall exist, showing aggregate risk/health status and alert counts across every site a Tenant Admin or Corporate/Regional Ops Leader oversees — not just one site or device at a time. The view shall visually distinguish sites **trending toward risk** (AI-3 anomaly/trend flags) from sites **currently in alarm** (static-threshold alerts) — confirmed during User Stories review, not just a single undifferentiated "attention needed" count | Must |
| RP-2 | A route-prioritized view shall exist for a Service Partner/technician's assigned sites for the current day, sorted so sites trending toward a problem are surfaced ahead of healthy ones. Per-site detail in this view shall include the actual adapter-specific readings (e.g. chemistry, temperature) driving that site's status, not just a health/alert summary — confirmed during User Stories review, since a technician needs to know *what's* wrong before arriving, not just *that* something is | Should |
| RP-3 | Aggregate savings/avoided-loss estimates (e.g. total alerts that likely prevented a larger incident) are a **future** reporting goal, not required at MVP — RP-1/RP-2 cover presence/status roll-ups only; a defensible ROI dollar figure requires real usage data this PRD's horizon doesn't yet have | Won't (MVP) |
| RP-4 | A tenant-scoped directory listing every site a Tenant Admin operates shall exist, sortable/filterable by street address, city, and state — a plain lookup aid, distinct from RP-1's risk/health roll-up (e.g. "which of our sites are in Austin, TX," not "which sites need attention"). Reconciles an existing reference-implementation screen (`frontend/src/pages/Sites.tsx`) that already does this in simplified form (city/state only, no street address) — added v1.3 when Information Architecture found no requirement backing the "Sites" navigation item it needed | Should |

### 5.10 Partner Territory & Dispatch *(added v1.5 — see Revision History)*

Surfaced by a real business conversation about the pool-servicing channel-partner motion (§3, CH-3): a channel partner (e.g. a pool-chemical/equipment supplier or pool-service franchise) needs more than attribution reporting — they need to run their own field-service operation against PeakView's telemetry, using the chemistry/status data CH-3's portal now surfaces to decide where a technician actually needs to go, and to justify billable chemical dispensing with real readings instead of a weekly manual test strip (Vision Document §3's core differentiator).

| ID | Requirement | Priority |
|---|---|---|
| TR-1 | A channel partner can define named service territories — a geographic boundary drawn on a map — that group their attributed tenants' sites for technician assignment purposes | Must |
| TR-2 | A channel partner can assign technicians to a territory; a technician's daily view is the set of sites within their assigned territory(ies) that need attention (open ticket or trending alert per AI-3), reusing RP-2's existing urgency-ranking logic rather than a separate one | Must |
| TR-3 | The system provides an AI-generated suggested daily route ordering per technician, produced by an external AI agent consuming PeakLogic's existing MCP server (MCP-1) — **advisory only**, requiring the partner's confirmation before a technician's day is treated as final. No in-house route-optimization algorithm is built at MVP (see Out of Scope) | Should |

**Error/edge conditions:** a partner has zero territories or zero technicians assigned (TR-2 shall return an empty, valid result, not an error state); a technician has zero stops for the day (same).

### 5.11 Internal Administration Console *(added v1.6 — see Revision History)*

Surfaced by direct, hands-on use of the platform: today, creating a new Tenant or Channel Partner is a manual SQL `INSERT` plus a hand-run AWS CLI/Console step (documented as the real procedure in the System Administrator Guide, §5.1/§5.6) — workable for a handful of design-partner accounts, but not something that scales past that, and not something that should require direct database/AWS access for routine account setup. This is a genuinely new, third identity/access surface — distinct from the tenant pool (§3.5) and the channel-partner pool (§5.10) — for PeakLogic's own staff, not a customer- or partner-facing feature.

| ID | Requirement | Priority |
|---|---|---|
| IA-1 | A PeakLogic-internal identity surface shall exist, separate from the tenant and channel-partner login pools, with exactly two roles: **Superadmin** and **Account Manager** | Must |
| IA-2 | Only a Superadmin can create a new Tenant (customer) record | Must |
| IA-3 | Only a Superadmin can create a new Channel Partner record | Must |
| IA-4 | An Account Manager's access shall be scoped to an explicitly assigned subset of tenants/partners (a "book of business") — not universal access to every account by default | Must |
| IA-5 | Within their assigned accounts, an Account Manager can: create/manage that tenant's own user accounts (the tenant's `admin`/`operator` logins), onboard devices on the tenant's behalf, set preliminary per-asset alert baselines/thresholds, and manage that tenant's alerts | Must |
| IA-6 | A Superadmin has every Account Manager capability (IA-5) across every account, in addition to IA-2/IA-3 — Superadmin is a strict superset, not a parallel, disjoint role | Must |
| IA-7 | Every action taken through the console shall be attributed to the specific staff member who took it and to the account it was taken on, and logged via the existing audit-log mechanism (AUD-1/AUD-2, extended to a third actor type) | Must |
| IA-8 | The console does not accept unauthenticated requests and does not provide any customer- or partner-facing self-registration path — see Out of Scope (§4) | Won't (self-service) |

**Error/edge conditions:** an Account Manager with zero assigned accounts (console shall show an empty, valid state, not an error); an attempt to create a tenant/partner by a non-Superadmin (shall be rejected server-side, not merely hidden in the UI, per AUTH-3's existing principle).

### 5.12 Settings & Preferences *(added v1.6 — see Revision History)*

A standard, discoverable settings area for the main tenant-side web application — every enterprise SaaS product has one, and PeakView currently has none (confirmed: no Settings/Profile/Account page exists anywhere in the current frontend).

| ID | Requirement | Priority |
|---|---|---|
| SET-1 | A Settings area shall be reachable from a consistent, conventional location in the navigation on every page | Must |
| SET-2 | Profile settings: display name, email (read-only, tied to the Cognito identity), and a password-change flow | Must |
| SET-3 | Display preference: a 12-hour/24-hour clock format toggle, applied to every timestamp shown in the application | Must |
| SET-4 | Display preference: a timezone selector; every displayed timestamp (alerts, telemetry, tickets) shall render in the user's selected timezone. This is a distinct concept from a **Site's own** timezone (`sites.timezone`, already existing) — a user viewing data may not be in the same timezone as the site itself, and both pieces of information matter | Must |
| SET-5 | Display preference: a light/dark theme toggle, applied consistently across every page of the application | Must |
| SET-6 | Security: a view of the user's enrolled MFA method with a re-enrollment flow | Should |
| SET-7 | For Tenant Admins: a Team/Users panel to view and manage the tenant's own `admin`/`operator` users, reconciling the AWS-Console-only process documented today (System Administrator Guide §5.2) into the product itself | Should |
| SET-8 | For Tenant Admins: notification preferences (which alert severities trigger an email) — **flagged, not committed**: depends on whether a real outbound email-notification mechanism exists beyond Cognito's own transactional emails and the existing webhook-on-critical-alert path; needs verification before this is scheduled, not assumed already backed | Could |

**Error/edge conditions:** none of SET-1–SET-7 depend on any other tenant data existing (a brand-new user with zero sites/devices still has a fully functional Settings page).

### 5.13 Site → Asset → Device Drill-Down & Device Telemetry Detail *(added v1.6 — see Revision History)*

Surfaced by direct product use: the existing Sites/Assets/Devices pages (§5.4) are three flat, disconnected lists — there's no way to click from a Site into *its* Assets, or from an Asset into *its* Devices, or from a Device into *its own* telemetry. This matters because the Asset/Device relationship is genuinely one-to-many, not one-to-one: a single physical Asset (e.g. a pool pump) is commonly monitored/controlled by **multiple separate Devices** — a flow sensor, an energy monitor, a leak-detection sensor, a power actuator — each reporting its own metrics. **Checked directly against the schema, not assumed: this many-devices-per-asset relationship already works today** (`devices.asset_id` is a plain foreign key with no uniqueness constraint) — the gap is entirely in navigation and API surfacing, not the data model. This applies on both the tenant-side app and the channel-partner portal (§5.10) — a channel partner drilling from one of their attributed customer's sites down to a specific device's live readings (e.g. a Pentair IntelliChlor salt system's temperature, salt level, and flow rate) is the same underlying capability, not a separate feature.

| ID | Requirement | Priority |
|---|---|---|
| NAV-1 | From the Sites list, a user can open a Site Detail view showing every Asset at that site | Must |
| NAV-2 | From a Site Detail view (or the Assets list), a user can open an Asset Detail view showing every Device that monitors or controls that asset — explicitly supporting more than one Device per Asset | Must |
| NAV-3 | From an Asset Detail view (or the Devices list), a user can open a Device Detail view showing that specific device's own current reading(s) and recent telemetry history, per metric it actually reports — not a generic health badge only. (e.g. a chemistry-adapter device shows pH/chlorine/TDS; a flow-sensor device shows flow rate; they are not the same view just because they share an asset) | Must |
| NAV-4 | The same Site → Asset → Device drill-down pattern is available within the channel-partner portal (§5.10) for a partner viewing their attributed tenants' sites, as ad hoc browsing distinct from and in addition to the daily dispatch route view (RP-2, TR-2) | Must |
| NAV-5 | **Real, verified gap, not hypothetical**: `GET /v1/devices` today ignores all query parameters and always returns every device for the tenant — there is no way to ask for just one asset's devices. This endpoint shall accept an `assetId` filter (and a `siteId` filter, for a site-level device view without an intermediate asset click) before NAV-2/NAV-3 can be built without over-fetching the entire device list client-side | Must |

**Error/edge conditions:** a Site with zero Assets, or an Asset with zero Devices (NAV-1/NAV-2 shall render an empty, valid state, not an error — a newly-added site legitimately has nothing yet); a Device with zero telemetry history yet (NAV-3 shall show "no data yet," not an error).

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | A threshold-triggered alert is created within 30 seconds of the underlying telemetry ingest |
| **Availability** | 99.9% platform uptime as the v1 internal engineering target (~8.7 hrs/year); this is not yet a contractual customer-facing SLA — that's a separate legal/sales decision. A higher tier (99.95%+) is expected for a future enterprise offering |
| **Security baseline** | TLS in transit, encryption at rest (RDS, S3), Cognito-enforced API auth, RLS-enforced tenant isolation — all already implemented, reconciled |
| **Data integrity** | Alerts are never hard-deleted (status transitions only, per existing schema) |
| **Usability** | Device add/view/manage usable by a non-technical operator with no manual — restates UX-1 |
| **Extensibility** | New sensing modality addable via the adapter contract without redeploying/forking core ingest — restates DA-1 |
| **Data retention** | Raw telemetry retained at full resolution for 90 days, then downsampled to hourly rollups retained for 2 years (supports AI-3's trailing-window baseline without unbounded raw-data storage cost). Alerts and service tickets retained indefinitely (minimum 7 years) — they are the evidentiary record of what the customer was warned about and when, which matters for both SOC 2 and liability |

---

## 7. Platform Requirements (MVP)

- **Web dashboard** (React SPA, existing stack): primary and only human-facing client at MVP. No native mobile app is required to prove the product thesis.
- **Device firmware**: the actual "platform" surface that matters most for this product is the device side, not a choice of human OS/client — outbound MQTT/TLS per CC-1/CC-2 is the requirement, not a specific OS.
- **Existing infrastructure retained**: AWS IoT Core, Lambda (API + ingest), RDS Postgres, Cognito, API Gateway, CloudFront/S3, all via CDK — reconciled, not re-platformed.

---

## 8. Assumptions & Constraints

- **Beachhead verticals for MVP demo (confirmed): pool servicing and QSR (gas station convenience stores, fast food).** Both are real, active sales opportunities, not hypothetical — both must be easily demoable at MVP. QSR/gas-station-convenience scope for MVP is the **convenience store building's facility conditions only** (coolers, restroom/plumbing leaks, kitchen gas appliances, energy usage).
- **Confirmed roadmap, explicitly not MVP, for the gas-station vertical specifically**: (a) fuel-dispenser/fuel-pump monitoring, and (b) underground fuel storage tank leak detection — the latter is a separate, heavily regulated EPA UST compliance program (financial responsibility rules, etc.), a materially larger and distinct product decision from this PRD's horizon. **Keep this conceptually separate from "industrial pumping stations"** (§ below) — that term refers to water/wastewater pump infrastructure (the existing `pump` category), a different vertical entirely from gas-station fuel dispensers, even though both use the word "pumping."
- **Industrial (water/wastewater) pumping stations are the next vertical after MVP** (not required for the MVP demo), building on the already-existing `pump` category.
- Existing v1.0.0 code's validated patterns (RLS tenant isolation, CDK stack structure, MQTT/IoT Core networking) are assumed sound and are being reconciled, not rebuilt from scratch, per `docs/architecture/README.md`.
- AWS as the cloud provider (IoT Core, Lambda, RDS, Cognito) is a constraint already made by the existing implementation, not re-litigated in this PRD.
- MVP validates the product thesis with a small number of design-partner tenants, not general availability — billing automation remains intentionally out of scope. **Narrowed v1.6**: "self-serve tenant onboarding" is no longer blanket out-of-scope — §5.11's Administration Console brings PeakLogic-*staff*-operated tenant/partner provisioning into MVP scope, replacing the manual SQL/AWS-CLI process. What remains explicitly out of scope is *customer or partner* self-service signup (see §4) — that boundary is unchanged.

---

## 9. Dependencies on Future Artifacts

This PRD intentionally does not specify: precise domain entities and relationships (→ **Domain Model**), SOC 2 control-level detail (→ **Compliance & Certification Roadmap**, **SOC 2 Control Mapping & Evidence Plan**), detailed screen-level UX (→ **UX Wireframes**, **Information Architecture**), exact schema/API contracts (→ **Database Schema**, **API Specification**), or the actuation/command security model (→ **Device & Command Security Architecture**). Those documents must remain consistent with the scope and priorities set here; if one of them surfaces a reason this PRD needs to change, that change gets made explicitly, not silently.

---

## 10. Review Resolution Log

1. **AI-3 scope**: resolved. Defined concretely as rate-of-change/trend detection plus rolling statistical anomaly detection over stored telemetry — no ML training required. Bumped from Should to Must for MVP.
2. **Beachhead vertical**: resolved. Pool servicing and QSR (gas-station convenience/fast food) are both confirmed, active opportunities and both required/demoable at MVP; industrial pumping stations confirmed as the next vertical post-MVP, not required now.
3. **Performance/availability targets**: resolved. 30-second alert latency, 99.9% v1 uptime target (internal engineering target, not yet a contractual SLA).
4. **Data retention policy**: resolved. 90 days raw telemetry, 2-year hourly rollups, alerts/tickets retained indefinitely (minimum 7 years).
5. **Channel-partner depth (CH-1)**: resolved. The pool-chemical/equipment-supplier channel relationship is confirmed real and active — CH-1 bumped from Should to Must, and CH-2 (basic partner attribution reporting) added to support a manual/offline revenue-share process. Full self-service portal/automated revenue-share/white-label views (CH-3) remain deferred past MVP.
6. **Gas-station vertical scope**: resolved. MVP stays scoped to convenience-store facility conditions only. Fuel-dispenser monitoring and underground fuel-tank leak detection (EPA UST-regulated) are confirmed **roadmap items** for this vertical specifically — not MVP, and not to be confused with the separate industrial (water/wastewater) pumping-station vertical, which happens to share the word "pumping" but is otherwise unrelated.
8. **Account Manager tenant scoping (§5.11, added v1.6)**: resolved. Explicitly-assigned subset ("book of business"), not universal cross-tenant access — a deliberate least-privilege choice over the simpler-to-build "any Account Manager can act on any tenant" alternative, matching the least-privilege posture already applied everywhere else in this project (RLS, per-technician territory scoping in §5.10).
9. **Administration Console timing (§5.11, added v1.6)**: resolved. Pulled into active MVP scope now, not scoped as a designed-later Enterprise Roadmap initiative — the same treatment the channel-partner portal (§5.10) got, on the basis that the gap it closes (manual SQL/CLI tenant provisioning) is a real, currently-felt limitation, not a hypothetical future one.
7. **Channel-partner portal scope (CH-3/§5.10)**: resolved. A real, active pool-servicing channel-partner sales motion justifies a scoped operational dispatch portal (branded login, territory/route management, AI-assisted dispatch suggestions) at MVP — reversing the prior blanket "no portal" decision, but narrowly: no full tenant-management access, no automated billing, no in-house AI routing engine (CH-3a). These narrower exclusions are explicitly noted as desired future improvements, not ruled out permanently.

---

## Revision History

**v1.1 (2026-07-04)** — forced by the User Personas artifact (#6), per this document's own rule (§9) that a downstream artifact surfacing a needed change must amend this document explicitly rather than silently diverging from it.

- **§5.9 added (RP-1, RP-2, RP-3)**: the Corporate/Regional Facilities Operations Leader and Small Business Owner-Operator personas both need a multi-site roll-up view, and the Route-Based Service Technician needs a route-prioritized view of their own day's stops — neither had a home in the original §5.4, which was written at the single-device level.
- **AI-3 reworded**: added a requirement that baseline-analytics sensitivity be configurable (at minimum per adapter/category), not a hardcoded constant — the User Personas artifact's Site-Level Facility Operator persona made explicit that alert-fatigue tolerance, not feature count, is what determines whether the product stays trusted.

**v1.2 (2026-07-04)** — forced by two open items the User Stories artifact (#7) surfaced and confirmed rather than left ambiguous.

- **RP-1 reworded**: the multi-site roll-up view must visually distinguish trending-toward-risk sites from currently-alarmed sites, not report a single undifferentiated count.
- **RP-2 reworded**: the route-prioritized view's per-site detail must include actual adapter-specific readings (chemistry, temperature, etc.), not just a health/alert summary.

**v1.3 (2026-07-04)** — forced by the Information Architecture artifact (#9), per this document's own rule (§9) that a downstream artifact surfacing a needed change must amend this document explicitly rather than silently diverging from it.

- **§5.9 added (RP-4)**: Information Architecture needed a "Sites" navigation item for the Tenant Admin persona but found no requirement backing it — RP-1 covers a risk/health roll-up, not a plain address-based directory. RP-4 adds the latter, reconciling the existing `frontend/src/pages/Sites.tsx` reference screen rather than inventing an unbacked one.

**v1.4 (2026-07-04)** — forced by the Information Architecture artifact (#9) finding the approved UX Wireframes' Channel Partner Attribution screen (§2.8) in conflict with its own terminology rule.

- **CH-1 amended**: channel-partner attribution is PeakLogic-internal-assigned, not tenant-self-service — a tenant may view (by actual supplier name) but not set or change it, and the term "channel partner" itself never appears in tenant-facing copy. This reverses the implicit assumption in the original UX Wireframes (a tenant-editable dropdown) and narrows User Personas §2.2's description of the Small Business Owner-Operator "managing" the relationship to viewing it.

**v1.5 (2026-07-11)** — forced by a real business conversation about the pool-servicing channel-partner sales motion (selling to pool-service companies who install sensors and need chemistry data to justify billable service), which directly reverses CH-3's prior blanket "no self-service partner portal... deferred past MVP" decision. Handled as an explicit, non-silent amendment per this document's own governing rule (§9), not a silent scope change — the same rule that produced v1.1–v1.4.

- **CH-3 revised, no longer blanket-deferred**: a scoped, operational-only partner portal (white-label branded login, territory/route dispatch view) is now **Must** for the pool-servicing vertical specifically — narrower than a full self-service portal, but real, justified by an active sales relationship the same way CH-1 was bumped from Should to Must.
- **CH-3a added**: full tenant-management access for partners, automated revenue-share/billing, and an in-house AI-routing engine remain explicitly deferred — carrying forward what CH-3 originally excluded, just narrowed instead of blocking the whole portal concept. Recorded as desired future product improvements, not permanently ruled out.
- **§5.10 added (TR-1, TR-2, TR-3)**: territory definition (map-drawn boundaries), technician-to-territory assignment (reusing RP-2's existing urgency ranking, not a new one), and an AI-generated advisory daily route suggestion consuming the existing MCP server (MCP-1) through an external agent — explicitly not a proprietary routing algorithm, and explicitly advisory, not authoritative, at MVP.
- **§3 role table, §4 In/Out of Scope updated** to reflect the above — narrowing rather than reversing the prior "no portal" exclusion.
- **Three implementation decisions locked** alongside this amendment (recorded in project memory, not requirements text): partner portal access is operational/dispatch-scoped only (not full tenant management); Mapbox is the map technology for territory drawing; the AI dispatch agent is external, consuming PeakLogic's MCP server, not an in-house engine.
- **Downstream artifacts requiring their own amendments as a result** (not done in this pass — tracked in `mvp-roadmap.md` and project memory): Domain Model, Database Schema, Security Architecture (new partner-login auth surface — channel partners have had zero login concept until now), Multi-Tenant Architecture (a genuinely new cross-tenant read pattern), API Specification, User Personas, and UX Wireframes.

**v1.6 (2026-07-12)** — forced by direct, hands-on use of the platform surfacing two real gaps: (1) tenant/channel-partner creation has no path except manual SQL + AWS CLI, which doesn't scale past a handful of design-partner accounts and shouldn't require database access for routine setup; (2) the main web application has no Settings area of any kind — not even a password-change flow — despite this being baseline-expected in any enterprise SaaS product. Both scoped into MVP now, not deferred to the Enterprise Roadmap, per explicit direction.

- **§3 role table extended**: two new internal-only roles, **PeakLogic Superadmin** (creates tenants/partners) and **PeakLogic Account Manager** (operates an assigned subset of accounts — cannot create new ones).
- **§5.11 added (IA-1–IA-8)**: a third identity/access surface, PeakLogic-staff-only, distinct from the tenant pool and the channel-partner pool. Superadmin-only tenant/partner creation; Account Manager access is scoped to an **explicitly assigned subset of accounts** (a "book of business"), not universal — a deliberate least-privilege choice, not a default. Superadmin is a strict superset of Account Manager capability, not a parallel role. Every action audit-logged (extends AUD-1/AUD-2 to a third actor type).
- **§5.12 added (SET-1–SET-8)**: a standard Settings area — profile, password change, 12/24-hour clock format, timezone (distinct from a Site's own `sites.timezone`), light/dark theme, MFA management, and (Tenant-Admin-only) a Team/Users panel reconciling the AWS-Console-only user-management process into the product itself. One item (SET-8, notification preferences) flagged **Could** rather than committed — depends on unverified email-notification infrastructure, not assumed already backed.
- **§4 In/Out of Scope updated**: the Administration Console and Settings area added as in-scope; a new explicit non-goal added — the console is **not** customer/partner self-service signup, and does **not** relax AUTH-1's no-unauthenticated-access boundary. Also clarified that §5.12's theme toggle is a personal display preference, not an extension of the channel-partner portal's white-label branding system.
- **§8 narrowed, not reversed**: "self-serve tenant onboarding" is no longer blanket out-of-scope — it's now in scope specifically as *PeakLogic-staff-operated* provisioning through §5.11's console. *Customer/partner* self-service signup remains exactly as out-of-scope as before; this amendment does not touch that boundary.
- **Downstream artifacts requiring their own amendments as a result** (not done in this pass, same sequenced pattern as v1.5's channel-partner-portal amendment): SRS (this document's own pass, done alongside), Domain Model (new entities: PeakLogicStaffUser or equivalent, account-manager-to-tenant/partner assignment), Database Schema (a third RLS-scoping dimension — staff sessions need cross-tenant read/**write** access, a materially harder problem than the channel-partner portal's read-mostly pattern, and directly intersects the already-flagged TD-7 gap — no non-owning application DB role exists yet), Security Architecture (a third Cognito pool or equivalent), Multi-Tenant Architecture, API Specification, User Personas, UX Wireframes.
- **§5.13 added (NAV-1–NAV-5), same v1.6 pass**: full Site → Asset → Device drill-down, plus per-device telemetry detail — surfaced by direct product use finding the three existing list pages (Sites/Assets/Devices) have no navigation between them at all. Explicitly documents that an Asset can have multiple Devices (verified against the schema, not assumed — no uniqueness constraint on `devices.asset_id`), and that the same drill-down applies inside the channel-partner portal, not just the tenant-side app. **A real, verified API gap found in the same pass, not hypothetical**: `GET /v1/devices` currently ignores all query parameters and always returns the tenant's entire device list — NAV-5 requires adding `assetId`/`siteId` filters before the drill-down UI can be built without over-fetching.
