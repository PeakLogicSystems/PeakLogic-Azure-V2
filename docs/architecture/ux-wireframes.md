# UX Wireframes

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1.3
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.5), [SRS](srs.md) (approved v1.5), [Domain Model](domain-model.md) (approved v1.1), [User Personas](user-personas.md) (approved v1.2), [User Stories](user-stories.md) (approved v1), [API Specification](api-specification.md) (approved v1.1)
**Last updated:** 2026-07-11

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
| 2.8 Settings — Your Supplier *(revised v1.2)* | Small Business Owner-Operator | CH-1.1, CH-1.2 |
| 2.9 Sites Directory *(added v1.1)* | Small Business Owner-Operator | RP-4.1 |
| 2.10 Attribution Report — Channel Partner View *(added v1.2)* | Channel Partner | CH-2.1 |
| 2.11 Partner Portal Login *(added v1.3)* | Channel Partner Portal Dispatcher, Route-Based Service Technician | CH-3, Security Architecture §2.4 |
| 2.12 Territory Map Editor *(added v1.3)* | Channel Partner Portal Dispatcher | TR-1.1 |
| 2.13 Technician Management *(added v1.3)* | Channel Partner Portal Dispatcher | Domain Model §4 decision 8 |
| 2.14 Daily Dispatch Route — Dispatcher View *(added v1.3)* | Channel Partner Portal Dispatcher | TR-2.1, TR-3.1, TR-3.2 |
| 2.15 Daily Dispatch Route — Technician View *(added v1.3)* | Route-Based Service Technician | TR-2.1, RP-2.1 (channel-partner-technician case) |

---

## 2. Wireframes

### 2.1 Portfolio Roll-Up (RP-1.1)

