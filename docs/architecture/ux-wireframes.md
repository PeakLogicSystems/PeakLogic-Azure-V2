# UX Wireframes

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1.1 (amended — see Revision History, end of document)
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.3), [SRS](srs.md) (approved v1.3), [Domain Model](domain-model.md) (approved v1), [User Personas](user-personas.md) (approved v1), [User Stories](user-stories.md) (approved v1)
**Last updated:** 2026-07-04

---

## 1. Introduction

### 1.1 Purpose

User Stories says what a persona needs to accomplish; this document sketches the actual screens that accomplish it — concrete enough for engineering to build against and for Information Architecture (#9) to organize into a real navigation structure. **These are structural/content wireframes (ASCII layout + annotations), not high-fidelity visual designs** — pixel-level styling, spacing, and visual design system are downstream of this document, not decided here. Every screen element is annotated with the requirement ID it satisfies.

### 1.2 Scope

In scope: screen-level layout and content for every screen implied by User Stories §2–§3. Out of scope: navigation structure/information hierarchy across screens (→ Information Architecture, #9), visual design system (colors, typography, spacing — not an architecture artifact at all), and exact API payloads driving each screen (→ API Specification, #11).

### 1.3 Screen Inventory

| Screen | Primary persona(s) | Key requirement(s) |
|---|---|---|
| 2.1 Portfolio Roll-Up | Corporate/Regional Ops Leader, Small Business Owner-Operator | RP-1.1 |
| 2.2 Route View | Route-Based Service Technician | RP-2.1 |
| 2.3 Add Device Flow | Site-Level Facility Operator | UX-1.1 |
| 2.4 Site Detail | All Tenant-side personas | UX-2.1, UX-3.1 |
| 2.5 Alert Detail | Site-Level Facility Operator, Field Service Partner | AL-1.1, AI-3.2 |
| 2.6 Service Ticket (Field Service Partner view) | Field Service Partner | AL-2.1 |
| 2.7 Settings — Alert Sensitivity | Small Business Owner-Operator, Tenant Admin | AI-3.3 |
| 2.8 Settings — Channel Partner Attribution | Small Business Owner-Operator, Channel Partner | CH-1.1, CH-2.1 |
| 2.9 Sites Directory *(added v1.1)* | Small Business Owner-Operator | RP-4.1 |

---

## 2. Wireframes

### 2.1 Portfolio Roll-Up (RP-1.1)

```
┌─────────────────────────────────────────────────────────────┐
│  PeakView                                    [Priya ▾]      │
├─────────────────────────────────────────────────────────────┤
│  Portfolio Overview                    12 sites · 3 need attention │
├─────────────────────────────────────────────────────────────┤
│  ⚠ TRENDING (2)                     — AI-3.2 `trend` type    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Lakeside Pool Route — Stop 4        pH drifting low    │  │
│  │ Riverside QSR #12                   Cooler 2 warming   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  🔴 IN ALARM (1)                    — AL-1.1 `threshold` type│
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Northside Pump Station              Pressure critical  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ✅ HEALTHY (9)                          [ collapsed ▾ ]     │
└─────────────────────────────────────────────────────────────┘
```
- The **Trending** and **In Alarm** sections are visually and structurally separate, per RP-1.1's v1.2 amendment — never merged into one "needs attention" bucket.
- Healthy sites are collapsed by default — a portfolio-scale view (US-1) shouldn't force scrolling past everything that's fine to find what isn't.

### 2.2 Route View (RP-2.1)

```
┌─────────────────────────────────────────────────────────────┐
│  PeakView                                    [Marcus ▾]     │
├─────────────────────────────────────────────────────────────┤
│  Today's Route — 6 stops                                    │
├─────────────────────────────────────────────────────────────┤
│  1. Lakeside Pool Route — Stop 4          ⚠ Check first     │
│     pH: 6.8 (target 7.4)   Chlorine: 1.2 ppm   Temp: 81°F   │  ← SN-4.1 readings, per RP-2.1
│                                                               │
│  2. Harbor View Pool                       ✅ Healthy        │
│     pH: 7.4   Chlorine: 2.1 ppm   Temp: 79°F                 │
│                                                               │
│  3. Oakwood Community Pool                 ✅ Healthy        │
│     ...                                                       │
├─────────────────────────────────────────────────────────────┤
│  Stops re-sorted automatically as conditions change today.   │
└─────────────────────────────────────────────────────────────┘
```
- Stop 1 is surfaced first because it's trending, per RP-2.1's urgency ranking — not because it's the first geographically.
- Each stop shows the actual reading values (US-11), not just a status badge — Marcus needs to know *what's* wrong before he arrives, per the confirmed PRD v1.2 requirement.

### 2.3 Add Device Flow (UX-1.1)

Benchmarked explicitly against the Alexa/Smart Home anti-example (Vision §9/§11) — target: 3 steps, no jargon.

```
Step 1 of 3            Step 2 of 3            Step 3 of 3
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ Scan or enter │  →    │ What is it?   │  →    │ Where is it?  │
│ device code   │       │ [Cooler]      │       │ [Site: pick]  │
│               │       │ [Pool pump]   │       │               │
│ [PLG-0042]    │       │ [Gas sensor]  │       │ [Asset: pick  │
│               │       │ [Leak sensor] │       │  or "New"]    │
│               │       │ [Other...]    │       │               │
└──────────────┘       └──────────────┘       └──────────────┘
                                                       ↓
                                            "Cooler 2 is now
                                             monitoring. ✅"
```
- No mention of tenants, assets, adapters, categories, or thing names — the words Denise's persona (User Personas §2.3) would never use. "What is it?" maps internally to `assets.category` (DA-1.1); the operator never sees that word.
- Step count and required-field count here (3 screens, 2 required inputs beyond the code) is the concrete number UX-1.1 requires be measured against the Alexa/Smart Home baseline — not assumed acceptable by default.

### 2.4 Site Detail (UX-2.1, UX-3.1)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Portfolio        Riverside QSR #12                        │
├─────────────────────────────────────────────────────────────┤
│  Status: ⚠ Trending      Last seen: 2 min ago                │
├─────────────────────────────────────────────────────────────┤
│  Assets                                                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Cooler 2            ⚠ 41°F, rising    [refrigeration]  │  │
│  │ Cooler 1             ✅ 38°F           [refrigeration]  │  │
│  │ Kitchen Gas Line     ✅ No leak        [gas_sensor]     │  │
│  │ Energy Meter         ✅ 4.2 kW         [energy_meter]   │  │
│  └───────────────────────────────────────────────────────┘  │
│  [+ Add device]                                               │
└─────────────────────────────────────────────────────────────┘
```
- Surfaces health status, last-seen, and per-asset readings without requiring the viewer to separately query tenant/asset/device relationships (UX-2.1) — this is the real screen `Assets.tsx`/`Devices.tsx`/`Sites.tsx` need to be reconciled toward from mock data (UX-3.1).

### 2.5 Alert Detail (AL-1.1, AI-3.2)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Site: Riverside QSR #12                                    │
├─────────────────────────────────────────────────────────────┤
│  ⚠ TRENDING — Cooler 2 product temperature rising              │
│                                                                 │
│  Current: 41°F   FDA limit: 41°F   Trend: +0.3°F/hr            │
│  Type: trend  (not yet over threshold — this is a               │
│  rate-of-change flag, distinct from a threshold alert)          │
│                                                                 │
│  [ Acknowledge ]   [ Dismiss ]   [ Create service ticket ]      │
└─────────────────────────────────────────────────────────────┘
```
- Explicitly labels the alert `type` (`trend` vs `threshold`, AI-3.2) in plain language, not just a severity color — this is what lets Denise's persona understand "why am I seeing this if the number hasn't crossed the line yet."

### 2.6 Service Ticket — Field Service Partner View (AL-2.1)

```
┌─────────────────────────────────────────────────────────────┐
│  Ticket #4821 — Emergency                                     │
├─────────────────────────────────────────────────────────────┤
│  Asset: Cooler 2 (Riverside QSR #12)                           │
│  Issue: Product temperature critically high (52°F, limit 41°F)│
│  Trend: rising for 3 hours before threshold was crossed        │
│  Site address: [address]                                       │
│                                                                 │
│  [ Accept ]   [ Update status ▾ ]                               │
└─────────────────────────────────────────────────────────────┘
```
- No login/dashboard access implied — Tom's persona (User Personas §2.5) needs exactly this much context and nothing more, per AL-2.1's existing scope.

### 2.7 Settings — Alert Sensitivity (AI-3.3)

```
┌─────────────────────────────────────────────────────────────┐
│  Settings → Alert Sensitivity                                 │
├─────────────────────────────────────────────────────────────┤
│  Refrigeration           Sensitivity: [Low  Med  High]         │
│  Pool Chemistry          Sensitivity: [Low  Med  High]         │
│  Gas Detection           (always High — no tuning, US-9 boundary)│
│  Energy / Electrical     Sensitivity: [Low  Med  High]          │
└─────────────────────────────────────────────────────────────┘
```
- Per-adapter/category tuning (AI-3.3), not a single global slider — matches the requirement's "at minimum per adapter/category" wording exactly.
- Gas detection is deliberately not tunable — a binary leak trigger (SN-5.1) has no "sensitivity," it's a safety signal, not a statistical baseline.

### 2.8 Settings — Channel Partner Attribution (CH-1.1, CH-2.1)

```
┌─────────────────────────────────────────────────────────────┐
│  Settings → Channel Partner                                   │
├─────────────────────────────────────────────────────────────┤
│  Referred by: [AquaChem Supply Co.  ▾]                         │
│                                                                 │
│  [ View attribution report ]  — for AquaChem's own reconciliation│
└─────────────────────────────────────────────────────────────┘
```
- Minimal by design (CH-3.1 defers anything more) — a single field and a report link, not a portal.

### 2.9 Sites Directory (RP-4.1) *(added v1.1)*

```
┌─────────────────────────────────────────────────────────────┐
│  Sites                                        [+ Add site]   │
├─────────────────────────────────────────────────────────────┤
│  Sort: [City ▾]      State: [All ▾]              7 sites     │
├─────────────────────────────────────────────────────────────┤
│  Name                     Address                    Status  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Riverside Pump Station  123 Main St, Houston, TX  ✅   │  │
│  │ QSR — Downtown Branch   45 Congress Ave, Austin, TX ⚠  │  │
│  │ Lakewood Pool Complex   900 Lake Dr, Dallas, TX    ✅   │  │
│  │ ...                                                      │  │
│  └───────────────────────────────────────────────────────┘  │
│  Row click → Site Detail (§2.4)                               │
└─────────────────────────────────────────────────────────────┘
```
- A plain, sortable/filterable **lookup** by address/city/state (RP-4.1) — deliberately not a risk/health triage view like Portfolio Roll-Up (§2.1); the two screens answer different questions ("where is our site in Austin" vs. "which sites need attention") and are not meant to be merged into one.
- Reconciles the existing `frontend/src/pages/Sites.tsx` reference screen, which shows only a combined "city, state" string with no street address and no sort/filter — this wireframe is what that screen needs to be rebuilt toward once it's wired to the real API (RP-4.1), not new-from-nothing functionality.

---

## 3. Open Questions Surfaced While Wireframing

1. **Alert-detail language for a `trend` alert (§2.5)** needs real product-writing/UX-copy work to land as genuinely plain-language for a non-technical operator — "rate-of-change flag" as shown here is placeholder engineering language, not what should actually ship.
2. **§2.1's "collapsed by default" healthy-sites behavior** isn't yet a stated requirement anywhere (RP-1.1 says the view must separate trend/alarm, but doesn't say healthy sites collapse) — a reasonable UX default, not something to treat as already required.

---

## 4. Traceability

Every wireframe above cites the requirement ID(s) it satisfies inline in its annotations — no separate matrix needed given the screen count at this stage.

---

## 5. Review Log

Draft v0.1 — no review conducted yet.

---

## Revision History

**v1.1 (2026-07-04)** — forced by the Information Architecture artifact (#9) and the PRD/SRS's own v1.3 amendments, per this document's rule (§4) that a downstream artifact surfacing a needed change must amend this document explicitly rather than silently diverging from it.

- **§2.9 added (Sites Directory)**: elaborates the PRD/SRS's new RP-4/RP-4.1 — a plain, address-sortable site lookup, distinct from §2.1's risk/health roll-up — needed once Information Architecture found no wireframed screen backing its "Sites" navigation item.
