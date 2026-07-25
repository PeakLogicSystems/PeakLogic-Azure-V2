# User Personas

**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Company:** PeakLogic
**Project codename:** Project Vantage
**Status:** Approved v1.2
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.5), [SRS](srs.md) (approved v1.5), [Domain Model](domain-model.md) (approved v1.1), [API Specification](api-specification.md) (approved v1.1)
**Last updated:** 2026-07-11

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

**Role:** Owns/operates a small handful of their own locations directly using PeakView — e.g. the owner-operator of 2–5 gas-station/convenience-store locations, or a small QSR franchisee with a few restaurants. The actual PeakLogic customer at this scale, and the person who evaluates, buys, and configures the product. **Corrected, v1.2 — no longer illustrated with a pool-service company.** Under Domain Model §2.7's now-settled shape, a business that dispatches technicians to *other* organizations' sites is structurally a Channel Partner (§2.6/§2.7), not a Tenant — using a pool-service company here collided with that and implied a relationship shape this persona doesn't actually have. This persona's sites are property *they themselves* own; they don't dispatch technicians to customers' sites the way §2.7 does.

**What they need from PeakView:** Visibility across every one of their own locations, evidence the product is reducing unnecessary site visits and preventing costly emergencies (PRD §2's loss-prevention proof point, felt at a scale they can personally track), and simple enough user/device management that they aren't the bottleneck every time a new location or device is added. They also benefit from the channel-partner relationship (CH-1) their business came through — but per CH-1.2 that attribution is PeakLogic-internal-assigned, not something they configure themselves; they see which supplier they're attributed to, by that supplier's actual name, not a "channel partner" settings panel they manage.

**What makes them churn:** If the product can't clearly show ROI within a season, or if configuring new locations/devices requires calling support every time.

### 2.3 Site-Level Facility Operator

**Role:** Runs the day-to-day of a single, fixed location — e.g. a convenience-store manager at a gas station. Not the equipment owner, and typically not the platform's economic buyer — an operator managing someone else's assets, whose job description has nothing to do with "using a monitoring platform."

**A typical day:** Discovers equipment problems by chance — a customer complaint about warm milk, a noticed puddle — not through any systematic check. Has no facilities-management training and no time to acquire one.

**What they need from PeakView:** A plain-language notification ("Cooler 2 is getting warm — check it soon"), not a dashboard they have to remember to check. Adding a sensor should feel like pairing a Bluetooth speaker (UX-1), not configuring enterprise software.

**What makes them ignore the product:** Alert fatigue — a single false alarm can be enough to make them stop trusting notifications entirely. This is the sharpest, most human version of why alert accuracy matters as much as UX polish.

### 2.4 Route-Based Service Technician

**Role:** Employed by a business (e.g. a pool-service company) to visit many sites per day, checking conditions in person that a remote sensor could report ahead of time.

**A typical day:** The entire job is discovering, on arrival, what could have been known remotely — low chemical levels, a straining pump, water that's too warm. A visit to a site that turns out to be fine is wasted time; a site that's actually in trouble and wasn't flagged in advance is a missed problem.

**What they need from PeakView:** A route-level view — not one device at a time, but "here are today's stops, and here's which ones actually need attention" — so a healthy site can be skipped and a trending-bad one prioritized. This is the concrete shape of the pool-chemical-monitoring upsell example in the Vision Document (§6), not just a sensor-reading screen.

**Added v1.2 — for the pool-servicing vertical specifically, this persona now has a real, scoped login.** When this technician's employer is a channel partner onboarded to the operational-dispatch portal (CH-3 revised, §2.7 below), they authenticate as a `channel_partner_users` row with `role: technician` (Domain Model §2.7) — not the generic, unspecified "route view" this persona originally implied with no stated access mechanism. Their access is deliberately narrow: only the sites within their assigned territory (Database Schema §4.4's territory-scoped RLS), and only their own day's route (`GET /v1/partner/routes`, API Specification §4.5) — they cannot see other technicians' routes or their employer's full customer list. **Provisioning is admin-initiated** — their employer's dispatcher (§2.7) creates the credential; there's no self-service signup. This doesn't change for verticals outside pool-servicing, where this persona's access mechanism remains as originally unspecified (a future decision, not yet needed).

### 2.5 Field Service Partner (Third-Party Repair/Maintenance Company)

**Role:** An external repair/maintenance company — not the tenant, not PeakLogic — that receives auto-generated service tickets (AL-2.1) when a critical alert fires, and is dispatched to fix the underlying equipment problem.

