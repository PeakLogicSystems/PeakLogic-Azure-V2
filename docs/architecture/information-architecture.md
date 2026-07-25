# Information Architecture

**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Company:** PeakLogic
**Project codename:** Project Vantage
**Status:** Draft v1.1 (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1 until v1.1 is approved)
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (Draft v1.7, pending), [SRS](srs.md) (Draft v1.7, pending), [Domain Model](domain-model.md) (Draft v1.4, pending), [User Personas](user-personas.md) (approved v1.1), [User Stories](user-stories.md) (Draft v1.1, pending), [UX Wireframes](ux-wireframes.md) (Draft v1.4, pending)
**Last updated:** 2026-07-17
**Fork note (v1.1):** the first amendment specific to the `PeakLogic-Azure` fork's Azure-pivot feature backlog (map, 3D rendering). **Also discloses a pre-existing gap, not fixed in this pass**: like User Stories and UX Wireframes, this document was never amended for the AWS-side channel-partner-portal (PRD v1.5) or Administration Console (PRD v1.6) — it still depends on "PRD approved v1.4." Out of scope for this amendment.

---

## 1. Introduction

### 1.1 Purpose

UX Wireframes specified individual screens; this document connects them — navigation structure, what's "home" for each persona, and a single consistent vocabulary so the product doesn't say "tenant" on one screen and "account" on another. It's the last artifact before implementation-facing docs (Database Schema, API Specification) take over.

### 1.2 Scope

In scope: per-persona navigation structure/entry points, the full screen hierarchy, and a user-facing terminology glossary. Out of scope: visual design, exact screen content (→ UX Wireframes, already done), and API/data contracts (→ Database Schema, API Specification).

---

## 2. Role-Based Navigation — not one nav for everyone

Per User Personas §4 ("only the two buyer personas think of themselves as evaluating a platform"), giving every role the same nav with different permissions would be a mistake — the personas need materially different *shells*, not just gated versions of an admin nav. This applies within the two buyer personas too: the Corporate/Regional Ops Leader (User Personas §2.1) and the Small Business Owner-Operator (§2.2) both land on the same Portfolio Roll-Up, but they are **not given identical nav** — the Ops Leader is "not present at any single site day-to-day" and wants aggregate/ROI reporting, with no device, user, or supplier management need, while the Owner-Operator is the actual Tenant Admin who configures the account. Giving both a "Settings" item would expose device/user/supplier management to a persona with no stated need for it.

| Persona | Home screen | Nav items |
|---|---|---|
| Corporate/Regional Ops Leader | Portfolio Roll-Up (§2.1) | Portfolio (List/Map toggle, UX Wireframes §2.16 *(added v1.1)*) · Sites · Alerts |
| Small Business Owner-Operator (Tenant Admin) | Portfolio Roll-Up (§2.1) | Portfolio (List/Map toggle *(added v1.1)*) · Sites · Alerts · Settings |
| Site-Level Facility Operator | Site Detail (§2.4) — their one site, shown directly, no portfolio screen at all | (their site) · Alerts |
| Route-Based Service Technician | Route View (§2.2) | Today's Route · (site detail via a stop) |
| Field Service Partner | Service Ticket (§2.6), reached via a direct link/notification | *none* — no login-and-browse experience, per AL-2.1's existing scope |
| Channel Partner | Attribution Report (§2.10), a single page | *none* — no broader account access, no login (CH-2.1) |

