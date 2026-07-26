# Unified Product Vision — PeakLogic Industrial Operations Platform

**Status:** Draft v0.1
**Prepared by:** PeakLogic
**Scope:** PeakLogic-first product strategy. Unlike the vendor-neutral [Platform Commercialization Roadmap](platform-commercialization-roadmap.md), this document takes a **decided position**: PeakLogic is the principal product and technical foundation, and the critical capabilities of Purple Standard's MooreView are merged into it, modernized, and delivered under one unified platform.
**Last updated:** 2026-07-24

> **Supersession note.** The commercialization roadmap deliberately deferred "whose architecture/brand carries forward." That question is now answered for planning purposes: **PeakLogic carries forward.** This document assumes PeakLogic's multi-tenant Azure cloud, its RLS data model, its Entra identity, and its existing edge runtime (PeakLogicEdge) as the foundation, and treats MooreView as a source of proven single-plant SCADA/HMI capability to absorb — not as a co-equal stack to reconcile. If merger terms change that assumption, this document is the thing to revise.

---

## 0. The one-paragraph thesis

**PeakLogic is the intelligence and operations layer that sits *above* SCADA/HMI.** It does not replace the safety-rated, deterministic control logic that lives in a plant's PLCs — that stays exactly where it is. Instead, PeakLogic unifies data across many facilities, adds AI-driven anomaly detection and predictive maintenance, automates compliance reporting, and drives technician workflows — for operators who today have none of that, or have it locked inside a single-site tool they can't see across. The unified platform has three components that are **one product**: **PeakLogicSystems** (the multi-tenant cloud), **PeakView360** (the modern HMI/SCADA experience), and **PeakLogic Hubs** (the on-prem edge units). Two of these three already exist in the codebase today. *(Naming: the company is **PeakLogic**; the cloud layer is **PeakLogicSystems** — see §7.1.)*

---

## 1. Why this is credible, not vaporware

The single most important framing for leadership and investors: **this is a consolidation of assets that largely exist, plus one focused net-new build — not three products from zero.**

| Pillar | Status today | What's real right now |
|---|---|---|
| **PeakLogicSystems** (core cloud) | **Exists** | Multi-tenant Azure platform with database-enforced row-level security (RLS), Entra ID auth, IoT telemetry ingest, device-silence detection, AI Analytics Tier-1 anomaly detection (scaffolded, feature-flagged), channel-partner white-label portal, immutable audit log, CMMS webhook connectors, and a working Platform Control Center operator demo. |
| **PeakLogic Hubs** (on-prem) | **Exists in embryo** | `PeakLogicEdge` — a real Windows edge runtime (`PeakLogicEdge.Host`) already running on target hardware, with an ingestion orchestrator, local telemetry cache, store-and-forward publishing over MQTT/TLS, and a commissioning flow. "PeakLogic Hubs" is the productization and hardening of this, not a new invention. |
| **PeakView360** (HMI/SCADA) | **Net-new** — this is the build | The modern operator experience that absorbs MooreView's proven capabilities: real-time screens, alarm management, equipment dashboards, facility visualization, historian trending. This is where the majority of net-new engineering goes, and where MooreView's value is harvested. |

That mapping is the strategic unlock. **Purple Standard's MooreView is the fastest way to de-risk PeakView360** — it is a working, in-market proof of exactly the operator-facing surface PeakLogic lacks. We are not guessing what a wastewater operator needs on a screen; MooreView already shipped it. Our job is to modernize it, multi-tenant it, and wire it into the intelligence layer PeakLogic already has.

---

## 2. Unified Product Vision

### 2.1 What the combined system is

A **full-stack industrial operations platform** for distributed, multi-site, compliance-heavy operations — starting in wastewater/water and expanding across facilities verticals. It spans from the PLC in the field to the executive dashboard in the browser, as one continuous product with one identity model, one data model, and one help system.

### 2.2 PeakLogicSystems — the core cloud intelligence platform

The brain. Multi-tenant SaaS on Azure. Owns:

