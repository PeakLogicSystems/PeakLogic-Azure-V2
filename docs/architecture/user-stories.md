# User Stories

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.2), [SRS](srs.md) (approved v1.2), [Domain Model](domain-model.md) (approved v1), [User Personas](user-personas.md) (approved v1)
**Last updated:** 2026-07-04

---

## 1. Introduction

### 1.1 Purpose

User Personas describes *who* the system is for and *why* they'd use it. This document translates that into concrete, testable stories — the input UX Wireframes (#8) needs to design actual screens against, and Test Strategy (#18) can eventually write acceptance tests from. Every story traces to a PRD/SRS requirement ID; where a story doesn't cleanly trace to one, that's flagged in §4 as an open item, not silently invented.

### 1.2 Format

Each story: `As a [persona/role], I want [goal], so that [benefit].` Acceptance criteria reference PRD/SRS IDs directly rather than restating them. Priority inherits the underlying requirement's PRD priority (Must/Should/Won't) unless noted.

---

## 2. Stories by Persona

### 2.1 Corporate / Regional Facilities Operations Leader

**US-1.** As a Corporate/Regional Ops Leader, I want a single view of aggregate site health and open-alert counts across every location I oversee, so that I can spot a portfolio-wide problem without visiting each site's page individually.
- Acceptance: RP-1.1 (multi-site roll-up query/view). Priority: Must.

**US-2.** As a Corporate/Regional Ops Leader, I want to see which specific sites are trending toward risk (not just currently in alarm), so that I can act before a site becomes a full incident, not just react after.
- Acceptance: RP-1.1 (confirmed — now explicitly separates `trend`/`anomaly` sites from `threshold`-alarmed sites, per PRD/SRS v1.2). Priority: Must.

**US-3.** As a Corporate/Regional Ops Leader, I want an eventual aggregate savings/avoided-loss estimate across my portfolio, so that I can justify the platform's cost to my own leadership.
- Acceptance: RP-3 — explicitly **Won't** at MVP (requires real usage data this PRD's horizon doesn't have yet). Included here so the need is on record even though it isn't being built now.

### 2.2 Small Business Owner-Operator (Tenant Admin)

**US-4.** As a Small Business Owner-Operator, I want to see every customer site and every technician's current status in one place, so that I'm not calling around to find out what's happening across my business.
- Acceptance: RP-1.1. Priority: Must.

**US-5.** As a Small Business Owner-Operator, I want to add a new customer site and its devices without contacting PeakLogic support, so that onboarding a new customer doesn't bottleneck on anyone but me.
- Acceptance: UX-1.1, UX-3.1. Priority: Must.

**US-6.** As a Small Business Owner-Operator, I want my channel-partner relationship (e.g. my chemical supplier) correctly attributed on my account, so that revenue-share reporting reflects reality without manual reconciliation on my end.
- Acceptance: CH-1.1, CH-2.1. Priority: Must (CH-1.1) / Should (CH-2.1).

### 2.3 Site-Level Facility Operator

**US-7.** As a Site-Level Facility Operator, I want a plain-language notification when something needs my attention, so that I don't have to understand sensors, thresholds, or a dashboard to know when to act.
- Acceptance: UX-1.1, UX-2.1. Priority: Must.

**US-8.** As a Site-Level Facility Operator, I want to add a new device in a small number of simple steps, so that setup doesn't feel harder than the problem it's solving.
- Acceptance: UX-1.1 (benchmarked against the Alexa/Smart Home anti-example). Priority: Must.

**US-9.** As a Site-Level Facility Operator, I do NOT want to be paged for something that turns out to be nothing, so that I keep trusting and acting on notifications instead of tuning them out.
- Acceptance: AI-3.3 (configurable sensitivity per adapter/category). Priority: Must — this is the requirement AI-3.3 exists specifically to satisfy.

### 2.4 Route-Based Service Technician

**US-10.** As a Route-Based Service Technician, I want to see my assigned stops for today ranked by urgency, so that I can skip healthy sites and prioritize ones trending toward a problem.
- Acceptance: RP-2.1. Priority: Should.

**US-11.** As a Route-Based Service Technician, I want to know a site's chemical/equipment status before I arrive, so that I show up prepared instead of discovering the problem on-site.
- Acceptance: SN-4.1 (pool chemistry telemetry), surfaced via RP-2.1's per-site detail (confirmed — RP-2.1 now explicitly requires adapter-specific readings per site, per PRD/SRS v1.2). Priority: Must (SN-4.1) / Should (RP-2.1).

### 2.5 Field Service Partner

**US-12.** As a Field Service Partner, I want a service ticket that already tells me which asset, what reading, and how long it's been trending, so that I arrive prepared without needing a full account on the platform.
- Acceptance: AL-2.1 (auto-created service ticket). Priority: Must.

**US-13.** As a Field Service Partner, I want to be notified before a customer's equipment fully fails, not just after, so that my dispatches are planned work instead of emergency scrambles.
- Acceptance: AI-3.1/AI-3.2 (trend/anomaly detection feeding the same alert→ticket pipeline as AL-2.1). Priority: Must (AI-3), Must (AL-2.1).

### 2.6 Channel Partner (Supplier)

**US-14.** As a Channel Partner, I want a simple report of which tenants/devices are attributed to my referral relationship, so that I can reconcile revenue share without needing my own account on the platform.
- Acceptance: CH-2.1. Priority: Should.

### 2.7 External AI/Agent Consumer *(system actor, not a persona — see User Personas §3)*

**US-15.** As an external AI/agent system, I want to query devices, alerts, and telemetry through a standard tool interface, so that I can incorporate PeakView data into a customer's own automation or reporting without a custom integration.
- Acceptance: MCP-1.1, MCP-2.1. Priority: Must.

---

## 3. Cross-Cutting Stories

**US-16.** As any authenticated user, I want my access strictly limited to my own tenant's data, so that I never see another customer's sites, devices, or alerts.
- Acceptance: MT-1.1, MT-2.1, AUTH-1–3. Priority: Must.

**US-17.** As a Tenant Admin, I want administrative actions (device claims, user/config changes) logged with who-did-what-when, so that I have an audit trail if something changes unexpectedly.
- Acceptance: AUD-1, AUD-2. Priority: Must.

---

## 4. Open Items Surfaced While Writing Stories

Both resolved — confirmed and back-ported to the PRD/SRS (v1.2) rather than left open:

1. **US-2 (trend-flag visibility in the roll-up view)**: confirmed. RP-1.1 now explicitly requires separating trend/anomaly-flagged sites from threshold-alarmed sites.
2. **US-11 (pre-arrival chemical/equipment status)**: confirmed. RP-2.1 now explicitly requires per-site adapter-specific readings, not just a health summary.

---

## 5. Traceability

Every story above cites its PRD/SRS requirement ID(s) inline in its Acceptance line — no separate matrix needed given the story count at this stage. Where a story's acceptance criteria references a need not yet covered by an approved requirement (US-2, US-11), that's called out explicitly in §4 rather than treated as already satisfied.

---

## 6. Review Log

1. **US-2 / US-11 open items (§4)**: both confirmed "yes" and back-ported as explicit PRD v1.2 / SRS v1.2 amendments (RP-1.1, RP-2.1 reworded) rather than left as an assumption in this document alone.
