# User Personas

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.1), [SRS](srs.md) (approved v1.1), [Domain Model](domain-model.md) (approved v1)
**Last updated:** 2026-07-04

---

## 1. Introduction

### 1.1 Purpose

The PRD and SRS name roles (Facility Operator, Tenant Admin, Service Partner, Channel Partner) at the level needed to write requirements. This document makes those roles concrete — real days, real frustrations, real reasons to open (or ignore) the product — the input the UX Wireframes (#8) and Information Architecture (#9) artifacts need to actually design screens. Personas are identified **by role, not by fictional name** — the concreteness comes from the specifics of the day-to-day, not from a made-up person.

Every persona below is grounded in the **confirmed MVP beachhead verticals** (pool servicing, QSR/gas-station-convenience) rather than a generic facilities-manager archetype, per PRD §8's confirmed decision.

### 1.2 Scope

In scope: personas for every role named in PRD §3, plus a persona surfaced during review that the PRD didn't explicitly name — the economic buyer at multi-site/corporate scale. Out of scope: the industrial-pumping-station vertical (next after MVP) and screen-level UX (→ UX Wireframes, #8).

---

## 2. Personas

### 2.1 Corporate / Regional Facilities Operations Leader

**Role:** Oversees facilities/operations across many locations for a larger organization — a restaurant chain's regional facilities director, a gas-station franchise's corporate operations lead, or (once the industrial-pumping-station vertical opens post-MVP) a multi-site industrial operations manager. Not present at any single site day-to-day.

**Why this persona matters most for the business case:** This is the person who feels the *aggregate* value the Vision Document is actually selling — energy savings across dozens of coolers, avoided emergency-repair costs across a whole portfolio, and the substantial cost of a single site's downtime or loss (a flooded location, a spoiled-inventory event) multiplied across a chain. A single-site operator feels one incident; this persona feels the portfolio-wide pattern and the budget line it represents. They are the economic buyer for any deal larger than a single small business, and the person a sales conversation is ultimately aimed at once PeakLogic sells beyond its initial small-business beachhead.

**What they need from PeakView:** Portfolio/roll-up reporting — which locations are trending toward risk, aggregate energy savings, total avoided-loss estimates — not per-device telemetry. They care about the same "loss-prevention proof point" success criterion from PRD §2, but expressed as a dollar figure across many sites, not a single alert.

**What makes them champion or kill the deal:** Whether the platform can produce a credible, portfolio-level ROI number they can defend internally (to their own leadership or board) — this is a distinct reporting need from anything a single-site operator or a small-business owner requires.

### 2.2 Small Business Owner-Operator (Tenant Admin)

**Role:** Owns/operates a smaller business directly using PeakView — e.g. the owner of the pool-service company whose technicians work the confirmed beachhead vertical. The actual PeakLogic customer at this scale, and the person who evaluates, buys, and configures the product.

**What they need from PeakView:** Company-wide visibility across every customer site and every technician's route, evidence the product is reducing unnecessary site visits and preventing costly emergencies (PRD §2's loss-prevention proof point, felt at a scale they can personally track), and simple enough user/device management that they aren't the bottleneck every time a new customer or device is added. They're also the person managing the relationship with a channel-partner supplier (CH-1), so partner attribution/reporting needs to make sense to them directly, not just internally to PeakLogic.

**What makes them churn:** If the product can't clearly show ROI within a season, or if configuring new customers/devices requires calling support every time.

### 2.3 Site-Level Facility Operator

**Role:** Runs the day-to-day of a single, fixed location — e.g. a convenience-store manager at a gas station. Not the equipment owner, and typically not the platform's economic buyer — an operator managing someone else's assets, whose job description has nothing to do with "using a monitoring platform."

**A typical day:** Discovers equipment problems by chance — a customer complaint about warm milk, a noticed puddle — not through any systematic check. Has no facilities-management training and no time to acquire one.

**What they need from PeakView:** A plain-language notification ("Cooler 2 is getting warm — check it soon"), not a dashboard they have to remember to check. Adding a sensor should feel like pairing a Bluetooth speaker (UX-1), not configuring enterprise software.

**What makes them ignore the product:** Alert fatigue — a single false alarm can be enough to make them stop trusting notifications entirely. This is the sharpest, most human version of why alert accuracy matters as much as UX polish.

### 2.4 Route-Based Service Technician

**Role:** Employed by a business (e.g. a pool-service company) to visit many sites per day, checking conditions in person that a remote sensor could report ahead of time.

**A typical day:** The entire job is discovering, on arrival, what could have been known remotely — low chemical levels, a straining pump, water that's too warm. A visit to a site that turns out to be fine is wasted time; a site that's actually in trouble and wasn't flagged in advance is a missed problem.

**What they need from PeakView:** A route-level view — not one device at a time, but "here are today's stops, and here's which ones actually need attention" — so a healthy site can be skipped and a trending-bad one prioritized. This is the concrete shape of the pool-chemical-monitoring upsell example in the Vision Document (§6), not just a sensor-reading screen.

