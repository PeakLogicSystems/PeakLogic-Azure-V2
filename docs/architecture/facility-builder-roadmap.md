# Facility Builder & Facility View — Roadmap

**Company:** PeakLogic  ·  **Project codename:** Project Vantage
**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Status:** 🟡 Draft v0.1 (2026-07-26) — roadmap; a first slice of the **Facility View** is built
**Supersedes the framing of:** the "MV Draw retired" note (it was **deferred**, not retired — corrected). Reconsiders MooreView's plant-visualization capability as a platform feature.
**Depends on / reconciles with:** [PeakView360 HMI](peakview360-hmi-architecture.md) §3.2 PV-5 · [Unified Product Vision](../business/unified-product-vision.md) §4 (MooreView disposition) · [Domain Model](domain-model.md) §2.10 (`hmi_screens`/`tags`) · [Purple Standard merger](../business/unified-product-vision.md)
**Implementation (first slice):** [`peakview360/src/screens/FacilityView.tsx`](../../peakview360/src/screens/FacilityView.tsx) + `data/facility.ts`

---

## 0. Two things, named

| Name | What it is | Audience | Status |
|---|---|---|---|
| **Facility Builder** | The **authoring** tool — lay out the plant, place equipment/symbols, and **bind them to `tags`** so the drawing becomes a live mimic. | Setup / integrator / channel partner | **Roadmapped** (this doc) |
| **Facility View** | The **rendered, interactive plant view** shown on the site dashboard once a facility is saved — isometric by default, with Top/Front/Side, rotation, and locate-sensors-by-type. | Operator | **First slice BUILT** (2026-07-26) |

The Facility Builder *produces* the model; the Facility View *renders* it. This is the pragmatic successor to MooreView's **MV Draw** (a full ~1,000-symbol CAD tool) — deliver the visualization value now, integrate and modernize MooreView's code rather than rebuild from scratch.

## 1. Positioning (decided with the user, 2026-07-26)

- **Facility Builder is step 1 of site setup** — but **optional and bypassable.** A site runs fine without a facility model (the operator screen, alarms, historian, equipment dashboard all work regardless).
- **The site dashboard surfaces it contextually:** a site *with* a saved facility shows the **Facility View**; a site *without* one shows a "Build your facility" prompt (with a skip). (The Facility View's empty state already implements this.)
- **A nice-to-have that becomes a differentiator.** For channel partners it's a value-add they can offer/sell (build a customer's plant view as a service); at the platform level, a modern browser-native, multi-tenant, live plant view is a **true feature differentiator** vs. single-plant desktop SCADA.

## 2. The Facility View experience (target = MooreView plant-view parity, modernized)

Replicate what MooreView's plant view does, then modernize:
- **Isometric scene by default** — the plant as a 3D-ish isometric model with equipment and pipes.
- **Top / Front / Side** orthographic views (the MooreView view functions), plus **rotation**.
- **Locate live sensors by type** (flow / level / pressure / chemistry / temperature / power) — highlight sensors of a type across the plant, with their live values.
- **Live state + values** on equipment (running/fault/offline), fed by the dual-source model (live from the Hub, §3.1).
- **Modernizations over MooreView:** browser-native (not desktop), multi-tenant/cloud, responsive (phone-to-control-room), dark/light — and the 2D process-schematic remains available as the fast default for engineered vs. simple sites (PV-5).

**Built now (first slice):** all of the above **as a lightweight SVG projection** — iso + top/front/side + rotate + locate-by-type + live values, no 3D engine. It is preview-data and clearly labeled. It proves the UX and the data binding; it is not yet photoreal 3D.

## 3. Phased roadmap