A single-site operator (§2.3's persona) never sees a "Portfolio" concept at all — their one site *is* their home screen, not a portfolio containing one item. This avoids presenting portfolio/multi-site framing to someone for whom it's meaningless overhead.

**Sites** (both personas above) is a plain address-sortable directory (RP-4.1, UX Wireframes §2.9) — a lookup aid, not a second risk view; it exists alongside Portfolio Roll-Up rather than replacing it because the two answer different questions ("where is our Austin site" vs. "which sites need attention").

**Portfolio Map View is a view-mode toggle on the existing Portfolio nav item, not a new top-level nav entry** *(added v1.1)* — GEO-1.1–GEO-6.1's map (UX Wireframes §2.16) answers the same underlying question as the existing Portfolio Roll-Up ("which of my sites need attention"), just visually — unlike Sites, which answers a genuinely different question and earned its own nav item. Adding a third top-level nav entry for a view that's additive-only (GEO-4.1) would fragment one concept into two destinations for no navigational benefit. **The channel-partner portal's own map view (GEO-5.1) is not given a nav placement here** — that portal's own navigation structure has never been formalized in this document (see §5 disclosed gap); whoever eventually amends this document for the channel-partner portal should slot it in analogously (a toggle on that portal's own site/route view, not a new top-level item), not assumed decided here.

---

## 3. Screen Hierarchy

```
Portfolio Roll-Up (Tenant Admin / Ops Leader home)
│   └── Map view (toggle, not a separate node — UX Wireframes §2.16, GEO-1.1–6.1) *(added v1.1)*
├── Sites — address-sortable directory (RP-4.1; Tenant Admin only, not Ops Leader — see §2)
│   └── Site Detail (same screen as below)
├── Site Detail (also reached directly from Portfolio Roll-Up's risk/health list, or a Map-view pin — GEO-3.1)
│   ├── Asset (inline on Site Detail, per UX Wireframes §2.4 — no separate screen)
│   ├── 3D Facility Panel (collapsed, shown only when a model exists — UX Wireframes §2.17) *(added v1.1)*
│   ├── Add Device Flow
│   └── Alert Detail
├── Alerts (all-sites list, filterable) → Alert Detail
└── Settings (Tenant Admin only)
    ├── Alert Sensitivity
    ├── Your Supplier — read-only (CH-1.2: PeakLogic-internal-assigned, never labeled "channel partner" to a tenant)
    └── Users (existing, not detailed in UX Wireframes — reconciled from existing schema, no new UX needed at MVP)

Route View (Technician home)
└── (stop) → Site Detail (same screen as above, reused, not a separate technician-specific site view)

Service Ticket (Field Service Partner — standalone, no parent nav)

Attribution Report (Channel Partner — standalone, no parent nav, no login; UX Wireframes §2.10)
```

Site Detail is reached from two different entry points (Portfolio Roll-Up and Route View) but is **the same screen** for both — a deliberate reuse decision, not two parallel implementations, so a fix or change to Site Detail never has to be made twice.

---

## 4. Terminology Glossary — internal term → user-facing label

Per the Add Device Flow's established principle (UX Wireframes §2.3: "no mention of tenants, assets, adapters, categories, or thing names"), this table makes that consistent across every screen, not just the one it was first noted on.

| Internal/domain term | User-facing label | Notes |
|---|---|---|
| Tenant | "your business" / "your account" | Never shown as the word "tenant" anywhere in the UI |
| Asset | "equipment" | |
| Device | "sensor" | |
| Asset `category` / Device Adapter | "equipment type" | The dropdown in the Add Device Flow (e.g. "Cooler," "Pool pump") |
| Alert `type: threshold` | "Alarm" | Something has crossed a defined limit |
| Alert `type: trend`/`anomaly` | "Trending" / "Heads up" | Rate-of-change or statistical deviation, not yet over a hard limit — placeholder copy per UX Wireframes §3 item 1, needs real product writing before ship |
| Service Ticket | "Repair request" | Shown to the Tenant side; the Field Service Partner's own screen can say "Ticket" since that's an established term in that trade |
| Channel Partner | (supplier's actual name, e.g. "AquaChem Supply Co.") | Never shown as the generic term "channel partner" to a Tenant-side user — that classification word is internal PeakLogic vocabulary only (CH-1.2). Also not just a copy rule: attribution is PeakLogic-internal-assigned, so a tenant sees this read-only (§3's "Your Supplier"), never as an editable field |

This glossary is the single source of truth for user-facing copy — a screen introducing a new synonym for an existing row here should be treated as a bug, not a copy variation.

---

## 5. Open Questions Surfaced While Organizing

1. **"Users" settings screen** is referenced in §3 but wasn't specified in UX Wireframes — it's existing/reconciled functionality (user invite/role management), not new, so it didn't need a wireframe, but should get one if its UX changes materially from the current mock-data implementation.
2. **Cross-role screen reuse (§3's Site Detail)** assumes a single Site Detail screen adapts its content/actions based on viewer role (e.g. a Technician might see different actions than a Tenant Admin) — this adaptive-by-role behavior isn't yet an explicit requirement; worth confirming before the API Specification defines Site Detail's data contract as role-agnostic or role-aware.
3. **Pre-existing gap, disclosed not resolved, added v1.1**: this document has never been amended for the AWS-side channel-partner-portal (PRD v1.5) or Administration Console (PRD v1.6) requirement sets — no nav structure, screen hierarchy, or terminology entries exist here for either. Out of scope for this v1.1 amendment (scoped only to the map/3D backlog); flagged so it isn't mistaken for something this pass silently ignored.
4. **The channel-partner portal's own map-view nav placement is unresolved** *(added v1.1)* — GEO-5.1 requires the map view there too, but since that portal's navigation has never been formalized in this document (item 3 above), this amendment can't place it definitively. Flagged for whoever picks up the channel-partner-portal IA gap.

---

## 6. Traceability

Navigation and screen-hierarchy decisions above trace directly to User Personas §4 (cross-persona themes) and the screen inventory in UX Wireframes §1.3. The terminology glossary formalizes principles UX Wireframes established informally (§2.3's plain-language rule) into a single reusable reference. **Added v1.1:** the Map view toggle and 3D Facility Panel trace to UX Wireframes §2.16/§2.17 and PRD §5.14/§5.15.

---

## 7. Review Log

Reviewed 2026-07-04. Five issues found, all resolved — see cross-references in §2–§6 above and the resulting amendments to PRD (v1.3, v1.4), SRS (v1.3, v1.4), User Personas (v1.1), and UX Wireframes (v1.1, v1.2).

1. **Orphaned "Sites" nav item**: the draft gave the Tenant Admin a "Sites" nav item with no backing screen or requirement. Resolved by adding RP-4/RP-4.1 (PRD/SRS v1.3) and UX Wireframes §2.9 (v1.1) — a real, address-sortable directory screen.
2. **Glossary rule conflicted with an approved wireframe**: the original UX Wireframes §2.8 titled a tenant-facing screen "Channel Partner" (an editable dropdown), directly violating this document's own terminology rule. Resolved more strongly than a copy fix: CH-1.2 (PRD/SRS v1.4) makes attribution PeakLogic-internal-assigned, not tenant-editable at all; UX Wireframes §2.8 (v1.2) was revised to "Your Supplier," read-only, never naming the classification term; User Personas §2.2 (v1.1) corrected accordingly.
3. **"Attribution Report" screen was never wireframed**: resolved by UX Wireframes §2.10 (v1.2), a dedicated no-login report screen for the Channel Partner persona — also absorbing the report-viewing button that had been misplaced on the tenant's own settings screen.
4. **Citation error**: §6 Traceability cited "User Personas §3 (cross-persona themes)"; corrected to §4, matching this document's own §2 citation.
5. **Two personas silently merged**: the Corporate/Regional Ops Leader and Small Business Owner-Operator were given identical nav despite materially different needs (User Personas §2.1 vs §2.2). Resolved by splitting §2's nav table into two rows — the Ops Leader gets Portfolio · Sites · Alerts (no Settings); the Owner-Operator additionally gets Settings, since only they configure devices, users, and (now read-only) supplier attribution.

---

## Revision History

**v1.1 (2026-07-17)** — the first amendment specific to the `PeakLogic-Azure` fork, forced by the PRD/SRS v1.7, User Stories v1.1, and UX Wireframes v1.4 amendments (geospatial site map, 3D facility rendering).

- **§2 nav table amended**: Portfolio Map View placed as a **view-mode toggle on the existing Portfolio nav item**, not a new top-level entry — a deliberate IA decision (this view answers the same question as the existing roll-up, just visually), not a default. Added for both the Ops Leader and Owner-Operator rows.
- **§3 Screen Hierarchy amended**: added the Map-view toggle under Portfolio Roll-Up, and the collapsed 3D Facility Panel under Site Detail.
- **§5 gained 2 new items**: disclosed (not fixed) that this document has never been amended for the AWS-side channel-partner-portal or Administration Console requirement sets, predating this fork; and flagged that the channel-partner portal's own map-view nav placement (GEO-5.1) can't be resolved until that broader gap is closed.
- **Downstream artifacts requiring their own amendments as a result** (tracked in `azure-restructuring-plan.md` §2): Database Schema, API Specification (both confirming no new nav-driven data requirements beyond what GEO/3DR already specify).