### 2.5 Field Service Partner (Third-Party Repair/Maintenance Company)

**Role:** An external repair/maintenance company — not the tenant, not PeakLogic — that receives auto-generated service tickets (AL-2.1) when a critical alert fires, and is dispatched to fix the underlying equipment problem.

**Why early notification benefits them, not just the customer:** This persona's business gets the same value a route technician gets from remote monitoring — fewer last-minute emergency dispatches, better-scheduled work, and the ability to arrive prepared instead of walking into an unknown failure. Early notification is a shared win between the customer (avoided downtime/loss) and the field service company (better-planned, less chaotic work) — not a one-sided obligation the service company merely tolerates.

**What they need from PeakView:** Enough context in the ticket to show up prepared — which asset, what the actual reading was, how long it's been trending — without needing an account on the full platform or any training on the dashboard.

### 2.6 Channel Partner (Supplier)

**Role:** A business contact at a supplier PeakLogic has a real, active channel relationship with (e.g. a pool-chemical/equipment supplier, per PRD §10 item 5). Not a daily platform user — cares about which customers came through their referral and what they're owed for it.

**What they need from PeakView:** A simple, periodic report of attributed tenants/devices (CH-2.1) for their own manual revenue-share reconciliation — nothing more at MVP. A full self-service partner portal is explicitly deferred (CH-3.1); this persona's narrow MVP need is by design, not under-served.

---

## 3. Note: Non-Human System Actor (not a persona)

The MCP server (MCP-1.1) is queried by a customer's own AI/agent software, or by PeakLogic's own analytics — not a person, so it isn't listed as a numbered persona above. It has no screens, no notifications, and no day-to-day — its entire "experience" is the MCP tool contract (what questions it can ask, what data it gets back), which is the API Specification's (#11) job to define precisely. Mentioned here only so it isn't mistaken for a missing human persona.

---

## 4. Cross-Persona Themes

1. **Only the two buyer personas (§2.1, §2.2) think of themselves as evaluating a "platform."** Everyone doing hands-on work (§2.3–§2.5) has a different job title and needs the product to fit into that job, not ask them to adopt monitoring-platform-user as a new one — the concrete, human version of Vision Pillar 4 (radical UX simplicity).
2. **Trust is earned or lost on alert accuracy, not feature count**, most acutely for the Site-Level Facility Operator (§2.3) — this should weigh directly on how aggressively AI-3's baseline-analytics flags are tuned, not just on alert-screen polish.
3. **Two very different reporting altitudes exist, and one product needs to serve both**: the Corporate/Regional Ops Leader (§2.1) wants portfolio-level roll-ups and dollar-figure ROI; the Site-Level Operator (§2.3) wants a single plain-language nudge about the one thing in front of them. Designing one screen that tries to serve both is a likely failure mode for UX Wireframes (#8) to watch for.
4. **Early notification is a mutual win, not just a customer benefit** — true for the Route-Based Technician (§2.4) and the Field Service Partner (§2.5) alike. Both personas' willingness to value the product depends on this being genuinely true in practice, not just true in the pitch.

---

## 5. Traceability

| Persona | Traces to |
|---|---|
| §2.1 Corporate/Regional Facilities Operations Leader | Surfaced during review — not explicitly named in PRD §3; ties to Vision §11/§12 (enterprise proof point, loss-prevention at scale) |
| §2.2 Small Business Owner-Operator (Tenant Admin) | PRD §3 role; PRD §2 (loss-prevention proof point); CH-1/CH-2 |
| §2.3 Site-Level Facility Operator | PRD §3 role; Vision §9/§11 (Alexa/Smart Home anti-example); UX-1/UX-2 |
| §2.4 Route-Based Service Technician | PRD §3 role; Vision §6 (pool chemical monitoring upsell example) |
| §2.5 Field Service Partner | PRD §3 role (Service Partner); AL-2.1 (auto-created service tickets) |
| §2.6 Channel Partner | CH-1.1/CH-2.1/CH-3.1 |
| §3 Non-human system actor | MCP-1.1/MCP-2.1 |

---

## 6. Open Questions Surfaced While Developing Personas

1. **Portfolio/roll-up reporting (§2.1) is not yet an explicit PRD/SRS requirement.** The Corporate/Regional Ops Leader persona implies a reporting surface (aggregate ROI, multi-site risk trends) that doesn't exist in any requirement written so far — worth a PRD amendment or an explicit item in a future artifact, not something to assume UX-2 already covers.
2. **Route/portfolio-level view for mobile operators (§2.4)** is a real UX requirement distinct from UX-2's single-device framing — flagged for UX Wireframes (#8) to design explicitly.
3. **Alert-tuning philosophy (false-positive tolerance) isn't yet an explicit requirement anywhere**, despite being the single biggest driver of whether the Site-Level Operator persona (§2.3) keeps trusting the product.

---

## 7. Review Log

Draft v0.1 — no review conducted yet.