| Phase | Deliverable | Notes |
|---|---|---|
| **P0 — now (done)** | **Facility View first slice** (SVG iso/ortho projection + sensor-locate + live values + empty-state → Facility Builder CTA) | Proves the experience + tag-binding UX on real contracts; `peakview360/`. |
| **P1 — MooreView code evaluation & harvest** | Get MooreView's code (post-merger); evaluate its **plant-view renderer** and **~1,000-symbol library**; decide harvest vs. reference-rebuild. | The merger's whole point — integrate, don't reinvent. Gate: what's reusable in a browser/multi-tenant context. |
| **P2 — Facility Builder (authoring), modernized** | A **component-based schematic/plant builder**: place library symbols on a canvas, **bind to `tags`**, arrange in 2D/iso; **import** existing drawings (SVG / P&ID / DEXPI / DWG) so customers reuse. Multi-tenant, browser, server-versioned. | The real authoring tool. Modernizes MV Draw; retires its single-plant per-project file lifecycle (our server-versioned config supersedes it). |
| **P3 — full-fidelity 3D** | WebGL/three.js renderer, free orbit, richer models; 3D as an opt-in for engineered sites. | The photoreal end state; 2D/iso stays the fast default. |

**Guiding principle:** deliver operator-visualization *value* early (P0/P2 schematic + iso), keep full freeform CAD / photoreal 3D as later phases — most value at a fraction of the cost, sooner.

## 4. Data model implication (design-stage)

A saved facility is a **scene**: units (equipment) with position/footprint/height, pipes, and each unit's **`tags` bindings** + sensor placements. Candidate persistence: extend `hmi_screens.layout` (JSON) for simple cases, or a dedicated `facilities` / `facility_units` table for richer scenes — decide at build time (D3). It is **tenant-scoped** like all screen config, and it is what the Facility View reads. The Facility Builder writes it; the Hub caches it so the Facility View renders offline on the LAN (dual-source, §3.1).

## 5. MooreView integration & disposition (refines unified-vision §4)

- **Harvest:** the plant-view **renderer** and the **equipment symbol library** (~1,000 symbols) — the expensive, proven assets.
- **Modernize:** single-plant desktop → multi-tenant browser + cloud; per-project file lifecycle → server-versioned tenant config; 3D-default → iso/2D-default with 3D opt-in.
- **Retire:** raw PLC-tag programming (guided Hub setup supersedes it); the per-project save/deploy/share file model.

## 6. Honesty ledger (real vs. design)

- **Built (2026-07-26):** the **Facility View first slice** — isometric + Top/Front/Side + rotation + locate-sensors-by-type + live state/values + empty-state Facility-Builder CTA, as an SVG projection (no 3D engine), build-verified in `peakview360/`. Preview data, clearly labeled.
- **Design-stage / roadmapped:** the **Facility Builder** authoring tool (P2); MooreView code harvest (P1, blocked on having the code post-merger); full 3D (P3); the persistence schema (§4); real tag-binding to live telemetry (infra-gated).
- **Not reinvented:** the intent is to integrate + modernize MooreView's proven renderer/symbols, not rebuild a CAD tool from scratch.

## 7. Open decisions

- **D1:** P1 harvest scope — how much of MooreView's renderer/symbol library ports to a browser/multi-tenant context (needs the code).
- **D2:** authoring model — component/symbol placement + tag-binding vs. how much freeform drawing; and which import formats (SVG / P&ID / DEXPI / DWG) to support first.
- **D3:** persistence — `hmi_screens.layout` JSON vs. a dedicated `facilities`/`facility_units` schema.
- **D4:** 3D engine choice for P3 (three.js / Babylon) — deferred until P2 lands.
- **D5:** channel-partner packaging — is Facility Builder a partner-tier / add-on capability, and how is it surfaced/priced.

## 8. Revision history

| Version | Date | Change |
|---|---|---|
| Draft v0.1 | 2026-07-26 | Establishes the Facility Builder (authoring, roadmapped) vs. Facility View (rendered plant view, first slice built). Corrects "MV Draw retired" → deferred; reconsiders it as a platform differentiator. Positioning (setup step 1, optional/bypassable, dashboard-surfaced, partner value-add), the MooreView-parity target experience, a 4-phase roadmap (P0 built SVG slice → P1 MooreView harvest → P2 modernized Facility Builder → P3 full 3D), data-model + disposition + open decisions. |