**Why early notification benefits them, not just the customer:** This persona's business gets the same value a route technician gets from remote monitoring — fewer last-minute emergency dispatches, better-scheduled work, and the ability to arrive prepared instead of walking into an unknown failure. Early notification is a shared win between the customer (avoided downtime/loss) and the field service company (better-planned, less chaotic work) — not a one-sided obligation the service company merely tolerates.

**What they need from PeakView:** Enough context in the ticket to show up prepared — which asset, what the actual reading was, how long it's been trending — without needing an account on the full platform or any training on the dashboard.

### 2.6 Channel Partner (Supplier)

**Role:** A business contact at a supplier PeakLogic has a real, active channel relationship with (e.g. a pool-chemical/equipment supplier, per PRD §10 item 5). Not a daily platform user — cares about which customers came through their referral and what they're owed for it.

**What they need from PeakView:** A simple, periodic report of attributed tenants/devices (CH-2.1) for their own manual revenue-share reconciliation — nothing more at MVP.

**Narrowed, v1.2 — no longer describes every channel partner.** This persona was written assuming one relationship shape: a supplier who refers customers and wants a revenue-share report, nothing more. CH-3's revision (PRD v1.5) confirmed a second, genuinely different shape exists — §2.7, below. **This persona (§2.6) still accurately describes an attribution-only relationship** (e.g. AquaChem Supply Co., a chemical/equipment supplier) — for that relationship, "full self-service partner portal is explicitly deferred" (CH-3a, the still-Won't-MVP half of the original CH-3.1) remains exactly true, unchanged.

### 2.7 Channel Partner Portal Dispatcher *(new — added v1.2, see Revision History)*

**Role:** Runs day-to-day operations for a pool-service company that has both installed PeakView sensors at their own customers' sites *and* onboarded to the operational-dispatch portal (CH-3 revised) — e.g. a regional franchise operator like the real business the user named as a concrete example (Pinch-A-Penny). Not a passive referral relationship like §2.6 — this persona actively runs their business through the product daily. Authenticates as a `channel_partner_users` row with `role: partner_admin` (Domain Model §2.7).

**Why this is a genuinely different persona from §2.6, not a variant of it:** §2.6's Channel Partner never logs in — they get an occasional report. This persona logs in constantly: creating technician credentials (Domain Model §4 decision 8), drawing territory boundaries on a map (TR-1.1), reviewing and confirming AI-suggested daily routes (TR-3.1) before a technician's day is final, and configuring their own portal's branding (their logo, their brand colors — CH-3, white-label). Their whole business's field operations run through this login.

**A typical day:** Reviews overnight AI-suggested routes for each technician against real-time chemistry/status data from every customer site in their network, adjusts or confirms them, and — the commercial core of the whole relationship — uses that same data to justify a chemical refill or a maintenance visit to their own customer, replacing what used to be a technician's weekly manual test-strip visit with real, continuously-measured evidence (Vision Document §3's differentiator, now realized through this persona specifically, not just the underlying sensor).

**What they need from PeakView:** A branded portal that looks like *their* software, not PeakLogic's — the white-label requirement isn't cosmetic to this persona, it's how they present the platform to their own customers, who PeakLogic itself may never interact with directly. Territory-drawing that matches how they already think about technician coverage areas (a real map, not a list of ZIP codes). An AI-generated route suggestion that saves them from manually sequencing stops by hand every morning — but stays advisory, since they're the one whose judgment actually decides a technician's day (TR-3.1), not a black box they're forced to trust blindly.

**What makes them churn:** If the AI-suggested routes are consistently wrong enough that confirming one takes longer than building it manually would have, or if the portal's branding is shallow enough (a logo slapped on PeakLogic's own visual identity) that it doesn't actually read as their own software to their customers.

---

## 3. Note: Non-Human System Actor (not a persona)

