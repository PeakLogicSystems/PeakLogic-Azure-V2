# Vision Document

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Company:** PeakLogic
**Status:** Approved v1
**Owner:** Chief Product Officer / Chief Software Architect function
**Last updated:** 2026-07-04

*Naming is placeholder — not yet trademark-cleared (see `CLAUDE.md`).*

---

## 1. Executive Summary

PeakView is a facilities and risk management IoT platform — cloud SaaS (**PeakLogicSystems**) paired with an on-site intelligence hub (**PeakView Hub**) and a device ecosystem (**PeakView 360**) — that detects abnormal equipment, facility, and energy conditions early, before they become the kind of loss that shuts a business down. It targets small-to-mid-tier commercial and residential sites (nursing homes, restaurants, pumping stations, retail, light industrial), built to scale to enterprise.

Two examples anchor the value proposition: a leak sensor that raises a critical alert immediately (with automatic shutoff on the roadmap) before water damage forces a closure, and a refrigeration probe that measures the **actual temperature of stored food** rather than ambient air — simultaneously saving energy (the unit can run warmer when the product itself is still safely cold) and catching a real FDA cold-holding violation before product has to be discarded.

PeakLogic's bet is that this category is currently split between narrow, single-vertical point solutions and consumer smart-home ecosystems that are broad but famously painful to actually use — and that a platform built to be both genuinely extensible (able to onboard third-party and open-source devices without full in-house hardware development for every new sensor type) and radically simpler to operate can win both the depth and the ease-of-use argument at once.

---

## 2. The Problem

- Small-to-mid-tier commercial operators manage facility and equipment risk **reactively**: a leak is discovered once it has already flooded a room; a failed cooler is discovered once the food has already spoiled; a pump failure is discovered once it has already stopped a process.
- Existing point solutions are narrow — a vendor for pool monitoring, a different vendor for energy metering, a different vendor again for leak detection — forcing operators to run several disconnected systems and dashboards to cover the risk surface of one building.
- Consumer smart-home ecosystems (Amazon Alexa/Smart Home being the sharpest example) prove a broad device ecosystem has real value, but their device add/view/manage experience is widely, and firsthand, found to be confusing and frustrating — a real usability failure, not a hypothetical one.
- Enterprise and increasingly mid-market networks are moving to zero-trust, internet-only postures: they will not open inbound firewall ports, stand up a dedicated VLAN, or grant a special firewall exception for a vendor's devices. A platform that isn't designed around outbound-only device communication from day one cannot credibly sell into that tier later.

---

## 3. Mission

> Give any facility — a nursing home, a restaurant, a pumping station, an enterprise campus — early, automatic warning of the equipment and facility conditions that cause costly losses, and make adding a new sensor as simple as talking to a voice assistant, not as painful as configuring one.

Every design decision should increase how early a real risk is caught, how easily the platform extends to a new device or vertical, or how simple the day-to-day experience is for a non-technical facilities operator. When a decision trades any of those for short-term engineering convenience, the default answer is no.

---

## 4. Product Vision

PeakView is not a sensor company. It is a **facilities risk intelligence platform** that happens to ship white-label sensors as one on-ramp among several.

Six pillars define the product, and every future feature should trace back to one of them:

1. **Proactive, not reactive.** The product's job is to surface a real risk before it becomes a loss — a leak before a flood, a cooler drift before spoiled inventory, a pump anomaly before a failure — not to produce a better log of what already went wrong.
2. **Extensible by adapter, not by fork.** A device-adapter architecture, orchestrated by an AI/MCP layer, lets the platform integrate white-label, third-party, and open-source devices — modeled on how a voice assistant "learns" a new skill rather than requiring a new hardware SKU and a new app for every monitoring category. This is what lets PeakLogic sell into new monitoring categories without doing full in-house hardware development for each one.
3. **Measure the real thing, across every condition that matters, not just the easy proxy.** Electrical draw, water (flow, *and* chemical composition/quality — not just a binary leak trigger), gas, temperature, and air quality are all first-class sensing categories, not a fixed, narrow list. The refrigeration example generalizes broadly: pool chemical levels (pH, chlorine, dissolved solids) instead of a service company's periodic manual test strip, industrial equipment current draw instead of a breaker trip after the fact. Wherever a proxy and the real signal diverge in value, the platform is built to measure the real thing.
4. **Radically simple device management.** A deliberate reaction against the clunkiness of existing consumer smart-home device management — adding, viewing, and managing a device should be obvious to a non-technical operator, not something that requires a manual.
5. **Outbound-only, enterprise-network-compatible from day one.** Devices call out to the cloud over a persistent, encrypted connection; commands ride back over that same connection. No inbound port, dedicated VLAN, or special firewall rule is ever required of a customer's network — designed in from the start, not retrofitted once an enterprise deal demands it.
6. **Adjacent to fire/life-safety, never inside it.** The product deliberately does not compete in the heavily regulated, UL-certified fire alarm/life-safety space — it covers the risk surface next to it (equipment, leaks, temperature, energy) that isn't covered by fire/alarm code but still causes real, costly losses.