```
┌─────────────────────────────────────────────────────────────┐
│  PeakView                                 [Ops Leader 1 ▾]  │
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
│  PeakView                                 [Technician 1 ▾]  │
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
- Each stop shows the actual reading values (US-11), not just a status badge — the technician needs to know *what's* wrong before they arrive, per the confirmed PRD v1.2 requirement.

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

### 2.8 Settings — Your Supplier (CH-1.1, CH-1.2) *(revised v1.2)*

```
┌─────────────────────────────────────────────────────────────┐
│  Settings → Your Supplier                                      │
├─────────────────────────────────────────────────────────────┤
│  Supplier: AquaChem Supply Co.                                  │
│  (Set by PeakLogic — contact support to change)                │
└─────────────────────────────────────────────────────────────┘
```
- Read-only per CH-1.2 — no dropdown, no edit control. Attribution is PeakLogic-internal-assigned; this screen exists so the tenant can see who they're attributed to, not to let them change it.
- Deliberately does not use the term "channel partner" anywhere — that classification word is internal PeakLogic vocabulary only (CH-1.2), never tenant-facing product copy. The tenant only ever sees the supplier's actual name.
- The report-viewing button from the original v1 draft was removed from this screen — it belongs to the Channel Partner persona's own view (§2.10), not the tenant's, since a per-partner attribution report spans that partner's *other* customers too, which a single tenant has no reason to see.

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

### 2.10 Attribution Report — Channel Partner View (CH-2.1) *(added v1.2)*

```
┌─────────────────────────────────────────────────────────────┐
│  PeakView — Partner Report: AquaChem Supply Co.                │
├─────────────────────────────────────────────────────────────┤
│  Attributed customers (7)                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Business                Devices    Attributed since    │  │
│  │ Lakeside Pool Route        4        2026-02-14          │  │
│  │ Harbor View Pool           2        2026-03-01          │  │
│  │ Oakwood Community Pool     3        2026-04-18          │  │
│  │ ...                                                      │  │
│  └───────────────────────────────────────────────────────┘  │
│  For manual revenue-share reconciliation — not a billing tool  │
└─────────────────────────────────────────────────────────────┘
```
- No login/dashboard — reached via a direct link, matching the no-account pattern already established for the Field Service Partner (§2.6, AL-2.1) and consistent with User Personas §2.6 ("not a daily platform user").
- Scoped to only this partner's own attributed tenants (CH-2.1) — even as a no-login link, the access token must not let one partner enumerate another's customer list.
- This is the screen the "[View attribution report]" button on the original §2.8 draft was pointing at — moved here because it's the Channel Partner's own view of *their* customer list, not something a single tenant should see.

### 2.11 Partner Portal Login (CH-3, Security Architecture §2.4) *(added v1.3)*

```
┌─────────────────────────────────────────────────────────────┐
│                                                                 │
│                     [Partner's own logo]                       │
│                                                                 │
│              Sign in to your Pinch-A-Penny account              │
│                                                                 │
│              Email    [________________]                       │
│              Password [________________]                       │
│                                                                 │
│                     [   Sign In   ]                             │
│                                                                 │
└─────────────────────────────────────────────────────────────┘
  Background/accent colors: partner's own primary_color/secondary_color
```
- **A genuinely separate screen from the tenant login, not a themed variant of it** — authenticates against `PartnerPool` (Security Architecture §2.4), a completely different Cognito pool from the tenant `userPool` the existing login screen (`LoginBackground.tsx`) uses. Reached at a different route, not a query-param-toggled version of the same one.
- Logo and colors are pulled from `GET /v1/partner`'s `branding` field (API Specification §4.5) **before** authentication — a technician or dispatcher needs to recognize their own employer's branding to know they're in the right place, the same reason a white-label product shows its branding on the login screen and not just after signing in.
- **No self-service signup link anywhere on this screen** — Domain Model §4 decision 8's "provisioning is admin-initiated" made visible in the UI, not just enforced at the API layer. A technician or a second dispatcher gets an account created for them (§2.13), never creates one themselves.
- No "forgot branding" fallback is designed here — if `branding` is null (a partner not yet fully onboarded, or the rare case of a technician's very first login before their employer finishes setup), this document doesn't specify what renders instead. Flagged in §3, not silently assumed.

### 2.12 Territory Map Editor (TR-1.1) *(added v1.3)*

```
┌─────────────────────────────────────────────────────────────┐
│  ← Partner Portal          Territories            [+ New]     │
├─────────────────────────────────────────────────────────────┤
│  Territories (3)              │                                │
│  ┌──────────────────────┐    │        [ MAP ]                 │
│  │ North Riverside Route │◄───┼──  ┌─────────────────────┐    │
│  │   3 technicians       │    │    │      ╱‾‾‾‾╲          │    │
│  │ South County Route    │    │    │     ╱      ╲   ✎     │    │
│  │   2 technicians       │    │    │    │  drawn  │        │    │
│  │ Lakeside Route        │    │    │     ╲ shape ╱         │    │
│  │   1 technician        │    │    │      ╲____╱          │    │
│  └──────────────────────┘    │    └─────────────────────┘    │
│                                │    [ ✎ Draw ]  [ Save ]        │
└─────────────────────────────────────────────────────────────┘
```
- **The map itself is Mapbox GL Draw**, the locked map technology (`project-peaklogic-channel-partner-portal` memory) — this document doesn't re-litigate that choice, only the screen layout around it. Selecting a territory in the left list highlights its boundary on the map; "Draw" starts a new polygon.
- Saving a drawn shape sends it as GeoJSON to `POST/PUT /v1/partner/territories` (API Specification §4.5) — the wireframe's "shape" is literally the same `Polygon` coordinate structure the API expects, not a UI abstraction translated later.
- **No site markers shown on this map in this draft** — a dispatcher drawing a territory boundary is working with geography, not a specific site list; which sites fall inside a drawn shape is resolved server-side, derived (Domain Model §2.7), not something this screen computes or previews live. Flagged in §3 as a real UX question (should a dispatcher see site pins while drawing, to sanity-check the boundary?), not decided here.
- Available to `partner_admin` only — a technician viewing their own assigned territory (read-only) is covered by §2.15, not this screen.

### 2.13 Technician Management (Domain Model §4 decision 8) *(added v1.3)*

```
┌─────────────────────────────────────────────────────────────┐
│  ← Partner Portal          Team                 [+ Add person] │
├─────────────────────────────────────────────────────────────┤
│  Name              Role            Territory          │       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Technician 1       Technician      North Riverside Route │  │
│  │ Technician 2       Technician      South County Route    │  │
│  │ Dispatcher 1        Dispatcher      —                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

  [+ Add person] opens:
  ┌─────────────────────────────────────────┐
  │  Email       [________________]           │
  │  Name        [________________]           │
  │  Role         ( ) Dispatcher  (•) Technician│
  │  Territory    [North Riverside Route ▾]     │
  │                    [ Create ]               │
  └─────────────────────────────────────────┘
```
- "Create" calls `POST /v1/partner/users` (API Specification §4.5), which provisions a **real Cognito account**, not just an invite email — the new technician can sign in at §2.11 immediately with a temporary password, the same admin-invited pattern the tenant side already uses. This screen is the human-facing surface for that mechanism, not a new one.
- Territory selector only appears for `role: technician`, matching the API's own validation (`territory_id` rejected alongside `role: partner_admin`) — the form shouldn't offer an option the backend will reject.
- Available to `partner_admin` only.

### 2.14 Daily Dispatch Route — Dispatcher View (TR-2.1, TR-3.1, TR-3.2) *(added v1.3)*

```
┌─────────────────────────────────────────────────────────────┐
│  ← Partner Portal      Today's Routes — Jul 13         [Team ▾]│
├─────────────────────────────────────────────────────────────┤
│  Technician 1 — North Riverside Route       🤖 AI-suggested    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. Lakeside Pool Route — Stop 4      ⚠ pH drifting low  │  │
│  │ 2. Harbor View Pool                   ✅ Healthy         │  │
│  │ 3. Oakwood Community Pool             ✅ Healthy         │  │
│  └───────────────────────────────────────────────────────┘  │
│  [ Edit stops ]              [ Confirm route ✓ ]               │
│                                                                 │
│  Technician 2 — South County Route           ✓ Confirmed       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. Sunridge HOA Pool                  🔴 Chlorine critical│
│  │ 2. Meadowbrook Community Pool          ✅ Healthy         │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```
- **Deliberately mirrors §2.2's existing Route View layout** (ordered stop list, urgency-first, real per-stop readings) rather than inventing a new visual language — the underlying data shape is genuinely similar (RP-2.1's urgency ranking, reused per TR-2.1), so the screen should look similar, not different for its own sake.
- The `🤖 AI-suggested` / `✓ Confirmed` badge makes TR-3.1's "advisory only" requirement visible, not just enforced server-side — a dispatcher should never mistake an unconfirmed AI suggestion for a technician's actual, locked-in day.
- "Confirm route" calls `POST /v1/partner/routes/{routeId}/confirm` (API Specification §4.5); "Edit stops" opens a reorderable version of the same list, calling `PUT /v1/partner/routes/{routeId}` — disabled/hidden once a route shows `✓ Confirmed`, matching the API's own `409` rejection of edits to a confirmed route.
- **No "Generate route" button appears on this screen** — deliberately. TR-3.2's "no in-house routing algorithm" boundary (API Specification §4.5) means PeakLogic's backend doesn't compute a suggestion on demand; the `🤖 AI-suggested` routes shown here arrive already-submitted from wherever the external agent runs (`POST /v1/partner/routes`, `source: "ai_suggested"`). This document deliberately does not design a trigger UI for a capability that doesn't exist server-side — flagged in §3, not invented to fill the gap.

### 2.15 Daily Dispatch Route — Technician View (TR-2.1, RP-2.1) *(added v1.3)*

```
┌─────────────────────────────────────────────────────────────┐
│  Partner Portal                          [Technician 1 ▾]     │
├─────────────────────────────────────────────────────────────┤
│  Today's Route — 3 stops                     ✓ Confirmed      │
├─────────────────────────────────────────────────────────────┤
│  1. Lakeside Pool Route — Stop 4          ⚠ Check first     │
│     pH: 6.8 (target 7.4)   Chlorine: 1.2 ppm   Temp: 81°F   │
│                                                               │
│  2. Harbor View Pool                       ✅ Healthy        │
│     pH: 7.4   Chlorine: 2.1 ppm   Temp: 79°F                 │
│                                                               │
│  3. Oakwood Community Pool                 ✅ Healthy        │
└─────────────────────────────────────────────────────────────┘
```
- **Visually near-identical to §2.2's original Route View** — same field layout, same urgency-first ordering, same per-stop reading detail. The difference is entirely in the data source and access scope, not the design: this screen calls `GET /v1/partner/routes` under a `technician`-role session, which Database Schema §4.4's RLS automatically scopes to just this one technician's own route — no client-side filtering, no separate "my routes only" toggle needed.
- **A technician never sees an unconfirmed route** — this screen is deliberately not designed to show `🤖 AI-suggested`/edit controls at all, unlike §2.14. TR-3.1's advisory gate means a suggestion isn't a technician's day until a dispatcher confirms it; showing a tentative, possibly-about-to-change route to the person expected to actually drive it would undermine that gate's whole purpose, not just look inconsistent.
- No map view on this screen, despite the underlying territory being drawn on one (§2.12) — a technician needs an ordered stop list to work through, not a map of their own coverage area. Revisit if real technician feedback says otherwise; not assumed necessary here.

---

## 3. Open Questions Surfaced While Wireframing

1. **Alert-detail language for a `trend` alert (§2.5)** needs real product-writing/UX-copy work to land as genuinely plain-language for a non-technical operator — "rate-of-change flag" as shown here is placeholder engineering language, not what should actually ship.
2. **§2.1's "collapsed by default" healthy-sites behavior** isn't yet a stated requirement anywhere (RP-1.1 says the view must separate trend/alarm, but doesn't say healthy sites collapse) — a reasonable UX default, not something to treat as already required.
3. **§2.11's no-branding fallback is undesigned** *(added v1.3)* — if a technician or dispatcher logs in before their `channel_partners.branding` is set, this document doesn't specify what renders. Needs a real default (PeakLogic's own generic branding, most likely) before implementation.
4. **§2.12's live site-preview-while-drawing is undecided** *(added v1.3)* — should a dispatcher see candidate site pins light up as they drag a territory boundary, or only find out which sites fall inside after saving? Territory→Site is a derived, server-side resolution (Domain Model §4 decision 7), so a live preview would need a new read-only "preview containment" capability that doesn't exist yet; not assumed necessary here.
5. **§2.14's "no Generate route button" leaves a real gap unaddressed** *(added v1.3)* — TR-3.2 deliberately keeps PeakLogic from computing routes in-house, but that also means this document has no answer for how a `partner_admin` triggers the external AI agent for a given day if it doesn't run on its own schedule. Out of scope for a wireframe (it's an integration question, not a screen), but flagged so it isn't mistaken for a decided "the agent always runs proactively" design.
6. **API Specification §7 item 7 (territory redraw stranding a `suggested` route) has a UX-shaped answer that isn't designed here** *(added v1.3)* — §2.12 doesn't show any warning/confirmation when saving a redrawn boundary that could invalidate an unconfirmed route. Left open in both documents; whichever is amended next to resolve it should update the other.

---

## 4. Traceability

Every wireframe above cites the requirement ID(s) it satisfies inline in its annotations — no separate matrix needed given the screen count at this stage.

---

## 5. Review Log

**v1/v1.1/v1.2 — no review log was ever recorded**, despite all three being marked Approved in `README.md`. Found while adding the v1.3 entry below; not corrected retroactively (this section's job is to record what happened, not rewrite history) — flagged here so a future reader doesn't wonder whether earlier entries were deleted. They were simply never filled in.

**v1.3 (2026-07-11)** — real verification pass on the new §2.11–2.15 content and its cross-references, not just a re-read:
- Confirmed Domain Model §4 decision 8's exact wording (admin-initiated provisioning, no self-service signup for either role) matches §2.11's and §2.13's claims — read the live text rather than relying on the summary carried into this session.
- Confirmed API Specification §4.5's actual endpoint list, `PUT /v1/partner/routes/{routeId}`'s `409`-on-confirmed behavior, and the `source: "ai_suggested"` field all match §2.14's annotations — checked the specification text directly rather than assuming the earlier plan's description still held after the API doc's own review pass.
- **Confirmed §2.15's core claim against the actual schema, not just the schema doc's prose**: grepped `docs/data-model.sql` directly and found `route_assignments`' `channel_partner_isolation` policy literally includes `OR technician_user_id = current_setting('app.current_channel_partner_user_id', true)::uuid` — the "no client-side filtering needed" claim is a real, shipped RLS policy, not an aspirational description.
- Found real gaps while writing, not just accepted the draft as complete — recorded as Open Questions §3 items 3–6 rather than silently deciding them (no-branding fallback, live territory-preview UX, how the external AI agent is actually triggered day-to-day, and territory-redraw/stranded-route interaction) rather than inventing an answer to fill space.
- Per user instruction during this pass: removed named individuals from all persona-facing mockups (§2.1, §2.2, §2.13, §2.14, §2.15) in favor of generic role+number labels (`Technician 1`, `Dispatcher 1`, etc.) — applied consistently across the whole document, not just the newly-added screens, since the same named-mockup pattern predated this amendment in §2.1/§2.2.

---

## Revision History

**v1.1 (2026-07-04)** — forced by the Information Architecture artifact (#9) and the PRD/SRS's own v1.3 amendments, per this document's rule (§4) that a downstream artifact surfacing a needed change must amend this document explicitly rather than silently diverging from it.

- **§2.9 added (Sites Directory)**: elaborates the PRD/SRS's new RP-4/RP-4.1 — a plain, address-sortable site lookup, distinct from §2.1's risk/health roll-up — needed once Information Architecture found no wireframed screen backing its "Sites" navigation item.

**v1.2 (2026-07-04)** — forced by the Information Architecture artifact (#9) and the PRD/SRS's own v1.4 amendments (CH-1.2), per this document's rule (§4) that a downstream artifact surfacing a needed change must amend this document explicitly rather than silently diverging from it.

- **§2.8 revised (Your Supplier, formerly "Channel Partner")**: removed the tenant-editable dropdown and the generic "channel partner" label (CH-1.2 makes attribution PeakLogic-internal-assigned, never tenant-set, and the term itself internal-only vocabulary) and removed the attribution-report button, which didn't belong on a single tenant's screen.
- **§2.10 added (Attribution Report — Channel Partner View)**: gives the Channel Partner persona (User Personas §2.6) their own dedicated, no-login report screen (CH-2.1) — the destination the removed §2.8 button was pointing at, now properly specified rather than an unwireframed gap.

**v1.3 (2026-07-11)** — forced by the PRD v1.5/SRS v1.5 channel-partner-portal amendment, Domain Model v1.1 §2.7, and API Specification v1.1 §4.5/§4.6, per this document's own rule (§4) that a downstream chain of amendments must force an explicit revision here rather than leaving the portal's screens unwireframed.

- **§1.3 Screen Inventory extended** with 5 new rows (2.11–2.15), each citing the requirement/artifact section it satisfies.
- **§2.11 added (Partner Portal Login)**: a genuinely separate login surface from the tenant login (different Cognito pool, Security Architecture §2.4), branded per-partner, no self-service signup.
- **§2.12 added (Territory Map Editor)**: Mapbox GL Draw-based boundary editor for `partner_admin`, submitting GeoJSON directly to API Specification §4.5's territory endpoints.
- **§2.13 added (Technician Management)**: the human-facing surface for Domain Model §4 decision 8's admin-initiated provisioning — creates a real Cognito account, not an invite email.
- **§2.14 added (Daily Dispatch Route — Dispatcher View)**: deliberately mirrors §2.2's existing layout; makes TR-3.1's advisory-only AI-suggestion gate visible as a badge and a required confirm action, not just a server-side rule.
- **§2.15 added (Daily Dispatch Route — Technician View)**: a technician's own, RLS-scoped route view; never shows an unconfirmed suggestion, preserving TR-3.1's gate from the technician's side too.
- **All persona mockups (new and pre-existing) switched to generic role+number labels** (`Technician 1`, `Dispatcher 1`, etc.) instead of named individuals, per explicit user instruction during this pass — applied to §2.1 and §2.2 as well as the new screens, for consistency across the document.
- **§3 Open Questions gained 4 new items** (branding fallback, live territory-preview UX, AI-agent trigger mechanism, territory-redraw/stranded-route interaction) — genuinely unresolved, not filled in with an invented answer.
- **§5 Review Log disclosure**: found v1/v1.1/v1.2 never had a real review log entry despite being marked Approved; documented rather than silently backfilled.