The MCP server (MCP-1.1) is queried by a customer's own AI/agent software, or by PeakLogic's own analytics — not a person, so it isn't listed as a numbered persona above. It has no screens, no notifications, and no day-to-day — its entire "experience" is the MCP tool contract (what questions it can ask, what data it gets back), which is the API Specification's (#11) job to define precisely. Mentioned here only so it isn't mistaken for a missing human persona.

---

## 4. Cross-Persona Themes

1. **Only the two buyer personas (§2.1, §2.2) think of themselves as evaluating a "platform."** Everyone doing hands-on work (§2.3–§2.5) has a different job title and needs the product to fit into that job, not ask them to adopt monitoring-platform-user as a new one — the concrete, human version of Vision Pillar 4 (radical UX simplicity).
2. **Trust is earned or lost on alert accuracy, not feature count**, most acutely for the Site-Level Facility Operator (§2.3) — this should weigh directly on how aggressively AI-3's baseline-analytics flags are tuned, not just on alert-screen polish.
3. **Two very different reporting altitudes exist, and one product needs to serve both**: the Corporate/Regional Ops Leader (§2.1) wants portfolio-level roll-ups and dollar-figure ROI; the Site-Level Operator (§2.3) wants a single plain-language nudge about the one thing in front of them. Designing one screen that tries to serve both is a likely failure mode for UX Wireframes (#8) to watch for.
4. **Early notification is a mutual win, not just a customer benefit** — true for the Route-Based Technician (§2.4) and the Field Service Partner (§2.5) alike. Both personas' willingness to value the product depends on this being genuinely true in practice, not just true in the pitch.
5. **Added v1.2 — a third reporting/access altitude now exists, distinct from both themes 1 and 3.** The Channel Partner Portal Dispatcher (§2.7) isn't a buyer persona (theme 1) and isn't choosing between portfolio-ROI and single-device altitude (theme 3) — they need a *cross-tenant* operational view (every customer site attributed to their business, territory-scoped for their technicians) that no existing tenant-side persona needs, since every other persona in this document is scoped to a single tenant.

---

## 5. Traceability

| Persona | Traces to |
|---|---|
| §2.1 Corporate/Regional Facilities Operations Leader | Surfaced during review — not explicitly named in PRD §3; ties to Vision §11/§12 (enterprise proof point, loss-prevention at scale) |
| §2.2 Small Business Owner-Operator (Tenant Admin) | PRD §3 role; PRD §2 (loss-prevention proof point); CH-1/CH-2 |
| §2.3 Site-Level Facility Operator | PRD §3 role; Vision §9/§11 (Alexa/Smart Home anti-example); UX-1/UX-2 |
| §2.4 Route-Based Service Technician | PRD §3 role; Vision §6 (pool chemical monitoring upsell example); *(access mechanism added v1.2)* Domain Model §2.7, API Specification §4.5 |
| §2.5 Field Service Partner | PRD §3 role (Service Partner); AL-2.1 (auto-created service tickets) |
| §2.6 Channel Partner | CH-1.1/CH-2.1/CH-3a *(narrowed v1.2 — no longer describes every channel partner)* |
| §2.7 Channel Partner Portal Dispatcher *(added v1.2)* | PRD §5.8 (CH-3 revised) + §5.10 (TR-1–TR-3), Domain Model §2.7, Security Architecture §2.4, API Specification §4.5 |
| §3 Non-human system actor | MCP-1.1/MCP-2.1 |

---

## 6. Open Questions Surfaced While Developing Personas

1. **Portfolio/roll-up reporting (§2.1) is not yet an explicit PRD/SRS requirement.** The Corporate/Regional Ops Leader persona implies a reporting surface (aggregate ROI, multi-site risk trends) that doesn't exist in any requirement written so far — worth a PRD amendment or an explicit item in a future artifact, not something to assume UX-2 already covers.
2. ~~**Route/portfolio-level view for mobile operators (§2.4)**~~ **Resolved for the channel-partner-technician case, v1.2** — `GET /v1/partner/routes` (API Specification §4.5) is real, backed by `route_assignments`/`route_stops` (Domain Model §2.7). Still open for a Route-Based Service Technician whose employer is **not** a portal-onboarded channel partner — no access mechanism specified for that case, same gap as before.
3. **Alert-tuning philosophy (false-positive tolerance) isn't yet an explicit requirement anywhere**, despite being the single biggest driver of whether the Site-Level Operator persona (§2.3) keeps trusting the product.
4. **§2.7's Dispatcher persona and §2.4's Technician persona can be the same real person at a small pool-service business, added v1.2.** Domain Model §2.7 doesn't prevent one `channel_partner_users` row from being both — role is `partner_admin` or `technician`, not a strict org-chart separation. Not a gap, just worth naming: at a one-person or family-run pool-service shop, the "dispatcher" and "technician" personas described separately here may be the same morning and afternoon of the same person's day.
5. **§2.5's Field Service Partner and §2.7's Dispatcher can also be the same real-world company, in a different capacity — added v1.2.** A pool-service channel partner might also be the company that shows up for AL-2.1's auto-generated emergency ticket on a critical alert. The two personas stay distinct on purpose (§2.5 is reactive, triggered by one alert, no portal login required; §2.7 is proactive, daily, portal-driven, cross-tenant) — noted here so the overlap reads as intentional (two different jobs, sometimes done by one company) rather than an unnoticed redundancy.

---

## 7. Review Log

**v1/v1.1 — no review log was ever recorded**, despite the document header showing "Approved v1.1." Found while adding this amendment's own review entry below, not assumed correct because the header said so. Not corrected retroactively (this document's job is to record what happened, not rewrite history) — flagged here so a future reader doesn't wonder whether §7 was deleted or simply never filled in. It was never filled in.

**v1.2 (2026-07-11), reviewed 2026-07-11.**

1. **Checked directly, not assumed: does Domain Model §2.7 actually support one person holding both the §2.6 and §2.7 roles, or a `channel_partner_users` row being both dispatcher and technician?** Re-read the actual entity definition — `role` is a single-value `CHECK (role IN ('partner_admin','technician'))`, no multi-role support — meaning §6 item 4's "same person" scenario means two SEPARATE `channel_partner_users` rows (one per role) for that person, not one row with two roles, if they need to act as strictly both. Worth noting precisely rather than leaving the open question vaguely worded.
2. **Re-verified, held up:** that CH-3a (PRD v1.5) is the correct citation for §2.6's "still exactly true, unchanged" claim (re-checked against `prd.md`'s actual CH-3a text, not assumed from memory of writing it); that `route_assignments`/`route_stops` (Domain Model §2.7) really do back a real `GET /v1/partner/routes` endpoint (re-checked against `api-specification.md` §4.5's actual content).
3. **Per user request, a dedicated uniqueness/overlap pass across all 7 personas, not just the 2 newly added.** Found one real, structural collision: §2.2's original example ("the owner of the pool-service company... The actual PeakLogic customer at this scale") described a pool-service company as a **Tenant**, which directly contradicts Domain Model §4 decision 6/8 — a business that dispatches technicians to *other* organizations' sites is structurally a **Channel Partner** (§2.6/§2.7), not a Tenant. This wasn't just repetitive wording, it was a factual inconsistency with the now-settled domain model, predating the §2.7 persona's existence. Fixed by re-illustrating §2.2 with a business that owns its own locations directly (gas-station/convenience or small QSR franchisee), which cannot structurally collide with the channel-partner shape. Checked every other persona pair for the same failure mode (one persona accidentally implying another's structural relationship) — none found; the remaining apparent overlaps (§2.4/§2.7, §2.5/§2.7) are the ordinary case of one real person or company wearing two distinct hats, already called out honestly in §6 items 4–5 rather than merged away.

---

## Revision History

**v1.1 (2026-07-04)** — forced by the Information Architecture artifact (#9) and the PRD/SRS's own v1.4 amendments (CH-1.2).

- **§2.2 corrected**: the Small Business Owner-Operator "manages" their channel-partner relationship in the sense of benefiting from it and seeing who it is — not in the sense of configuring or changing the attribution themselves, which per CH-1.2 is PeakLogic-internal-assigned only.

**v1.2 (2026-07-11)** — forced by the PRD v1.5/SRS v1.5/Domain Model v1.1/API Specification v1.1 amendment (channel-partner portal), the last artifact in that amendment's sequenced roadmap (`project-peaklogic-channel-partner-portal` memory) before implementation.

- **§2.4 amended**: the Route-Based Service Technician persona gained a real, scoped login for the pool-servicing vertical specifically — narrow access (own territory's sites, own day's route), admin-provisioned, mirroring the actual `channel_partner_users`/RLS mechanism already built (Domain Model §2.7, Database Schema §4.4).
- **§2.6 narrowed, not rewritten**: the Channel Partner (Supplier) persona no longer describes every channel-partner relationship — it's now specifically the attribution-only shape (CH-3a), distinct from the new §2.7 persona.
- **§2.7 added — Channel Partner Portal Dispatcher**: a genuinely new persona, not a variant of §2.6, since the underlying relationship (active daily platform use, cross-tenant operational visibility, white-label branding) is qualitatively different from a periodic-report-only supplier relationship.
- **§4 theme 5 added**: the Dispatcher persona needs a cross-tenant operational view no other persona in this document needs, since every other persona is scoped to a single tenant.
- **§6 item 2 resolved for the channel-partner-technician case specifically**, not the Route-Based Service Technician persona generally — precise, not overclaimed.
- **§7's missing v1/v1.1 review log found and disclosed**, not silently left unaddressed or retroactively fabricated.
- **§2.2 corrected (uniqueness pass)**: replaced the pool-service-company example, which structurally collided with the new §2.7 Channel Partner (a pool-service company is a Channel Partner under Domain Model §4 decisions 6/8, not a Tenant) — now illustrated with a small gas-station/convenience or QSR franchisee who owns their own locations directly.
- **§6 item 5 added**: named the realistic overlap between §2.5 (Field Service Partner, reactive/ticket-triggered) and §2.7 (Dispatcher, proactive/portal-driven) explicitly, so it reads as an acknowledged real-world dual-hat case rather than an unnoticed redundancy.