- **Multi-site monitoring** — every facility a customer (or a service provider's customers) operates, in one pane, scoped by RLS so no tenant ever sees another's data. This is the thing single-plant MooreView structurally *cannot* do.
- **AI anomaly detection** — the existing Tier-1 anomaly engine, generalized: baseline-vs-actual deviation per metric, per asset, across the fleet.
- **Predictive maintenance** — asset health scoring from historian features (the capability MooreView's PdM module proves demand for), run centrally across all sites rather than per-plant.
- **Compliance automation** — automated regulatory reporting (e.g. NPDES Discharge Monitoring Reports for wastewater), exceedance logs, and an immutable audit trail. This is the wedge: compliance is non-optional, painful, and today largely manual.
- **Technician workflows** — dispatch, work orders, route-based service, act-as context for service providers managing customer sites (already modeled in the channel-partner portal).
- **Cloud dashboards & enterprise reporting** — cross-facility rollups, KPI reporting, ROI reporting, exportable and API-accessible.
- **Multi-tenant SaaS** — tenants, channel partners, and internal staff as three separate identity surfaces, already built.

### 2.3 PeakView360 — the modernized HMI/SCADA layer

The face. The unified operator experience, absorbing all critical MooreView features and redesigning them for usability:

- **Real-time operator screens** — live process values, equipment state, running/fault indicators.
- **Alarm management** — active alarms, acknowledgement, notification routing, alarm history.
- **Equipment dashboards** — per-asset views (pumps, blowers, clarifiers, tanks) with live telemetry and trend.
- **Facility-level visualization** — the plant/process view. MooreView's 3D isometric facility view is preserved as an *option* for engineered sites, but the default becomes a fast, responsive 2D process schematic that works on a phone in the field and a control-room monitor alike.
- **Historian trending** — multi-pen trend explorer with range selection and export.

PeakView360 is deliberately positioned so it can be **either** the primary HMI (for greenfield/small sites with no existing SCADA) **or** a supervisory visualization layer alongside existing SCADA (for brownfield plants that keep their control system). It never asks a plant to rip out a safety-rated control system.

### 2.4 PeakLogic Hubs — the on-prem processing units

The hands and ears. Ruggedized edge units (evolving `PeakLogicEdge`) installed at each facility:

- **Local data acquisition** — poll instruments and I/O.
- **PLC/RTU connectivity** — industrial protocol drivers (Modbus TCP/RTU, OPC-UA, EtherNet/IP), reading from PLCs, RTUs, and existing SCADA historians.
- **Edge processing** — local buffering, unit conversion, first-pass filtering, and local alarm evaluation so safety-relevant conditions don't depend on a cloud round-trip.
- **Offline reliability** — the site keeps running and PeakView360 keeps rendering **even with no internet**, because the Hub serves the operator screens locally.
- **Secure cloud sync** — outbound-only MQTT/TLS store-and-forward to PeakLogic cloud; no inbound firewall hole on the customer network (the existing PeakLogicEdge security model).

### 2.5 How the three work together as one product

- The **Hub** acquires ground truth from the field and is the offline-resilient anchor at each site.
- **PeakView360** renders that ground truth — sourcing live data **locally from the Hub** (low-latency, offline-capable) and **historical/cross-site data from the cloud** (anywhere, any device). Same UI, dual data source, transparent to the operator.
- **PeakLogic cloud** aggregates every Hub's telemetry across every site, runs the AI/PdM/compliance intelligence that no single Hub could, and pushes insights *back down* — an anomaly score, a predicted failure, a due PM — so they surface right on the operator's PeakView360 screen next to the live value that triggered them.

One identity. One data model. One help system. Three deployment surfaces.

---

## 3. Architecture (text diagram)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          PEAKLOGIC CLOUD (Azure)                            │
│                     multi-tenant · RLS-enforced · Entra ID                  │
│                                                                            │
│   ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐   │
│   │ Multi-site  │  │ AI anomaly + │  │ Compliance  │  │ Technician /   │   │
│   │ monitoring  │  │ Predictive   │  │ automation  │  │ CMMS workflows │   │
│   │             │  │ maintenance  │  │ (DMR, audit)│  │                │   │
│   └─────────────┘  └──────────────┘  └─────────────┘  └────────────────┘   │
│   ┌────────────────────────────────────────────────────────────────────┐  │
│   │  Enterprise reporting · cloud dashboards · REST/API · PeakAssist CMS │  │
│   └────────────────────────────────────────────────────────────────────┘  │
└───────────────▲──────────────────────────────────────────┬────────────────┘
                │  outbound-only MQTT/TLS (telemetry up)     │ insights + config
                │  store-and-forward                         │ + Help content down
                │                                            ▼
   ┌────────────┴─────────────────────────────────────────────────────────┐
   │                          PER FACILITY (on-prem)                         │
   │                                                                        │
   │   ┌────────────────────────┐        ┌──────────────────────────────┐   │
   │   │     PEAKLOGIC HUB        │        │        PEAKVIEW360            │   │
   │   │  (edge processing unit)  │◄──────►│  (HMI/SCADA operator client)  │   │
   │   │                          │  LAN   │                              │   │
   │   │ • protocol drivers       │ live + │ • real-time screens          │   │
   │   │ • local historian buffer │ offline│ • alarm management           │   │
   │   │ • edge alarm eval        │        │ • equipment dashboards       │   │
   │   │ • store-and-forward      │        │ • facility visualization     │   │
   │   │ • offline PeakAssist copy │        │ • historian trends           │   │
   │   └───────────▲──────────────┘        │ • one-click Help (PeakAssist)│   │
   │               │ Modbus / OPC-UA /      └──────────────────────────────┘   │
   │               │ EtherNet-IP                                              │
   │   ┌───────────┴──────────────────────────────────────────────────────┐  │
   │   │      PLCs · RTUs · instruments · (existing SCADA, if present)      │  │
   │   │      ── safety-rated control logic stays here, untouched ──        │  │
   │   └──────────────────────────────────────────────────────────────────┘  │
   └────────────────────────────────────────────────────────────────────────┘
```

**Telemetry flow (bottom to top):** PLCs/RTUs → **PeakLogic Hub** (acquire, buffer, edge-evaluate) → **PeakView360** renders live from the Hub over LAN → Hub forwards over **MQTT/TLS** to **PeakLogic cloud** → cloud ingests into the RLS multi-tenant model → AI/PdM/compliance run centrally → insights flow **back down** into PeakView360 next to the live values.

**Why this shape:** the operator is never blocked by the internet (Hub + PeakView360 stand alone on the LAN), the enterprise is never blind to a site (cloud sees all Hubs), and control safety is never our liability (the PLC keeps its interlocks).

---

## 4. Integration Strategy: bringing MooreView into PeakView360

Grounded in a hands-on evaluation of the live MooreView demo (v2.3.7): a single-plant SCADA/HMI with a 3D facility view, a 32-pen Historian with MongoDB archive and CSV/PDF export, tag-based Alarms with acknowledgement and notification users, an integrated CMMS (work orders + PM schedules + alarm-driven WOs), a PdM module (SCADA-tag-to-asset mapping, feature batching, health thresholds), a full CAD site-design tool (MV Draw, ~1,000 equipment symbols), PLC tooling (Program/Tags/Drivers/Connectivity), and a contextual Help system.

### 4.1 Disposition of MooreView features

| MooreView feature | Disposition | Where it lands | Rationale |
|---|---|---|---|
| Real-time operator screens (process values, equipment state) | **Preserve** | PeakView360 | Core value; already proven. Rebuild on our stack, keep the operator mental model. |
| Alarm management (limits, ack, notification users, ack-history) | **Preserve + modernize** | PeakView360 + PeakLogic | Keep the model; redesign the floating-window UI into a docked, responsive panel; route notifications through PeakLogic's existing alert path. |
| Historian trending (multi-pen, range, CSV/PDF export) | **Preserve + modernize** | PeakView360 (view) + PeakLogic (store) | Keep multi-pen trending; move the store from per-plant MongoDB to the multi-tenant cloud time-series so trends are cross-site and durable. |
| PdM / predictive maintenance (tag→asset, feature batch, health score) | **Modernize + centralize** | PeakLogic | Strong concept, but run it centrally across the fleet on our AI engine rather than per-plant. Absorb the asset-mapping UX. |
| CMMS (work orders, PM schedules, alarm-driven WOs) | **Preserve + redesign** | PeakLogic | We already have CMMS webhook connectors; MooreView proves the in-product WO/PM workflow. Build it natively, multi-tenant. |
| Facility visualization — 3D isometric plant view | **Redesign (demote to option)** | PeakView360 | Beautiful but built for one engineered plant. Default to fast 2D process schematics; keep 3D as an opt-in for sites that want it. |
| Contextual Help | **Preserve + elevate to first-class** | PeakAssist (see §6) | The single most operator-friendly thing MooreView does. We make it a named, offline-capable, cloud-synced product pillar. |
| Reporting + ROI calculator | **Preserve** | PeakLogic | Fits enterprise reporting and sales enablement directly. |
| MV Draw (CAD site-design, ~1,000 symbols) | **Defer / partner** | — | Impressive but a different product category (CAD). Not MVP. Revisit as a Phase-2 "site designer" or integration, not a core dependency. **Reconsideration (2026-07-26):** plant visualization is high-value and *not* in question — it's in scope as PV-5. What's deferred is the full freeform-CAD *authoring* tool. Recommend the pragmatic successor be a **component-based schematic builder** (place library symbols on a canvas, bind to `tags` → a live mimic; import SVG/P&ID/DEXPI), which delivers most of the value far sooner and cheaper than MV-Draw parity — prioritize it earlier than "Phase-2 CAD," with full CAD staying the later partner/build option. |
| PLC Tooling — Program / Tags / Drivers / Connectivity | **Redesign around zero-touch** | PeakLogic Hub | Low-level PLC config contradicts our zero-touch onboarding model. The Hub owns driver/connectivity config; expose it through guided setup, not a raw tag-programming surface. |
| Per-project save/deploy/share file lifecycle | **Retire** | — | This is a single-tenant desktop-era artifact. Our multi-tenant cloud model (config lives in the tenant's account, versioned server-side) is strictly better; do not replicate the file-based project lifecycle. |
| Camera administration | **Backlog** | PeakView360 | Nice-to-have; low priority for MVP. |

### 4.2 How operator workflows map into PeakView360

- **"Check my plant"** → operator opens PeakView360 (on the control-room screen or a phone), lands on the facility overview, sees live values and any active alarms. Sourced from the local Hub, so it works offline.
- **"An alarm fired"** → alarm surfaces in the docked alarm panel with the AI context attached ("Blower 2 amps high — anomaly score 0.82, consistent with bearing wear"); operator acknowledges; if configured, an alarm-driven work order is auto-created in the CMMS.
- **"Investigate a trend"** → operator opens the multi-pen historian, overlays pH/DO/flow over the last 24h/7d/30d, exports CSV for the compliance file.
- **"A technician needs to act"** → work order routes to the technician's mobile view (leveraging the existing route-based technician model), technician completes it, the record is audit-logged and available for compliance.
- **"Prove compliance"** → the compliance module compiles the period's monitored values, exceedances, and actions into a regulator-ready report automatically, backed by the immutable audit log.

### 4.3 Telemetry → insight loop

PLC/RTU → Hub (acquire + edge-evaluate + buffer) → PeakView360 (render live, LAN) → Hub store-and-forward → PeakLogic cloud (ingest into RLS model) → **AI anomaly + PdM + compliance run centrally** → insight pushed back to PeakView360 and into CMMS. The operator sees the *number* and the *meaning of the number* in the same place.

### 4.4 Alarms, trends, equipment views × AI

- **Alarms get AI context**: each active alarm carries an anomaly score and a plain-language "what this likely means," turning a raw limit breach into a diagnosis.
- **Trends get overlays**: the historian shows the AI's expected/normalized band behind the actual pen, so deviation is visible, not inferred.
- **Equipment views get health**: each asset dashboard shows a PdM health score and, where relevant, a predicted-failure horizon and a recommended action that one-clicks into a work order.

### 4.5 Unified authentication, roles, permissions

One identity fabric across all three layers, built on PeakLogic's existing model:

- **Identity provider:** Microsoft Entra ID (already in place) for cloud users; the Hub trusts short-lived tokens minted by the cloud and caches a credential for offline operation so an operator can still log into PeakView360 during an internet outage.
- **Three identity surfaces (already modeled):** tenant users (a facility's own operators), channel-partner users (service providers managing many tenants' sites), and internal PeakLogic staff (superadmin, support — audited act-as).
- **Roles:** Operator (view + acknowledge + operate permitted controls), Technician (work orders + field capture), Supervisor/Admin (config, alarm limits, user management), Compliance (reporting + audit read), plus the service-provider and staff roles above.
- **Enforcement:** database-level RLS in the cloud (a tenant physically cannot query another tenant's rows); the Hub enforces the same role scoping locally; every act-as session and privileged action is written to the immutable audit log. Permissions are defined once in the cloud and synced down to Hubs.

---

## 5. Feature Consolidation Roadmap

### 5.1 What PeakLogic already provides (don't rebuild)

Multi-tenant RLS data model · Entra auth · IoT telemetry ingest · device-silence/offline detection · AI Tier-1 anomaly detection · channel-partner white-label portal · immutable audit log · CMMS webhook connectors · Platform Control Center operator demo · the PeakLogicEdge Windows edge runtime.

### 5.2 Immediate migrations from MooreView (harvest first)

Real-time operator screens · alarm model (limits/ack/notify) · multi-pen historian trending · CMMS work-order + PM-schedule workflow · contextual Help content · ROI/reporting concepts.

### 5.3 Modernize / redesign

Alarm UI (floating window → docked responsive panel) · facility view (3D-default → 2D-schematic-default, 3D optional) · PdM (per-plant → fleet-central on our AI engine) · PLC tooling (raw tag config → guided Hub setup) · historian store (per-plant Mongo → multi-tenant cloud time-series).

### 5.4 New for a unified experience (net-new)

**PeakView360** as a product · **PeakLogic Hub** productization (harden PeakLogicEdge, add industrial protocol drivers) · dual-source (Hub-local + cloud) data rendering · AI-in-alarm context · compliance/DMR automation · **PeakAssist** first-class help system · unified cross-layer identity sync.

### 5.5 Phased plan

| Phase | Window | Scope |
|---|---|---|
| **MVP / Pilot** | 0–4 months | One reference facility (wastewater). PeakLogic Hub reading a PLC over Modbus/OPC-UA; PeakView360 v1 with live screens, docked alarms, and multi-pen trends rendering **both** Hub-local and cloud; cloud anomaly detection surfacing into alarms; basic CMMS work orders; **PeakAssist v1** contextual + offline; unified Entra login. Goal: prove the end-to-end loop at one site. |
| **Phase 1** | 4–9 months | PM schedules + alarm-driven work orders; PdM health scoring fleet-wide; compliance/DMR report automation; multi-site rollup dashboards; channel-partner (service-provider) onboarding of multiple sites; equipment dashboards with health scores. |
| **Phase 2** | 9–18 months | Optional 3D facility view; deeper protocol coverage (EtherNet/IP, DNP3); mobile technician app parity; advanced PdM (failure-horizon); site-designer (MV Draw-style) evaluation; camera/video integration. |
| **Long-term enterprise** | 18 months+ | Vertical expansion beyond water (food-service refrigeration, building systems); outcome-based/SLA contracts; marketplace of protocol drivers and compliance report templates; partner-built PeakView360 screen packs; regulatory-template library per jurisdiction. |

---

## 6. PeakAssist — the Help / Support system (first-class requirement)

**PeakAssist is a named product pillar, not a documentation afterthought.** It is the thing that makes an industrial platform usable by a small-town wastewater operator who is not a software person — and it is the most operator-friendly thing MooreView does. We elevate it.

### 6.1 Principles

- **Operator-friendly tone, always.** Plain language, short sentences, no jargon unless defined inline. Written for a person holding a wrench, not a keyboard.
- **One click from anywhere.** A persistent Help affordance on every screen in PeakView360 and every page in the cloud. Never more than one click, ever.
- **Contextual by default.** Opening Help on the Alarms screen opens alarm help *first*; opening it on a pump dashboard opens pump help first. The system knows what screen you're on and leads with it.
- **First-class in the roadmap.** PeakAssist v1 ships in the MVP, not later.

### 6.2 Content model

PeakAssist is a structured content system, not a PDF. Content types:

1. **Screen guides** — "What am I looking at?" for every screen, with the key controls called out.
2. **Step-by-step procedures** — numbered, task-oriented ("How to acknowledge an alarm," "How to create a work order," "How to pull a compliance report").
3. **Alarm explanations** — for every alarm type: what it means, likely causes, what to check, when to escalate. Deep-linked so an active alarm's "?" opens *that alarm's* explanation.
4. **Troubleshooting guides** — symptom → cause → resolution trees ("No live data on a screen" → check Hub status → check PLC link → ...).
5. **Workflow instructions** — end-to-end role playbooks (operator daily rounds, technician work-order completion, supervisor monthly compliance).
6. **Glossary** — inline definitions for every term of art (DO, ORP, MLE, DMR, RTU...).

### 6.3 Contextual behavior

Each PeakView360 screen and cloud page declares a **help context key**. The one-click Help button opens PeakAssist scoped to that key — the relevant screen guide, the procedures for that screen, and the alarm/equipment help for whatever is currently in view. A global search and a full browsable index are always one more click away. Active alarms and equipment cards carry their own inline "?" that deep-links straight to the specific explanation.

### 6.4 Offline + sync (the hard requirement)

- **Every PeakLogic Hub ships with a complete, bundled copy of PeakAssist.** During an internet outage, an operator on PeakView360 still has the *entire* help system — screen guides, procedures, alarm explanations, troubleshooting — served locally by the Hub. This is non-negotiable: help must never depend on the network, because the moment you most need troubleshooting help is often the moment connectivity is down.
- **Cloud is the source of truth; Hubs sync deltas.** PeakAssist content is authored and versioned in the cloud (the "PeakAssist CMS"). When a Hub has connectivity, it pulls content updates in the background. Each Hub knows its content version; the operator can see "Help content current as of ..." so stale content is visible, never silent.
- **Two audiences, one system.** SCADA/HMI users get PeakAssist inside PeakView360 (including offline via the Hub). Cloud users (supervisors, compliance, service providers) get the same content in the browser, always at latest. Same content model, two delivery surfaces.

### 6.5 Authoring & governance

Content lives in the repo/CMS as structured Markdown with a `help_context` key and a `version`, reviewed like code. This lets us keep the existing SysAdmin/User Guide material as the seed corpus and hold PeakAssist to the same "docs stay current every release" discipline already standing for PeakLogic. Nothing ships a new screen without its PeakAssist context entry — enforced, not aspirational.

---

## 7. Naming, positioning, messaging

### 7.1 Naming system

| Name | What it is | One-liner |
|---|---|---|
| **PeakLogic** | The company and the platform family. | "The intelligence layer for industrial operations." |
| **PeakLogicSystems** | The core cloud intelligence layer (the SaaS). | "The brain — multi-tenant monitoring, AI, compliance." |
| **PeakView360** | The unified HMI/SCADA operator experience. | "See everything at your facility — live." |
| **PeakLogic Hub** | The on-prem edge processing unit (a "Hub"; many are "Hubs"). | "The brainstem at your site — always on, even offline." |
| **PeakAssist** | The first-class contextual help/support system. | "Help on every screen, online or off." |

Naming conventions: the **Peak** prefix ties the family together. **PeakLogic** = the company/platform; **PeakLogicSystems** = the cloud/brain; **PeakView360** = see (360° facility visibility); **Hub** = the physical anchor; **PeakAssist** = help. Internal project codename: **Project Vantage**. Descriptive module names ("compliance reporting," "predictive maintenance") stay descriptive, not branded. Canonical source of record: [`../architecture/unified-platform-integration-plan.md`](../architecture/unified-platform-integration-plan.md) §1. *(Naming corrected 2026-07-25 — this doc originally used "PeakLogic" for the cloud pillar; the cloud layer is **PeakLogicSystems**, distinct from the company.)*

### 7.2 Explained three ways

**For a small-business owner (e.g. a wastewater operator, a service provider):**
> "PeakLogic watches your facility so you don't have to babysit it. A small box on-site (the Hub) reads your equipment and shows it to you on any screen — live — through PeakView360. If something's about to go wrong, you get told *before* it does, in plain English, with a step-by-step of what to do. It writes your compliance reports for you. And help is one tap away on every screen, even if the internet's down."

**For an industrial engineer:**
> "PeakLogic is a supervisory intelligence and operations layer above your existing control system — it does not touch your safety-rated PLC logic. PeakLogic Hubs acquire from PLCs/RTUs over Modbus/OPC-UA/EtherNet-IP, do edge buffering and local alarm evaluation, and store-and-forward over outbound-only MQTT/TLS. PeakView360 renders live from the Hub on the LAN (offline-capable) and historical/cross-site from the cloud. The cloud runs fleet-wide anomaly detection and predictive maintenance and pushes insights back into the operator alarm and equipment views. Multi-tenancy is enforced at the database with row-level security; identity is Entra ID; every privileged action is immutably audited."

**For an executive / investor:**
> "SCADA today is single-site, on-prem, and blind above the plant floor. PeakLogic is the multi-tenant cloud layer that unifies many facilities, adds AI, and automates the compliance work that operators are legally required to do and currently do by hand. We consolidate a proven single-plant product (MooreView) into a modern multi-site SaaS — harvesting years of validated operator UX rather than guessing at it. Two of our three product pillars already exist in code. We monetize on outcomes — uptime, avoided failures, compliance delivered — not seats, which aligns our revenue with the value we create and expands naturally as customers add sites."

### 7.3 Positioning line

> **PeakLogic — the operations intelligence layer above your SCADA. Not a rip-and-replace. A brain, a face, and a set of hands for facilities that never had them.**

---

## 8. Pricing strategy — value-based, facility-outcome-aligned

The principle: **price on facility-level outcomes, not seats.** Seat-based pricing punishes the multi-operator control room and caps expansion; outcome/site-based pricing aligns our revenue with customer value and scales as customers add facilities.

### 8.1 Model

- **Base unit = the facility (site).** A subscription is per active facility, which includes its Hub, unlimited operator seats on-site, PeakView360, PeakAssist, and baseline monitoring/alarms. Unlimited seats is deliberate — we want every operator using it.
- **Tiers layered on the facility:**

| Tier | Includes | For |
|---|---|---|
| **Monitor** | Hub + PeakView360 + alarms + historian + PeakAssist + basic cloud dashboard | Small single-site operators |
| **Intelligence** | + AI anomaly detection, predictive maintenance, CMMS work orders/PM | Sites wanting to prevent failures, not just watch them |
| **Compliance** | + automated regulatory reporting (DMR etc.), audit exports, retention SLAs | Regulated facilities (the wedge) |
| **Enterprise / Multi-site** | + cross-facility rollups, channel-partner/service-provider management, API, SSO, custom report templates, SLAs | Service providers and multi-site owners |

- **Outcome-aligned add-ons (long-term):** SLA-backed uptime guarantees, and for service providers, revenue-share or per-avoided-truck-roll models where the platform's AI/PdM demonstrably reduces field visits. These are the "outcome-based pricing" the strategy calls for — introduced once we have the failure-prevention data to stand behind them.

- **Hardware:** the Hub is sold or leased at/near cost, or bundled into the subscription — it is a customer-acquisition and lock-in asset, not a margin center. Recurring software revenue is the model.

### 8.2 Why this wins

Service providers (a primary target) manage many small customer sites; per-facility pricing lets them onboard sites profitably and our revenue grows with their book of business — which the channel-partner portal already models. Compliance-heavy facilities will pay for the Compliance tier because the alternative is manual regulatory risk. And unlimited on-site seats removes the single biggest adoption objection in a control room.

---

## 9. Risks & mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| **Scope explosion** — trying to absorb *all* of MooreView (CAD, PLC programming) | Dilutes MVP, delays pilot | Ruthless disposition table (§4.1): harvest the operator surface, defer/retire the rest. MV Draw and raw PLC tooling are explicitly out of MVP. |
| **"You're replacing our SCADA / touching our safety system"** objection | Kills enterprise deals | Positioning is explicit and repeated: PeakLogic sits *above* control; PLC safety logic is never touched; PeakView360 is supervisory (or primary only for greenfield). |
| **Offline reliability under-delivered** | Operators lose trust the first outage | Hub-local rendering + bundled offline PeakAssist are MVP requirements, not Phase 2. Test with the internet physically unplugged during the pilot. |
| **Industrial protocol integration is hard/slow** | Pilot slips | Start the pilot on one well-understood protocol (Modbus TCP or OPC-UA); expand coverage in Phase 2. Don't gate MVP on breadth. |
| **Merger terms shift the foundation** | This whole PeakLogic-first plan is invalidated | This document is explicitly the artifact to revise if that happens (see supersession note). Keep the commercialization roadmap's vendor-neutral version as the fallback framing. |
| **Compliance claims carry regulatory liability** | Legal exposure if a generated report is wrong | Position compliance automation as *assisting* the operator's filing (operator remains the filer of record), with the immutable audit trail as evidence — not as assuming regulatory responsibility. Legal review before the Compliance tier ships. |
| **AI surfaces false positives** | Alarm fatigue, lost trust | Ship AI insight as *context on* alarms, not as new standalone alarms, in MVP; tune on real pilot data before letting AI raise alarms of its own. |
| **Two codebases/teams post-merger** | Duplicated effort, integration drag | The disposition table doubles as a migration plan: MooreView is a capability source, not a parallel stack to maintain. Sunset the single-tenant project-file lifecycle early. |

---

## 10. Recommended next steps for the pilot

1. **Pick one reference facility.** A single wastewater site (ideally one MooreView already understands, to reuse domain modeling) as the pilot. One site, one protocol, end-to-end.
2. **Harden PeakLogicEdge into PeakLogic Hub v0.** Add one industrial driver (Modbus TCP or OPC-UA), local historian buffer, edge alarm evaluation, and the bundled offline PeakAssist store. This is an evolution of code that exists, not a new build.
3. **Build PeakView360 v1.** Live operator screen(s), docked alarm panel, multi-pen historian — rendering **both** Hub-local (LAN) and cloud. This is the net-new focus; harvest MooreView's screen/alarm/trend UX directly.
4. **Wire the intelligence loop.** Point the existing AI Tier-1 anomaly engine at the pilot site's telemetry and surface its output as context inside PeakView360 alarms.
5. **Ship PeakAssist v1.** Contextual, one-click, offline-via-Hub, cloud-synced — seeded from the existing SysAdmin/User Guides. Non-negotiable for the pilot.
6. **Unify login.** Entra ID across cloud and PeakView360, with the Hub's offline-credential path proven by unplugging the internet.
7. **Prove three things at the pilot, explicitly:** (a) the operator screen works with the internet unplugged; (b) an AI anomaly surfaces on the operator's alarm before a human noticed; (c) a compliance-relevant report is generated automatically from the period's data. Those three demos *are* the pilot's success criteria and the investor story.
8. **Formalize this document** through the project's standard Draft → Approved review, and revise the affected memory/roadmap so the PeakLogic-first decision is the recorded direction.

---

## Revision history

| Version | Date | Author | Notes |
|---|---|---|---|
| Draft v0.1 | 2026-07-24 | PeakLogic | Initial unified product vision. PeakLogic-first strategy; grounded in a hands-on MooreView v2.3.7 evaluation and the current PeakLogic-Azure codebase. Supersedes the vendor-neutral framing of the Platform Commercialization Roadmap for planning purposes. |