---

## 5. What PeakView Is Not

- **Not a fire alarm / life-safety system.** That is a distinct, heavily regulated, UL-certified category this product deliberately stays adjacent to, not inside.
- **Not a single-vertical point solution.** It is not "just" pool monitoring, "just" energy metering, or "just" leak detection — it is a unified platform those are examples within.
- **Not a closed hardware ecosystem.** Unlike a typical IoT vendor, PeakView is designed to integrate third-party and open-source devices as a first-class capability, not an afterthought integration.
- **Not, at MVP, an autonomous-actuation system.** Remote command/control (e.g. shutting off a water or gas valve) is an explicit roadmap item, not part of initial scope — MVP is detection and alerting.
- **Not, at any near-term stage, an electrical load-control/panel product.** Actively conditioning or managing current draw (so devices don't overdraw a circuit) is a materially more regulated space — UL/NEC-adjacent electrical safety — than passive monitoring or a simple valve shutoff. It is a long-term, deliberately-scoped idea (§11), not something to back into as a side effect of energy monitoring, and the fire/life-safety adjacency principle (§4.6) applies here just as much as it does to fire alarms.
- **Not a general home-automation platform.** No scenes, routines, or entertainment-device focus — the product's reason for existing is commercial facilities and risk management, not consumer convenience automation.

---

## 6. Target Market & Long-Term Vertical Expansion

**Beachhead verticals:** pumping stations, quick-service restaurants/food service, pool service monitoring, nursing homes/senior living, cold storage/refrigeration, retail, light industrial.

**Long-term expansion:** any small-to-mid-tier commercial or residential site with equipment, facility-condition, or energy risk worth monitoring. The architectural implication mirrors IronQuill's own governing rule: the core platform (device-adapter framework, AI/MCP orchestration layer, multi-tenant data model) must be **vertical-agnostic**. New verticals should be reachable primarily through new device adapters and configuration, not by forking the platform.

**Pool service is a particularly strong upsell example** of the sensing breadth in §4.3: remote chemical monitoring (pH, chlorine, dissolved solids), water temperature, and pump energy management — including reducing grid-load spikes at motor startup via solar/battery buffering — let a pool service company offer remote diagnostics its customers can't get today. Industrial equipment current-draw monitoring extends the same pattern to light-industrial sites. Several of these categories are also reachable through **channel partnerships** with existing equipment and chemical suppliers, not only direct PeakLogic hardware sales — a business-model extension of the same extensibility pillar, not a separate strategy.

---

## 7. Guiding Principles

These are the tie-breakers when the PRD, SRS, or later architecture documents need one:

1. **Detect before loss, always the target** — a feature that only documents a failure after the fact is not fulfilling the product's reason for existing.
2. **Measure the real thing when it diverges from the easy proxy** — food-safety-grade probe temperature over ambient air is the model to generalize from.
3. **Extensibility lives in the adapter/skills layer, never in a fork of the core.**
4. **Outbound-only, never inbound** — device networking must never require a customer's IT department to open a port, add a VLAN, or grant a firewall exception.
5. **Safety-critical actuation fails safe locally** — a device must never depend on a live cloud round-trip to perform a safety-critical action; the cloud channel is for override, reset, and audit, not the sole trigger path.
6. **AI orchestrates against defined contracts; it doesn't improvise at runtime.** The AI/MCP layer reasons about and invokes device adapters with known, tested contracts — it is not relied on to freelance an unverified integration against live hardware.
7. **Enterprise-sellable from day one.** SOC 2 readiness and a real security posture are designed into the architecture from the start, not retrofitted in the weeks before a big customer's security review.

---

## 8. Risk Reduction & Compliance Philosophy

PeakView's bar for success is not "as good as the status quo" — it is measurably better than how facilities currently manage this risk surface:

| Dimension | Status Quo | PeakView (target) |
|---|---|---|
| Detection timing | After failure or loss has already occurred | Before, in real time, while it's still preventable |
| Coverage | Fragmented — separate vendor per risk type | Unified platform across leak, temperature, energy, and equipment risk |
| Device ecosystem | Closed, single-vendor hardware | Open — white-label plus third-party/open-source devices via adapters |
| Sensing accuracy | Proxy signals where convenient (ambient air temp) | The actual asset/product condition, where it diverges in value from the proxy |
| Network compatibility | Often requires special firewall/VLAN exceptions | Outbound-only by design; compatible with zero-trust enterprise networks |
| Compliance posture | Bolted on before a sale, if at all | SOC 2 readiness designed into the architecture from day one |

This table is a north star for the forthcoming Compliance & Certification Roadmap, not a final compliance claim. Actual SOC 2 attestation, and any food-safety-adjacent claim referencing FDA cold-holding guidance, require a real audit and legal review before being made externally — this document sets the target, it does not certify it.

---

## 9. Competitive Positioning

PeakView competes against three incumbent categories, none built to win on both breadth and simplicity at once:

- **Single-vertical IoT point solutions** (energy-only, leak-only, pool-only monitoring vendors). Strength: deep expertise in one niche. Weakness: a customer needing coverage across several risk types ends up running several disconnected vendors and dashboards.
- **Consumer smart-home ecosystems** (Alexa, SmartThings, Google Home). Strength: broad device ecosystems, strong brand recognition, proven "skill"-style extensibility model. Weakness: not designed for commercial risk/compliance use cases, no enterprise-network-compatible security posture, and a device management UX widely experienced as confusing.
- **Traditional Building Management Systems (BMS) / IWMS.** Strength: established trust in large facilities. Weakness: expensive, slow to deploy, built for large enterprise campuses rather than small-to-mid-tier commercial sites, and poorly suited to rapidly integrating lightweight modern IoT sensors.

PeakView's durable differentiator is the combination, not any single piece: proactive risk-specific alerting, genuine device-ecosystem extensibility, enterprise-network-compatible architecture from day one, and a device management experience deliberately built simpler than the consumer incumbents it takes usability lessons from.

---

## 10. Offering Tiers & Extensibility Model

PeakLogic sells the same core platform at increasing depth, not different products:

1. **SaaS only** — the PeakLogicSystems platform, for customers bringing their own compatible devices or data.
2. **SaaS + core systems** — the platform plus PeakView Hub and white-label PeakView 360 devices.
3. **SaaS + core systems + AI real-time analytics** — the above plus the AI/MCP-orchestrated analytics layer. Sequencing between tier 2 and tier 3 is a build decision for the PRD, not a vision-level commitment — if it isn't meaningfully harder to build the analytics layer alongside the core than to bolt it on afterward, it should ship with tier 2 rather than be artificially deferred.

**Extensibility is built on two layers, deliberately kept distinct:**

- A **device-adapter layer** (the actual "skill" being learned — how to talk to a specific device or protocol), the same kind of problem consumer home-automation platforms solve with large integration libraries.
- An **AI/MCP orchestration layer** on top of it, letting the platform's AI reason about and invoke whatever device adapters exist, and letting external systems query PeakView data as a tool. PeakLogicSystems exposing its own **MCP server** (so a customer's own AI/agent stack can use PeakView data and alerts as a tool) is the near-term direction; PeakLogicSystems acting as an **MCP client** against external servers is deferred until a specific integration justifies the cost.

