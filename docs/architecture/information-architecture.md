# Information Architecture

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.2), [SRS](srs.md) (approved v1.2), [Domain Model](domain-model.md) (approved v1), [User Personas](user-personas.md) (approved v1), [User Stories](user-stories.md) (approved v1), [UX Wireframes](ux-wireframes.md) (approved v1)
**Last updated:** 2026-07-04

---

## 1. Introduction

### 1.1 Purpose

UX Wireframes specified individual screens; this document connects them — navigation structure, what's "home" for each persona, and a single consistent vocabulary so the product doesn't say "tenant" on one screen and "account" on another. It's the last artifact before implementation-facing docs (Database Schema, API Specification) take over.

### 1.2 Scope

In scope: per-persona navigation structure/entry points, the full screen hierarchy, and a user-facing terminology glossary. Out of scope: visual design, exact screen content (→ UX Wireframes, already done), and API/data contracts (→ Database Schema, API Specification).

---

## 2. Role-Based Navigation — not one nav for everyone

Per User Personas §4 ("only the two buyer personas think of themselves as evaluating a platform"), giving every role the same nav with different permissions would be a mistake — the personas need materially different *shells*, not just gated versions of an admin nav.

| Persona | Home screen | Nav items |
|---|---|---|
| Corporate/Regional Ops Leader, Small Business Owner-Operator (Tenant Admin) | Portfolio Roll-Up (§2.1) | Portfolio · Sites · Alerts · Settings |
| Site-Level Facility Operator | Site Detail (§2.4) — their one site, shown directly, no portfolio screen at all | (their site) · Alerts |
| Route-Based Service Technician | Route View (§2.2) | Today's Route · (site detail via a stop) |
| Field Service Partner | Service Ticket (§2.6), reached via a direct link/notification | *none* — no login-and-browse experience, per AL-2.1's existing scope |
| Channel Partner | Attribution report (§2.8), a single page | *none* — no broader account access |

A single-site operator (§2.3's persona) never sees a "Portfolio" concept at all — their one site *is* their home screen, not a portfolio containing one item. This avoids presenting portfolio/multi-site framing to someone for whom it's meaningless overhead.

---

## 3. Screen Hierarchy

```
Portfolio Roll-Up (Tenant Admin / Ops Leader home)
├── Site Detail
│   ├── Asset (inline on Site Detail, per UX Wireframes §2.4 — no separate screen)
│   ├── Add Device Flow
│   └── Alert Detail
├── Alerts (all-sites list, filterable) → Alert Detail
└── Settings
    ├── Alert Sensitivity
    ├── Channel Partner Attribution
    └── Users (existing, not detailed in UX Wireframes — reconciled from existing schema, no new UX needed at MVP)

Route View (Technician home)
└── (stop) → Site Detail (same screen as above, reused, not a separate technician-specific site view)

Service Ticket (Field Service Partner — standalone, no parent nav)

Attribution Report (Channel Partner — standalone, no parent nav)
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
| Channel Partner | (supplier's actual name, e.g. "AquaChem Supply Co.") | Never shown as the generic term "channel partner" to a Tenant-side user |

This glossary is the single source of truth for user-facing copy — a screen introducing a new synonym for an existing row here should be treated as a bug, not a copy variation.

---

## 5. Open Questions Surfaced While Organizing

1. **"Users" settings screen** is referenced in §3 but wasn't specified in UX Wireframes — it's existing/reconciled functionality (user invite/role management), not new, so it didn't need a wireframe, but should get one if its UX changes materially from the current mock-data implementation.
2. **Cross-role screen reuse (§3's Site Detail)** assumes a single Site Detail screen adapts its content/actions based on viewer role (e.g. a Technician might see different actions than a Tenant Admin) — this adaptive-by-role behavior isn't yet an explicit requirement; worth confirming before the API Specification defines Site Detail's data contract as role-agnostic or role-aware.

---

## 6. Traceability

Navigation and screen-hierarchy decisions above trace directly to User Personas §3 (cross-persona themes) and the screen inventory in UX Wireframes §1.3. The terminology glossary formalizes principles UX Wireframes established informally (§2.3's plain-language rule) into a single reusable reference.

---

## 7. Review Log

Draft v0.1 — no review conducted yet.
