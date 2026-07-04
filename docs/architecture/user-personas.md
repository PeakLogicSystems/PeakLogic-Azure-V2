# User Personas

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1), [SRS](srs.md) (approved v1), [Domain Model](domain-model.md) (approved v1)
**Last updated:** 2026-07-04

---

## 1. Introduction

### 1.1 Purpose

The PRD and SRS name roles (Facility Operator, Tenant Admin, Service Partner, Channel Partner) at the level needed to write requirements. This document makes them concrete people with real days, real frustrations, and real reasons to open (or ignore) the product — the input the UX Wireframes (#8) and Information Architecture (#9) artifacts need to actually design screens, rather than designing for an abstract "user."

Every persona below is grounded in the **confirmed MVP beachhead verticals** (pool servicing, QSR/gas-station-convenience) rather than a generic facilities-manager archetype, per PRD §8's confirmed decision — the same way IronQuill grounded its form templates in a real physical field book instead of an invented one.

### 1.2 Scope

In scope: personas for every role named in PRD §3, grounded in the two confirmed beachhead verticals. Out of scope: the industrial-pumping-station vertical (next after MVP, not required for the MVP demo per PRD §8) and screen-level UX (→ UX Wireframes, #8).

---

## 2. Personas

### 2.1 Facility Operator — "Denise," Gas-Station Convenience Store Manager

**Role:** Runs the day-to-day of a single convenience store location for a regional gas-station chain. Not the equipment owner — an operator managing someone else's assets.

**A typical day:** Denise opens the store, checks the coolers by eye and by touch, restocks, handles staff scheduling, and deals with whatever breaks — a flickering light, a jammed door, a warm cooler. She finds out about a cooler problem when a customer complains the milk is warm, or when she happens to notice condensation on the glass. She has no formal facilities-management training and no time to learn one.

**What she needs from PeakView:** A phone notification that says, plainly, "Cooler 2 is getting warm — check it soon" — not a dashboard she has to remember to check, not a device list she has to configure. Adding a new sensor when a technician installs one should feel like pairing a Bluetooth speaker, not setting up enterprise software. She will not read a manual (UX-1, restated).

**What makes her ignore the product:** Alert fatigue. If PeakView pages her about something that turns out to be nothing (a false threshold, a sensor hiccup), she will start ignoring notifications entirely — this is the sharpest version of the "why simplicity/accuracy matter" argument in the Vision Document, not an abstract UX preference.

### 2.2 Facility Operator — "Marcus," Pool Service Route Technician

**Role:** Employed by a pool-service company (the confirmed real channel-partner relationship, §CH-1 in the PRD); drives a route of 15–20 residential and light-commercial pools per day, testing water chemistry and checking equipment by hand at each stop.

**A typical day:** Marcus's entire job is finding out, in person, what a remote sensor could tell him before he arrives — is the chlorine low, is the pump straining, is the water too warm. A "truck roll" to a pool that turns out to be fine is wasted time his employer pays for; a pool that's actually in trouble and he didn't know until arrival is a customer-satisfaction problem.

**What he needs from PeakView:** A route-level view — not "here is one device," but "here are today's stops, and here's which ones actually need attention versus which ones are fine" — letting him skip a healthy pool and prioritize a trending-bad one. This is the concrete shape of the "pool chemical monitoring upsell" example from the Vision Document (§6), not just a sensor reading screen.

**What makes the product valuable to his employer, not just him:** Fewer unnecessary route stops and fewer emergency callbacks are a direct labor-cost argument — this is the ROI story Tenant Admins (below) actually buy on.

### 2.3 Tenant Admin — "Priya," Pool Service Company Owner/Operator

**Role:** Owns the pool-service company Marcus works for; the actual PeakLogic customer and the person who evaluates, buys, and configures the product for her whole team.

**What she needs from PeakView:** Company-wide visibility across every customer site and every technician's route, evidence that the product is actually reducing truck rolls and preventing costly emergency situations (the "Loss-prevention proof point" from PRD §2), and simple enough user/device management that she isn't the bottleneck every time a new customer or device is added. She's also the person managing the relationship with her chemical/equipment channel-partner supplier (CH-1), so partner attribution and reporting need to make sense to her, not just to PeakLogic internally.

**What makes her churn:** If the product can't clearly show its ROI within the first season, or if configuring new customers/devices requires calling PeakLogic support every time.

### 2.4 Service Partner — "Tom," HVAC/Refrigeration Technician

**Role:** Works for a third-party equipment-service company (not the tenant, not PeakLogic) that receives auto-generated service tickets (AL-2.1) when a critical alert fires — e.g., dispatched to fix a QSR/gas-station cooler flagged by Denise's location.

**What he needs from PeakView:** Enough context in the ticket to show up prepared — which asset, what the actual reading was, how long it's been trending bad — without needing an account on the full platform or training on the dashboard. He is the person for whom "the alert becomes a service ticket automatically" (existing behavior, reconciled in SRS §3.3) has to actually work, or the whole loss-prevention story breaks at the last step.

### 2.5 Channel Partner — "the pool-chemical supplier's account contact"

**Role:** A business contact at the pool-chemical/equipment supplier PeakLogic has a real, active channel relationship with (PRD §10 item 5). Not a daily user of the platform — cares about which customers came through their referral and what they're owed for it.

**What they need from PeakView:** A simple, periodic report of attributed tenants/devices (CH-2.1) for their own manual revenue-share reconciliation — nothing more at MVP. A full self-service partner portal is explicitly deferred (CH-3.1); this persona's MVP need is narrow by design, not under-served.

### 2.6 External AI/Agent Consumer — *(system actor, not a human persona)*

Not a person — a customer's own AI/agent stack, or PeakLogic's own analytics, querying the MCP server (MCP-1.1) for device/alert/telemetry data as a tool. Included here only to make explicit that this "user" of the system has no UX needs (no screens, no notifications) — its entire interface is the MCP tool contract itself, which is the API Specification's (#11) job to define precisely.

---

## 3. Cross-Persona Themes

1. **Every human persona except Priya is not a "monitoring platform user" by self-conception.** Denise thinks of herself as a store manager, Marcus as a pool tech, Tom as an HVAC technician. The product has to fit into their actual job, not ask them to adopt a new one — this is the concrete, human version of Vision Pillar 4 (radical UX simplicity) and the explicit anti-example (Alexa/Smart Home clunkiness).
2. **Trust is earned or lost on alert accuracy, not feature count.** Every operator persona (Denise, Marcus) will disengage from the product the moment it cries wolf — this should weigh directly on how aggressively AI-3's baseline-analytics flags are tuned, not just on the UX polish of the alert itself.
3. **The channel-partner relationship (Priya ↔ chemical supplier) is a real, live business relationship the product needs to make legible**, not just an attribution field in a database — CH-1/CH-2's minimal MVP scope is deliberately narrow, but the reporting that does exist needs to be immediately understandable to a non-technical partner contact.
4. **Two very different "shapes" of facility operator exist in the confirmed beachhead verticals**: Denise is fixed-location, single-site, in-person daily; Marcus is mobile, multi-site, visiting briefly and infrequently. UX Wireframes (#8) should design for both a single-site "is everything OK here" view and a route/portfolio-level "which of my many sites need attention" view — not assume one shape fits both.

---

## 4. Traceability

| Persona | Traces to |
|---|---|
| §2.1 Denise (Facility Operator) | PRD §3 role; Vision §9/§11 (Alexa/Smart Home anti-example); UX-1/UX-2 |
| §2.2 Marcus (Facility Operator) | PRD §3 role; Vision §6 (pool chemical monitoring upsell example) |
| §2.3 Priya (Tenant Admin) | PRD §3 role; PRD §2 (Loss-prevention proof point); CH-1/CH-2 |
| §2.4 Tom (Service Partner) | PRD §3 role; AL-2.1 (auto-created service tickets) |
| §2.5 Channel Partner contact | CH-1.1/CH-2.1/CH-3.1 |
| §2.6 External AI/Agent Consumer | MCP-1.1/MCP-2.1 |

---

## 5. Open Questions Surfaced While Developing Personas

1. **Route/portfolio-level view (§3.4) is a real UX requirement, not yet in the PRD/SRS explicitly.** UX-2's "device list/detail" requirement is written at the single-device level; Marcus's persona implies a genuinely different view (many sites, prioritized by urgency) is needed. Flagging for UX Wireframes (#8) to design explicitly, not assume UX-2 already covers it.
2. **Alert-tuning philosophy (false-positive tolerance) isn't yet an explicit requirement anywhere.** §3.2's "trust lost on alert accuracy" theme suggests AI-3's baseline-analytics sensitivity should be a deliberate, tunable decision (possibly per-tenant or per-adapter), not a fixed default — worth a explicit requirement in a future revision or in the Database Schema/API Specification artifacts.

---

## 6. Review Log

Draft v0.1 — no review conducted yet.