This is a vision-level commitment because, like IronQuill's deployment-model decision, it shapes the architecture — the adapter plugin system, the AI orchestration layer, and the API design — from the beginning. Retrofitting genuine third-party device extensibility onto a closed-hardware architecture later is a rebuild, not an iteration.

---

## 11. Three-to-Five Year North Star

By year three to five, PeakView should be positioned as:

- The **default answer** when a small-to-mid-tier commercial operator is asked "how do you catch equipment or facility risk before it becomes a loss?"
- Running a device ecosystem broad enough, through the adapter/skills framework, that customers rarely hear "we don't support that sensor."
- **SOC 2 Type II attested**, cited by enterprise buyers as an actual purchase factor, not a checkbox.
- Held up internally as the **anti-example** to the Alexa/Smart Home device-management experience it took usability lessons from.
- Shipping remote actuation (starting with leak and gas shutoff) safely in production, with the fail-safe-locally design principle proven, not just specified.
- Expanding into new monitoring categories primarily through third-party/open-source device integration and channel/supplier partnerships, not new in-house hardware R&D for every category.
- Having deliberately evaluated — not assumed — whether active electrical load conditioning (managing current draw so devices don't overdraw a circuit) belongs in the product. If pursued, the expectation is a partnership with an already-certified electrical-control hardware maker rather than in-house development, mirroring how the fire/life-safety boundary is handled in §4.6.

---

## 12. Success Criteria

- **Trust validation:** SOC 2 Type II achieved and cited by enterprise buyers as a purchase factor.
- **Extensibility proof point:** a real customer integrates a third-party or open-source device through the adapter/skills framework without custom engineering from PeakLogic.
- **Loss-prevention proof point:** at least one real, quantifiable case of a PeakView alert preventing a costly loss (flooding, spoilage, equipment failure) for a customer, referenceable in sales.
- **Vertical reuse proof point:** a new vertical is onboarded primarily through configuration and device adapters, not net-new core engineering.
- **UX proof point:** device onboarding time and friction benchmarked as meaningfully simpler than the Alexa/Smart Home baseline.
- **Enterprise proof point:** at least one enterprise deployment live in production using outbound-only device networking, with zero special firewall or VLAN exceptions granted by the customer.

---

## 13. Key Risks & Assumptions

- **Assumption — customers will pay to prevent a loss, not just absorb it as a cost of doing business.** Mitigation: lead sales motion with the highest-emotional-resonance losses (flooding a nursing home, spoiling a restaurant's walk-in) where the cost of inaction is vivid and specific.
- **Assumption — an AI/MCP-orchestrated device-adapter framework can actually reach "add any open-source device easily."** Unproven until a real third-party integration ships without custom engineering. This is the single biggest determinant of whether PeakView becomes a broad platform or stays a narrow hardware product.
- **Risk — a good device-adapter/skills architecture is a genuinely hard extensibility problem**, comparable to how long it took consumer home-automation platforms to mature broad integration libraries. Scope and sequencing need to be realistic, not assumed trivial because "AI" is involved.
- **Risk — SOC 2 and an enterprise security posture add real engineering and process overhead.** Building this in now versus after a specific deal requires it is a genuine scope trade-off, not a free win.
- **Risk — remote actuation carries real safety and liability exposure if built carelessly.** Deliberately scoped as roadmap, not MVP, with local fail-safe behavior as a non-negotiable design requirement before any actuation ships.
- **Risk — broadening sensing scope to water chemistry, gas, and electrical draw multiplies hardware and certification complexity.** A chemical sensor, a gas detector, and an electrical monitoring device each carry their own certification and liability profile; scope and sequencing per modality should be deliberate, not assumed free just because the platform architecture is already extensible.
- **Risk — active electrical load conditioning is meaningfully more regulated than passive monitoring or a simple valve shutoff**, and could pull the company toward the same kind of regulatory burden §4.6 deliberately avoids for fire/life-safety. Treated as a long-term, partnership-first idea (§11), not a near-term build.
- **Assumption — the existing v1.0.0 code's validated patterns (tenant isolation via Postgres RLS, the CDK stack structure) remain sound under the architecture this document sets in motion.** Not yet verified against a PRD or SRS that don't exist yet — this is exactly what the reconciliation process in `docs/architecture/README.md` exists to check.

---

## 14. Stakeholders & Document Governance

- **Primary audience:** founding/architecture team (this document is the shared reference point for every subsequent artifact), future engineering hires, prospective investors, and design-partner customers under NDA.
- **Governance:** this document is versioned in git alongside the rest of the architecture set. Material changes (anything beyond wording/clarity) should be called out explicitly and cross-checked against documents that depend on it — starting with the PRD.
- **Next artifact:** Product Requirements Document (PRD), which translates §4–§12 of this document into concrete, prioritized product requirements and explicit MVP scope.
