# Product Requirements Document (PRD)

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v1.9 (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1.5 until v1.6–v1.9 are approved)
**Depends on:** [Vision Document](vision-document.md) (approved v1)
**Last updated:** 2026-07-19
**Fork note (v1.7):** this amendment folds in the Azure-pivot feature backlog (`docs/architecture/azure-restructuring-plan.md` §3) into the PeakLogic-Azure fork specifically — see Revision History for what changed and why. The AWS-native `PeakLogic-AWS` repo's own PRD is unaffected and continues independently.

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

- Multi-tenant cloud SaaS, **re-platformed onto Azure-native infrastructure for this track** *(corrected v1.7 — this line previously described the AWS-native stack verbatim; see `azure-restructuring-plan.md`)*: device ingestion, serverless compute, managed Postgres + RLS, identity/auth, an API layer, and CDN/static hosting. The multi-tenant RLS pattern and outbound-only device networking model are **reconciled and kept as-is** — concrete Azure service selection is Infrastructure as Code's (#16), Device & Command Security Architecture's (#12), and Security Architecture's (#13) job, not named at this level
- Existing sensing categories retained: `pump`, `hvac`, `pool_system`, `refrigeration`, `leak_sensor`, `energy_meter`
- New sensing modalities: water chemistry (pool), gas leak detection, air quality — added as new device-adapter categories (see §5.2)
- A formalized **device-adapter contract** (see §5.1) — MVP proves the pattern is config-shaped and documented; full dynamic third-party self-registration is deferred (see Out of Scope)
- An **MCP server** exposing devices, alerts, and telemetry as tools, authenticated through existing tenant-scoped auth
- Baseline real-time analytics (trend/anomaly detection over telemetry beyond static thresholds) — included at MVP per Vision §10's guidance to ship it now rather than defer if it isn't meaningfully harder than the alternative (see AI-3, and the open question in §10)
- Reconciling the existing frontend (currently mock data per `CLAUDE.md`) onto the real API, with device management UX redesigned against the "simpler than Alexa/Smart Home" bar
- Channel-partner attribution (tagging) for all verticals; **for the pool-servicing vertical**, additionally a scoped operational dispatch portal — white-label branded partner login, technician territory management (map-drawn boundaries), AI-assisted daily dispatch suggestions (§5.10) *(added v1.5 — see Out of Scope for what remains excluded)*
- **An internal PeakLogic Administration Console** *(added v1.6)* — a genuinely new, PeakLogic-staff-only identity surface with two roles (Superadmin, Account Manager) for creating and operating tenant/channel-partner accounts (§5.11). This is **not** customer or partner self-service signup — see the narrowed Out of Scope item below.
- **A Settings & Preferences area in the main web application** *(added v1.6)* — a standard, discoverable location for profile, security, display (clock format, timezone, light/dark theme), and (for Tenant Admins) team/user management (§5.12)
- **Geospatial site portfolio visualization** *(added v1.7)* — an interactive map plotting a tenant's sites by location, additive to the existing roll-up (RP-1) and directory (RP-4) views (§5.14)
- **3D facility rendering, first-pass/Should-priority** *(added v1.7, deliberately high-uncertainty)* — optional 3D visualization of facility/equipment for a Site or Asset, when a model exists (§5.15)
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
- **3D model authoring/CAD tooling** *(added v1.7)* — PeakLogic consumes pre-authored 3D models (§5.15); it does not build a modeling/CAD/asset-creation tool
- **Real-time telemetry overlay onto a 3D model** *(added v1.7)* — a plausible future extension of §5.15 (e.g. color-coding equipment by live alert status), not committed at this pass
- **The specific mapping technology for §5.14** *(added v1.7)* — Azure Maps vs. a third-party option (e.g. Mapbox, PeakLogic's existing choice for the AWS-side channel-partner portal's territory drawing) is an implementation decision, not a product requirement; it is evaluated and locked before UX Wireframes/API Specification are amended (`azure-restructuring-plan.md` §4), not decided here

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
| IA-9 | Site and device provisioning and per-asset threshold configuration performed under IA-5/IA-6 shall be performed through the same screens the tenant or channel partner would see themselves, entered via the existing act-as mechanism — not a separate, staff-only provisioning form *(added — see Revision History)* | Should |

**Error/edge conditions:** an Account Manager with zero assigned accounts (console shall show an empty, valid state, not an error); an attempt to create a tenant/partner by a non-Superadmin (shall be rejected server-side, not merely hidden in the UI, per AUTH-3's existing principle).

**A real, unresolved gap surfaced in this pass, not resolved here**: IA-5/IA-6 already establish that staff can provision devices/sites and set thresholds on a tenant's or partner's behalf, but the exact mechanism was never specified until now — whether staff reuse the tenant's/partner's own UI while acting-as, or a separate admin-only form. IA-9 commits to the former at the requirement level. The concrete UI/API design (does act-as literally render the tenant-side app inside the console, or does the console call the same API endpoints through its own chrome?) is deferred to a UX Wireframes/API Specification amendment, not resolved here.

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

### 5.14 Geospatial Site Portfolio Visualization *(added v1.7 — see Revision History)*

Surfaced by comparing against Purple Standard's MooreView platform during Azure-pivot scoping (`azure-restructuring-plan.md` §3) — a real interactive map showing the physical geographic locations of a tenant's sites. Distinct from RP-1's risk/health roll-up (list-based) and RP-4's plain address-sortable directory (also list-based): this is genuinely geospatial. Reuses existing `sites.lat`/`sites.lng` (already present in the schema, and already load-bearing for Territory→Site geographic containment — Domain Model §2.7) — a new *view* over largely existing data, not a new data-collection requirement.

| ID | Requirement | Priority |
|---|---|---|
| GEO-1 | An interactive map view shall be available from the tenant dashboard, plotting every Site in the tenant's portfolio at its geographic location | Must |
| GEO-2 | Map markers shall visually distinguish site risk status using the same three-way classification RP-1 already established (healthy / trending-toward-risk / currently-alarmed) — no new alerting/classification logic, just a new visual surface over existing data | Must |
| GEO-3 | Selecting a map marker shall navigate to that Site's existing Site Detail view (NAV-1) | Must |
| GEO-4 | The map view is additive — RP-1 (roll-up list) and RP-4 (sortable directory) remain available; a user may use whichever view suits the task | Must |
| GEO-5 | The same map view shall be available within the channel-partner portal, scoped to a partner's attributed tenants' sites — mirrors how RP-1/RP-2/NAV-4 already extend to that surface | Should |
| GEO-6 | A Site with no recorded lat/long shall be visually indicated as "unlocated" (e.g. a separate list/panel), not silently omitted or plotted at a default/incorrect coordinate | Must |

**Error/edge conditions:** zero sites (empty map, a valid state, not an error). **A real, pre-existing gap this feature surfaces more visibly, not one it introduces**: `sites.lat`/`sites.lng` are nullable in the existing schema and were already silently load-bearing for Territory→Site containment (Domain Model §2.7) — a site missing coordinates already failed silently for territory assignment before this feature existed. GEO-6 makes that gap visible in the UI for the first time; it does not fix the root cause (whether site creation should require coordinates going forward). Flagged as an open item for the UX Wireframes/Database Schema amendments, not resolved here.

**Deliberately undecided at this level**: the specific mapping technology (Azure Maps vs. a third-party option) is an implementation choice, not a product requirement — see the Out of Scope note in §4 and `azure-restructuring-plan.md` §4.

### 5.15 3D Facility Rendering *(added v1.7 — first pass, deliberately high-uncertainty; see Revision History)*

Also surfaced by the MooreView comparison. Explicitly the higher-uncertainty of the two new features (`azure-restructuring-plan.md` §3) — no existing precedent anywhere in this platform's architecture. This section scopes it at the product-requirement level only; asset format, rendering approach, authoring workflow, and storage are **explicitly not decided here** and must go through their own scoping pass before Domain Model/Database Schema can design against it.

| ID | Requirement | Priority |
|---|---|---|
| 3DR-1 | A Site or Asset detail view may optionally display an associated 3D model of the facility or equipment (explicitly named examples: pools, water treatment plants), when one exists | Should |
| 3DR-2 | 3D models are authored/produced out-of-band (not generated by PeakLogic) and associated with a Site or Asset via a stored reference | Must (once built) |
| 3DR-3 | Absence of a 3D model for a given Site/Asset is the expected default state, not an error — most sites will not have one, especially at initial launch | Must |

**This is deliberately a placeholder-level requirement set, not a fully-specified one** — matching `azure-restructuring-plan.md`'s own instruction not to assume scope for this feature. Downstream artifacts should treat 3DR-1–3DR-3 as the full extent of what's committed until a dedicated scoping pass (or a further amendment to this PRD) resolves file format, web-vs-native rendering, the authoring/CAD-import workflow, and storage — see §4 Out of Scope for what's explicitly excluded from this pass.

### 5.16 Device & Firmware Version Catalog *(added v1.8 — see Revision History)*

Surfaced by direct, hands-on use of the Internal Administration Console prototype (§5.11): the device twin already models a per-device "Firmware channel" (desired property) and "Firmware installed" (reported property), but nothing in the architecture defines where the set of *available* firmware/software versions per supported product comes from, or how a device's installed version is checked against what PeakLogic actually supports — today it is just a freely-typed string with no source of truth behind it. This is a real, load-bearing gap for any real device fleet: without a canonical catalog, there is no way to know whether a device is running an unsupported or end-of-life version, or to safely offer an upgrade path.

| ID | Requirement | Priority |
|---|---|---|
| FW-1 | The system shall maintain a canonical Device & Firmware Version Catalog: for each supported product/sensor type, the set of firmware/software versions PeakLogic supports, organized into named channels (e.g. `stable`, `beta`) | Must |
| FW-2 | A device's device-twin desired/reported firmware properties (already prototyped in §5.11's console) shall be validated against this catalog — a device reporting a version not present in the catalog for its product type shall be flagged (e.g. "unmanaged firmware"), not silently accepted | Must |
| FW-3 | The Internal Administration Console (§5.11) shall provide a fleet-wide view of firmware/version drift: devices on an unsupported version, devices eligible for an available upgrade, and devices already current | Should |
| FW-4 | The desired-property "Firmware channel" value offered to a device shall be selected from this catalog's defined channels for that device's product type, not freely typed per device | Should |

**Error/edge conditions:** a product/sensor type with no catalog entries yet (FW-2 shall treat every reported version for that type as unmanaged/unknown, not silently pass); a device whose product type cannot be determined (same treatment, not an error state).

**Deliberately undecided at this level**: whether firmware images themselves are hosted/distributed by PeakLogic (an actual OTA delivery pipeline) versus the catalog being a version-tracking/compatibility record only that feeds a separate distribution mechanism, is a Domain Model/Database Schema/Device & Command Security Architecture decision, not resolved here.

### 5.17 Automated Pool Water-Quality Reporting *(added v1.9 — see Revision History)*

Surfaced by a direct business request against the pool-servicing beachhead (§5.10/CH-3): a recurring, consumer-legible pool water-quality report — comparable to the printed panel a homeowner gets from an in-store water test — generated per pool site and delivered to that property's owner on a weekly cadence, branded as the channel partner's own. The value is **proactive transparency**: the homeowner sees what their water actually needed and what was actually done about it, on a schedule, without having to take a sample somewhere or take the service visit on trust.

**Positioning note (deliberate):** this is scoped as the channel partner *demonstrating* their work, not as the homeowner *policing* the partner. The partner is the buying customer for this platform, and a feature framed as an audit against them is a feature they will not deploy. This is the same "Show the work" principle §5.13/§6 already established, extended to the partner's own end customer. **Pricing is explicitly excluded** (PW-6) — PeakLogic does not hold chemical or labour pricing, and the product does not adjudicate whether a charge was fair.

**A real sensing limit this feature runs into, verified against `backend/ingest/rules.ts`, not assumed:** the `pool_chemistry` adapter today implements exactly `ph`, `free_chlorine_ppm`, and `tds_ppm`; `pool_system` adds `flow_lpm` and `temp_c`. A standard water-test panel also covers **total alkalinity, calcium hardness, and cyanuric acid** — all reagent/titration chemistry with no practical continuous inline sensor at residential price points (cyanuric acid in particular has no viable inline measurement; alkalinity requires either a reagent analyzer whose cost cannot be justified on a residential pool, or an inferred acid-demand estimate). This section therefore specifies a **hybrid panel** rather than pretending the full test can be automated.

| ID | Requirement | Priority |
|---|---|---|
| PW-1 | The system shall generate a recurring pool water-quality report per pool site, on a configurable cadence defaulting to weekly, in a format legible to a non-technical property owner | Must |
| PW-2 | A channel partner shall be able to enable, schedule, and disable the report per attributed customer site themselves, without PeakLogic staff involvement | Must |
| PW-3 | Each reported parameter shall show its measured value, its target range, an in/out-of-range status, and its trend across the reporting period — not a single instantaneous reading | Must |
| PW-4 | The report shall visually distinguish **continuously sensed** parameters from **technician-entered** ones. A parameter that was not sensed shall never be presented as though it were | Must |
| PW-5 | A technician shall be able to record the reagent-test panel (total alkalinity, calcium hardness, cyanuric acid) against a site during a service visit; each entry shall carry its test date and the attributed technician | Must |
| PW-6 | Services performed at the site during the reporting period shall be listed alongside the readings. The report shall **not** include chemical, material, or labour pricing | Must |
| PW-7 | The report shall be deliverable by email to recipients designated per site | Must — **blocked**, see below |
| PW-8 | Report emails shall be sent under the channel partner's own domain and branding, extending the branded-workspace framework (CH-3) | Must — **blocked**, see below |
| PW-9 | Report generation and delivery shall be recorded via the existing audit-log mechanism (AUD-1/AUD-2), and an issued report shall remain reproducible exactly as sent for the retention period | Must |
| PW-10 | Technician capture (PW-5) shall occur on a mobile client suitable for poolside use, authenticated as the **existing** `channel_partner_users` `technician` role — no new identity surface is introduced for this | Must |
| PW-11 | Capture shall function with no connectivity and sync when the device regains it. A residential backyard is not a reliable-network environment, and a technician cannot be blocked from finishing a stop by signal | Must |
| PW-12 | A reagent-panel entry shall be bound to that technician's checked-in route stop for that site and period, so a reading cannot be attributed to a visit that did not take place | Must |
| PW-13 | Entry fields shall validate each parameter against a plausible range and require confirmation of an out-of-range value rather than silently accepting it (transposition and mis-keying protection) | Should |
| PW-14 | A technician shall be able to attach a photo of the physical test result to a reagent-panel entry | Could |

**🔴 PW-7 and PW-8 are blocked on infrastructure that does not exist.** Verified directly: there is **no outbound email mechanism anywhere in `backend/` or `infra/`** — no SES, SendGrid, nodemailer, Postmark, Mailgun, or SMTP path. The only outbound notification channel that exists today is the fire-and-forget webhook on critical alerts. This is the *same* unbuilt dependency SET-8 was already flagged **Could** against, and it is a harder version of it: PW-7 needs scheduled, recurring, per-recipient delivery, and PW-8 additionally needs per-partner sender authentication (SPF/DKIM/DMARC for each partner's custom domain), bounce/complaint handling, and suppression lists. **Building outbound email is a prerequisite project in its own right and must be scoped before PW-7/PW-8 can be scheduled** — do not treat this section as shippable without it.

**Sensing roadmap surfaced by this section** (device-sourcing work, not requirements): **salt** (`salt_ppm`) is effectively free — every salt chlorine generator already measures and reports it via conductivity, and SWG integration is already in the device ecosystem — and should be added to the sensed set. **Calcium hardness** is feasible via calcium ion-selective electrode with calibration/drift caveats. **Total alkalinity** is feasible only via a reagent analyzer (plausible on a commercial pool, not a residential one) or as an inferred acid-demand estimate. **Cyanuric acid** has no viable inline sensor and is expected to stay technician-entered indefinitely. These require a real vendor-sourcing pass before any of them is promised.

**Technician capture — logistics and persona (PW-10–PW-14).** The weak link in this feature is not the sensing or the delivery, it is getting three reagent readings out of a person standing next to a pool. What already exists and is reused unchanged: the **Route-Based Service Technician** (User Personas §2.4) already has a real scoped login (`channel_partner_users` with `role: technician`), already sees only their own territory's sites and their own day's route (`GET /v1/partner/routes`), and is admin-provisioned by their employer's dispatcher (§2.7). **PeakLogic Mobile** (`ios-application.md`, Draft v1.3) already targets exactly this role and already specifies an offline queue for durability. So PW-10/PW-11 are extensions of designed surfaces, not new ones.

What is genuinely **new** and must be designed: this persona has so far only ever *read* (plus a narrow set of writes — acknowledge an alert, update a ticket, confirm a route). Recording a water test is a **new write path** with no endpoint, no data model, and no place in the current schema — it needs its own pass through Domain Model → Database Schema → API Specification. Practical field constraints that should shape that design rather than be discovered later: the technician is outdoors in glare, likely with wet hands or gloves, on a phone, possibly with no usable signal in a fenced backyard, and is being paid per stop — so entry has to be a few large numeric fields completed in seconds, not a form.

**🔴 An honesty limit this feature cannot engineer away.** The premise is transparency instead of trusting the service visit — but for total alkalinity, calcium hardness, and cyanuric acid, the number in the report is a value the technician *typed*. PW-12/PW-13 raise the cost of a careless or bad-faith entry (it must come from a real checked-in stop, and implausible values are challenged), and PW-4 keeps the provenance visible, but a technician-entered value is **attested, not measured by PeakLogic**, and the report must never blur that line. The only mechanism that genuinely removes the trust dependency is **direct instrument integration** — a Bluetooth photometer (Hanna/LaMotte/Taylor-class digital testers) transmitting its own reading, so the instrument attests rather than the person. That is the real answer to this section's own premise and belongs on the roadmap; it is deliberately **not** required at MVP because it adds hardware sourcing and a new integration class.

**Deliberately not required: geolocation at capture.** Verifying the technician's device position against `sites.lat`/`lng` would strengthen PW-12 meaningfully, and the coordinates already exist. It is left out because tracking an employee's location is a labour and privacy decision for the channel partner to make about their own staff, not something PeakLogic should impose by default. Flagged as a decision for the partner-portal amendment, not silently adopted.

**Error/edge conditions:** a pool site with no chemistry device (no report is generated — a valid empty state, not an error); a reporting period with no technician visit (the report shall state that the reagent panel was not tested this period, rather than silently omitting it or repeating a stale prior value); a sensor offline for part of the period (the report shall show the coverage gap rather than interpolating across it); a technician entry captured offline and synced after the report has already been generated (the entry shall attach to the period it was *taken* in, not the period it synced in).

**Deliberately undecided at this level**: the delivery artifact itself (attached PDF vs. inline HTML vs. a hosted report page). **If a hosted report page is chosen, it directly triggers the unresolved AUTH-1 conflict** — a property owner has no login, so serving them a report page is the same no-authenticated-access problem already open for the Service Ticket and Attribution Report screens, and would need the same `/v1/public/*` + per-resource-token carve-out, which has not been agreed. Email-only delivery sidesteps it.

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
- **Infrastructure re-platformed to Azure for this track** *(corrected v1.7 — this line previously said "reconciled, not re-platformed," describing the AWS-native repo this was forked from)*: the underlying pattern (managed Postgres + RLS, IoT device ingestion, serverless compute, identity/auth, CDN/static hosting) is reconciled and kept; concrete Azure service names and the IaC tool choice are Infrastructure as Code's (#16) decision, not this PRD's.

---

## 8. Assumptions & Constraints

- **Beachhead verticals for MVP demo (confirmed): pool servicing and QSR (gas station convenience stores, fast food).** Both are real, active sales opportunities, not hypothetical — both must be easily demoable at MVP. QSR/gas-station-convenience scope for MVP is the **convenience store building's facility conditions only** (coolers, restroom/plumbing leaks, kitchen gas appliances, energy usage).
- **Confirmed roadmap, explicitly not MVP, for the gas-station vertical specifically**: (a) fuel-dispenser/fuel-pump monitoring, and (b) underground fuel storage tank leak detection — the latter is a separate, heavily regulated EPA UST compliance program (financial responsibility rules, etc.), a materially larger and distinct product decision from this PRD's horizon. **Keep this conceptually separate from "industrial pumping stations"** (§ below) — that term refers to water/wastewater pump infrastructure (the existing `pump` category), a different vertical entirely from gas-station fuel dispensers, even though both use the word "pumping."
- **Industrial (water/wastewater) pumping stations are the next vertical after MVP** (not required for the MVP demo), building on the already-existing `pump` category.
- Existing v1.0.0 code's validated *patterns* (RLS tenant isolation, outbound-only MQTT device networking, stage/environment separation) are assumed sound and are being reconciled onto Azure, not rebuilt from scratch, per `docs/architecture/README.md` and `azure-restructuring-plan.md`.
- **Azure as the cloud provider is the constraint for this track** *(corrected v1.7 — this line previously named AWS/IoT Core/Lambda/RDS/Cognito as the constraint, describing the repo this was forked from; the AWS-native `PeakLogic-AWS` repo is unaffected and continues in parallel, see `azure-restructuring-plan.md`)*. Concrete Azure service selection (compute, IoT device identity/provisioning, auth, IaC tool) is deferred to Infrastructure as Code (#16), Device & Command Security Architecture (#12), and Security Architecture (#13) — not re-litigated in this PRD.
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

**v1.7 (2026-07-17)** — the first amendment specific to the `PeakLogic-Azure` fork, forced by two things at once: (1) the Azure-pivot feature backlog (`azure-restructuring-plan.md` §3), surfaced by comparing against Purple Standard's MooreView platform during merger exploration; (2) this document's own AWS-specific platform-constraint language (§4, §7, §8) having gone stale the moment this repo forked for an Azure track, per the same non-silent-amendment discipline used for every prior revision.

- **§5.14 added (GEO-1–GEO-6)**: an interactive geospatial map of a tenant's site portfolio, additive to the existing RP-1 (risk roll-up) and RP-4 (address directory) list views. Reuses existing `sites.lat`/`sites.lng` — a new view, not new data collection. **A real, pre-existing gap surfaced, not introduced, while scoping this**: those columns are nullable and were already silently load-bearing for Territory→Site geographic containment (Domain Model §2.7); GEO-6 makes an already-existing gap visible in the UI for the first time rather than fixing its root cause.
- **§5.15 added (3DR-1–3DR-3)**: 3D facility/equipment rendering, deliberately scoped at placeholder/first-pass level and marked **Should**, not Must — per `azure-restructuring-plan.md`'s explicit instruction that this feature is higher-uncertainty than the map feature and must not have scope assumed into it prematurely. File format, rendering approach, authoring workflow, and storage are named as explicitly undecided, not silently deferred.
- **§4 In/Out of Scope updated**: both new features added to In Scope; four new Out-of-Scope items added — 3D authoring/CAD tooling, real-time telemetry-to-3D-model overlay, and (deliberately) the specific mapping-technology choice for §5.14, which is named here as an implementation decision for a later artifact, not a product requirement, mirroring how Mapbox was "locked... recorded in project memory, not requirements text" for v1.5's territory-drawing feature rather than named in this document.
- **§4/§7/§8 corrected, not just extended**: this document's platform-constraint language still named AWS services (IoT Core, Lambda, RDS, Cognito, CDK) as "the existing implementation... not re-litigated" — accurate for the repo this was forked from, wrong for this fork's own track. Corrected to name Azure as the constraint and generalize the described stack to cloud-agnostic pattern language (managed Postgres + RLS, IoT device ingestion, serverless compute, identity/auth, CDN/static hosting), explicitly deferring concrete Azure service selection to Infrastructure as Code (#16), Device & Command Security Architecture (#12), and Security Architecture (#13) — this PRD does not itself pick Azure services, the same boundary it already held for AWS.
- **Downstream artifacts requiring their own amendments as a result** (not done in this pass, tracked in `azure-restructuring-plan.md` §2 and project memory): SRS (this document's own pass, done alongside), Domain Model (new entities/attributes for site geo-coordinates already existing but newly load-bearing, plus a 3D-model-asset-reference entity), User Stories, UX Wireframes (new dashboard map view, new 3D facility render view, plus the mapping-technology evaluation itself), Information Architecture (new nav items), Database Schema, API Specification (map data + 3D asset delivery endpoints).

**v1.8 (2026-07-19)** — forced by direct, hands-on use of the Internal Administration Console prototype surfacing two real gaps: (1) the prototype's device twin already shows a "Firmware channel"/"Firmware installed" property pair with nothing behind it — no catalog of what versions PeakLogic actually supports per product, so a device could report any string and the console would have no way to know it was unmanaged; (2) IA-5/IA-6 already establish that staff can provision devices/sites and configure thresholds on a tenant's or partner's behalf, but never specified whether that happens through the tenant's/partner's own screens (via act-as) or a separate staff-only form — raised directly while reviewing the console prototype against what a Superadmin should actually be able to do.

- **§5.16 added (FW-1–FW-4)**: a canonical Device & Firmware Version Catalog — supported products, their available firmware/software versions, and named channels (`stable`, `beta`) — against which each device's twin firmware properties are validated, with fleet-wide drift visibility surfaced in §5.11's console. Deliberately leaves open whether PeakLogic hosts/distributes firmware images itself or only tracks version/compatibility data — a Domain Model/Database Schema/Device & Command Security Architecture decision.
- **IA-9 added, §5.11**: staff-performed provisioning/threshold-configuration (IA-5/IA-6) shall use the same screens the tenant/partner would see themselves, via act-as — not a separate admin-only form. **Flagged as a real, unresolved design question, not settled by this requirement alone**: whether act-as literally renders the tenant-side app inside the console, or the console calls the same API endpoints through its own chrome, is deferred to a UX Wireframes/API Specification amendment.
- **Downstream artifacts requiring their own amendments as a result** (not done in this pass): SRS (this document's own pass, done alongside), Domain Model (a Firmware/Product Catalog entity and its relationship to `devices`), Database Schema, API Specification (catalog CRUD + drift-query endpoints; the concrete act-as provisioning/threshold API shape per IA-9), UX Wireframes (fleet firmware-drift view; the act-as provisioning/threshold screens themselves).

**v1.9 (2026-07-19)** — forced by a direct business request against the pool-servicing beachhead: a recurring, consumer-legible pool water-quality report, generated per pool site and delivered weekly to the property owner under the channel partner's own branding. Scoped here as the partner **demonstrating** their work rather than the homeowner auditing them — the partner is the buying customer, and a feature framed as an audit against them is one they will not deploy.

- **§5.17 added (PW-1–PW-14)**: recurring per-site water-quality reporting; partner-managed scheduling; sensed-vs-technician-entered provenance; technician reagent-panel capture; services-performed listing; audited, reproducible issued reports.
- **Pricing deliberately excluded (PW-6)** — per explicit direction. PeakLogic holds no chemical or labour pricing and does not adjudicate whether a charge was fair; the report shows what the water needed and what was done, not what it cost.
- **A real sensing limit documented, not designed around**: verified against `backend/ingest/rules.ts` that `pool_chemistry` implements only `ph`, `free_chlorine_ppm`, `tds_ppm` (plus `pool_system`'s `flow_lpm`/`temp_c`). Total alkalinity, calcium hardness and cyanuric acid are reagent chemistry with no practical residential inline sensor — CYA especially has no viable inline measurement at all. Hence the **hybrid panel** (PW-4/PW-5) rather than a claim the full test is automated. Salt is noted as effectively free via existing SWG integration and should be added to the sensed set.
- **🔴 PW-7/PW-8 written as blocked, not assumed**: verified there is **no outbound email mechanism anywhere in `backend/` or `infra/`** — no SES/SendGrid/nodemailer/Postmark/Mailgun/SMTP; the only outbound path in existence is the critical-alert webhook. This is the same unbuilt dependency SET-8 was flagged on, in a harder form (scheduled recurring per-recipient delivery, plus per-partner SPF/DKIM/DMARC, bounce/complaint handling and suppression lists for partner-branded sending). Building outbound email is a prerequisite project and must be scoped before either can be scheduled.
- **§5.17 technician-capture block added (PW-10–PW-14)** after the logistics question was raised in the same session: reuses the existing §2.4 technician login and the already-specced PeakLogic Mobile client (#26) rather than inventing a surface, but names the genuinely new part — this persona has only ever read, so a water-test write path has no endpoint, model or schema today.
- **Honesty limit stated explicitly**: for the three reagent parameters the report carries a value the technician *typed*. PW-12/PW-13 raise the cost of a bad entry and PW-4 keeps provenance visible, but such a value is **attested, not measured**, and only direct instrument integration (Bluetooth photometer) genuinely closes it — named as the roadmap answer, deliberately not required at MVP.
- **Geolocation at capture deliberately not required** — it would strengthen PW-12 and the coordinates already exist, but tracking staff location is the partner's labour/privacy decision, not one PeakLogic imposes by default.
- **Downstream artifacts requiring their own amendments as a result** (not done in this pass): SRS (this document's own pass, done alongside), User Personas (§2.4 gains a write responsibility), Domain Model + Database Schema + API Specification (the water-test entity, its binding to `route_stops`, and the technician write endpoint), iOS Application (#26 — the capture screen and its offline-queue extension), UX Wireframes (the report itself and the capture form), and whatever artifact ends up owning outbound email infrastructure.
