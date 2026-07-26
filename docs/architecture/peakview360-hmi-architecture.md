# PeakView360 — HMI/SCADA Architecture

**Company:** PeakLogic  ·  **Project codename:** Project Vantage
**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Status:** 🟡 Draft v0.1 (2026-07-25) — net-new design artifact (Phase 3 of `unified-platform-integration-plan.md`)
**Depends on:** [PRD](prd.md) §5.18 · [SRS](srs.md) §3.20 · [Domain Model](domain-model.md) §2.10 · [Database Schema](database-schema.md) §4.8 · [Target Reference Architecture](target-reference-architecture.md) · [PeakLogic Hubs (Windows Endpoint)](windows-endpoint-application.md) · [PeakAssist](peakassist-help-system-architecture.md)
**Design target (clickable):** [`prototypes/super-console-demo.html`](prototypes/super-console-demo.html) — the PeakView360 operator view

---

## 0. Thesis

**PeakView360 is the operator's face of the platform — a modern HMI/SCADA layer that visualizes and supervises, but never controls.** It absorbs MooreView's proven single-plant operator surface (real-time screens, alarms, historian, facility view) and re-hosts it on PeakLogicSystems' multi-tenant data plane, adding the one thing single-plant SCADA cannot do: the same screen renders **live from the on-site Hub over the LAN** (offline-capable) *and* **historical/cross-site from the cloud** — one UI, two data sources, transparent to the operator.

**Hard boundary (load-bearing, repeated everywhere):** PeakView360 is HMI/visualization/supervisory only. It never implements, assumes, or depends on safety-rated control logic, hardware interlocks, or emergency-shutdown functions — those stay in the plant's certified control system. PeakLogic sits **above** SCADA.

---

## 1. Scope

