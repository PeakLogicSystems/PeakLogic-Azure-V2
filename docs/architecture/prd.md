# Product Requirements Document (PRD)

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1.3 (amended — see Revision History, end of document)
**Depends on:** [Vision Document](vision-document.md) (approved v1)
**Last updated:** 2026-07-04

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
| **Channel Partner / Reseller** | Sells or provisions devices under a co-branded or white-label arrangement | Attribution for devices/tenants sold through them — lightweight at MVP, not a full portal |
| **External AI/Agent Consumer** *(system actor via MCP, not a login role)* | A customer's own AI/agent stack, or PeakLogic's own analytics | Query device/alert/telemetry data as a tool through the MCP server |

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
- Lightweight channel-partner attribution (tagging, not a portal)
- Architecture that does not preclude SOC 2 certification later (not certified at MVP)

### Explicitly out of scope for MVP

- **Actuation of any kind** (leak/gas valve shutoff) — the `commands` MQTT topic already scoped in the device IoT policy stays unused; this is a Device & Command Security Architecture artifact (#12), not this PRD's horizon
- **Active electrical load conditioning/management** — long-term, partnership-first per Vision §11, not a near-term build
- **Dynamic, self-service third-party device marketplace** — MVP adapters are added by PeakLogic engineering through the adapter contract; a true runtime plugin/marketplace model (arbitrary third parties registering adapters without PeakLogic code changes) is post-MVP
- **PeakLogicSystems acting as an MCP client** (consuming external MCP servers) — deferred until a specific integration need justifies it, per Vision §10
- **Formal compliance certification** (SOC 2 Type II, ISO 27001) — architected to not preclude these later, not achieved now
- **Full channel-partner self-service portal / co-branding tooling**
- **Native mobile app** — MVP is a responsive web dashboard; a native Android/iOS app is not required to prove the product thesis
- **Predictive/ML-trained analytics models** — baseline trend/anomaly detection is in scope (AI-3); custom-trained predictive maintenance models are not

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
| CH-1 | A tenant/device can be tagged with a channel-partner/reseller reference for attribution — the pool-chemical/equipment-supplier channel relationship is real and active, not hypothetical, so this is confirmed **Must**, not just a nice-to-have | Must |
| CH-2 | Basic partner attribution reporting (which tenants/devices came through which partner) — supports a manual/offline revenue-share process; not automated billing | Should |
| CH-3 | Full self-service partner portal, automated revenue-share, and co-branded/white-label dashboard views are deferred past MVP | Won't (MVP) |

### 5.9 Portfolio & Route Reporting *(added v1.1 — see Revision History)*

Surfaced by the User Personas artifact: both the Small Business Owner-Operator (§2.2) and the Corporate/Regional Facilities Operations Leader (§2.1) need a view across *many* sites, not one device at a time — and a Route-Based Service Technician (§2.4) needs the same idea filtered to just their own day's stops. Neither had a home in the original §5.4 (Device Management UX), which was written at the single-device level. RP-4 was added later, when the Information Architecture artifact surfaced a distinct need: a plain lookup/directory of sites by location, independent of RP-1's risk-status framing.

| ID | Requirement | Priority |
|---|---|---|
| RP-1 | A tenant-scoped, multi-site roll-up view shall exist, showing aggregate risk/health status and alert counts across every site a Tenant Admin or Corporate/Regional Ops Leader oversees — not just one site or device at a time. The view shall visually distinguish sites **trending toward risk** (AI-3 anomaly/trend flags) from sites **currently in alarm** (static-threshold alerts) — confirmed during User Stories review, not just a single undifferentiated "attention needed" count | Must |
| RP-2 | A route-prioritized view shall exist for a Service Partner/technician's assigned sites for the current day, sorted so sites trending toward a problem are surfaced ahead of healthy ones. Per-site detail in this view shall include the actual adapter-specific readings (e.g. chemistry, temperature) driving that site's status, not just a health/alert summary — confirmed during User Stories review, since a technician needs to know *what's* wrong before arriving, not just *that* something is | Should |
| RP-3 | Aggregate savings/avoided-loss estimates (e.g. total alerts that likely prevented a larger incident) are a **future** reporting goal, not required at MVP — RP-1/RP-2 cover presence/status roll-ups only; a defensible ROI dollar figure requires real usage data this PRD's horizon doesn't yet have | Won't (MVP) |
| RP-4 | A tenant-scoped directory listing every site a Tenant Admin operates shall exist, sortable/filterable by street address, city, and state — a plain lookup aid, distinct from RP-1's risk/health roll-up (e.g. "which of our sites are in Austin, TX," not "which sites need attention"). Reconciles an existing reference-implementation screen (`frontend/src/pages/Sites.tsx`) that already does this in simplified form (city/state only, no street address) — added v1.3 when Information Architecture found no requirement backing the "Sites" navigation item it needed | Should |

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
- MVP validates the product thesis with a small number of design-partner tenants, not general availability — enterprise-grade operational tooling (billing, self-serve tenant onboarding) is intentionally not a requirement yet.

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