**In:** operator screens, alarm management, equipment dashboards, facility visualization, multi-pen historian, dual-source rendering, the supervisory/primary-HMI deployment split.
**Out (owned elsewhere):** the data plane and RLS (PeakLogicSystems), edge acquisition and offline serving (PeakLogic Hubs), contextual help (PeakAssist), safety-rated control (the plant's PLC/SCADA), MooreView's CAD tool (MV Draw) and raw PLC-tag programming (retired/deferred, unified-vision §4).

## 2. What already exists to build on

- **Data:** the `alerts` pipeline (`createAlertAndMaybeTicket`), `telemetry`/`telemetry_hourly`, `assets`/`devices` — all RLS-scoped. **Alarms are the existing `Alert`; a PeakView360 alarm panel is a projection over it, not a new store** (Domain Model §2.10).
- **Config schema (shipped as migration `1784142060000`):** `hmi_screens` (per-site operator screens + `help_context_key`), `tags` (the source→canonical-metric map = the Telemetry Normalization Fabric as a row), `historian_pens` (saved multi-pen trends).
- **Design target:** the clickable prototype's PeakView360 view (process tiles, docked alarm panel with AI insight + per-alarm help deep-link, multi-pen historian) — the validated UX.
- **AI context:** AI Tier-1 anomaly findings (`ai_findings`) attach to alarms; PeakView360 surfaces the score/explanation beside the live value (design target shown in the prototype).

## 3. Architecture

### 3.1 Dual-source rendering (the defining decision)
A PeakView360 client resolves each data need to one of two sources, transparently:
- **Live process values + local alarm state → the on-site Hub over the LAN.** Low-latency, and it **keeps working with the internet down** (HUB-4 / PV-6). The Hub serves the screen's current `tag` values and locally-evaluated alarms.
- **History, cross-site, and fleet views → PeakLogicSystems (cloud).** The historian reads `telemetry`/`telemetry_hourly`; cross-site/fleet rollups come from the RLS data plane.
The screen definition (`hmi_screens.layout`) and tag set (`tags`) are authored in the cloud and cached on the Hub, so the two sources render the **same** screen.

### 3.2 The five surfaces
1. **Real-time operator screen** — process-value tiles per `tag`, equipment state (running/fault/offline), refreshed live from the Hub (PV-1).
2. **Alarm management** — a docked, responsive panel over the existing `alerts` (acknowledge, history, notification routing); each alarm carries its AI/threshold context and a one-click **PeakAssist** deep-link to that alarm type's explanation (PV-2, PA-3). MooreView's floating-window pattern is redesigned to docked.
3. **Equipment dashboard** — per-asset: live telemetry + trend + (Intelligence tier) a PdM health score and a recommended action that one-clicks into a CMMS work order (PV-4).
4. **Facility visualization** — a fast **2D process schematic by default**; the existing 3D rendering (#5.15) is an opt-in mode, not the default (MooreView's 3D-default demoted) (PV-5).
5. **Historian** — multi-pen trend (`historian_pens`) over `telemetry`, range 24h/7d/30d/custom, CSV export (PV-3).

### 3.3 Deployment split
- **Primary HMI** — for greenfield/small sites with no existing SCADA, PeakView360 is the operator's main screen.
- **Supervisory layer** — for brownfield plants that keep their control system, PeakView360 sits alongside it (read-and-supervise), never replacing it. Same data model either way (PV-8).

### 3.4 Client & identity
PeakView360 is a client app (browser/kiosk; the Hub serves it locally). Auth is Entra ID (PeakLogicCustomers directory for tenant operators); the Hub caches a short-lived credential so an operator can still sign in during an internet outage (Security Architecture, Hub offline-credential path). Every screen declares a `help_context_key` (PeakAssist, PA-7) — enforced, no screen ships without one.

## 4. Multi-tenancy & isolation
`hmi_screens`, `tags`, `historian_pens` are tenant-scoped with the standard `tenant_isolation` RLS. A PeakView360 client only ever sees its own tenant's screens/tags/telemetry — same guarantee as the rest of the platform; no new cross-tenant path is introduced.

## 5. Honesty ledger (real vs. design)
- **Real today:** the `alerts`/`telemetry` data, the config schema (`hmi_screens`/`tags`/`historian_pens`), the clickable UX design target, and — new 2026-07-26 — the **PeakView360 operator SPA first slice** (`peakview360/`, React+Vite+Tailwind sibling app, build-verified): the real-time **operator screen** (PV-1, live process-value tiles + equipment state) and the docked **alarm panel** (PV-2, severity rail + acknowledge + AI/threshold context + PeakAssist deep-link), with user-toggled theme and the dual-source "Live · Hub (LAN)" indicator. Runs in **PREVIEW mode** against a coherent live simulation (alarms derived from live values, auto-clearing; one sensor offline) — clearly badged so preview data is never mistaken for a real fleet.
- **Design-stage (not built):** the remaining three surfaces (Historian PV-3, Equipment dashboard PV-4, Facility viz PV-5 — honest placeholders in the SPA); the Hub-local live-serving path + real dual-source resolution (wire to `GET /v1/hmi-screens|tags|alerts|telemetry` + the Hub LAN feed once `VITE_API_URL`/infra exists); the kiosk packaging; the equipment-dashboard PdM health score (depends on AI Tier 2).
- **Deliberately not built:** MooreView's CAD tool and raw PLC-tag programming (unified-vision §4).

## 6. Open questions
1. **Client tech + host** — SPA vs. kiosk shell; exact Hub-local serving mechanism (the Hub is the PeakLogic Hubs / Windows-endpoint pillar).
2. **Live transport** — how the Hub pushes live `tag` values to the client on the LAN (websocket vs. poll) and how that path degrades to cloud when off-LAN.
3. **3D** — file format/rendering remain deferred (Domain Model §6.7), unchanged here.

## 7. Revision history
| Version | Date | Notes |
|---|---|---|
| Draft v0.1 | 2026-07-25 | Initial PeakView360 HMI/SCADA architecture — consolidates PRD §5.18 / SRS §3.20 / Domain Model §2.10 / schema §4.8 / the prototype into one design. Dual-source rendering, five surfaces, supervisory-not-control boundary. Client app design-stage. |
