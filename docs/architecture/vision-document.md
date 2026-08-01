# Vision Document

**Company:** PeakLogic
**Project codename:** Project Vantage
**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (on-prem edge) · PeakAssist (help)
**Status:** 🟡 Draft v2 — unified-platform reframe (base **Approved v1** remains the approved baseline until v2 is formally approved)
**Owner:** Chief Product Officer / Chief Software Architect function
**Last updated:** 2026-07-27

> **v2 reframe note.** v1 (2026-07-04) framed a single-tier "facilities risk intelligence platform." v2 reframes the product as a **unified industrial operations platform** — a multi-tenant SCADA/HMI + CMMS + AI-intelligence layer that sits *above* existing control systems and absorbs the proven capabilities of Purple Standard's **MooreView** — per the PeakLogic-first decision in [`../business/unified-product-vision.md`](../business/unified-product-vision.md). Much of v1's philosophy carries forward intact (proactive-not-reactive, measure-the-real-thing, outbound-only networking, fail-safe-local actuation, SOC 2 from day one); v2 adds the three-component product model, the HMI/SCADA and CMMS layers, compliance automation, and PeakAssist. Naming is canonical per [`unified-platform-integration-plan.md`](unified-platform-integration-plan.md) §1.

---

## 1. Executive Summary

PeakLogic is a **unified industrial operations platform** — a multi-tenant cloud (**PeakLogicSystems**) paired with a modern HMI/SCADA operator experience (**PeakView360**) and on-site edge units (**PeakLogic Hubs**), with a first-class help system (**PeakAssist**) — that detects abnormal equipment, facility, and process conditions early, automates the compliance and technician work operators are legally required to do, and does it across *many* facilities at once.

The platform sits **above** existing SCADA/control systems. It does not replace the safety-rated, deterministic control logic that lives in a plant's PLCs — that stays exactly where it is. Instead it unifies data across facilities, adds AI-driven anomaly detection and predictive maintenance, and drives compliance and dispatch workflows — for operators who today have none of that, or have it locked inside a single-site tool they cannot see across.

Two examples still anchor the value proposition: a leak sensor that raises a critical alert immediately (with automatic shutoff on the roadmap) before water damage forces a closure, and a refrigeration probe that measures the **actual temperature of stored food** rather than ambient air — saving energy while catching a real FDA cold-holding violation before product is lost. To these, the unified platform adds the operator's daily reality: a live plant screen, an acknowledged alarm that opens a work order, a predicted pump failure surfaced before it trips, and a regulator-ready compliance report generated automatically from the period's data.

PeakLogic's bet is that the industrial-operations category is split between **single-site SCADA/HMI systems** that are blind above the plant floor, **narrow point solutions** that each cover one risk type, and **enterprise BMS/IWMS** that are too heavy and slow for distributed small-to-mid-tier operators — and that a platform which is genuinely multi-site, genuinely extensible (onboarding third-party and open-source devices without in-house hardware for every sensor), and radically simpler to operate can win distributed operators, service providers, and compliance-heavy facilities at once.

---

## 2. The Problem

- **Reactive risk management.** Small-to-mid-tier commercial and industrial operators manage facility and equipment risk reactively: a leak is found once it has flooded a room; a failed cooler once the food has spoiled; a pump failure once it has already stopped a process.
- **Fragmented point solutions.** One vendor for pool monitoring, another for energy metering, another for leak detection — several disconnected systems and dashboards to cover the risk surface of one building.
- **SCADA is single-site and blind above the plant floor.** Traditional SCADA/HMI (MooreView being a capable example) is built for *one* engineered facility. It cannot see across a fleet of sites, has no multi-tenant model, no fleet-wide AI, and no way for a service provider to manage many customers' facilities from one place.
- **Compliance is manual, painful, and non-optional.** Regulated operators (wastewater NPDES/DMR reporting the sharpest example) compile monitored values, exceedances, and corrective actions by hand into regulator-ready reports every reporting period. This is error-prone, time-consuming, and carries real regulatory risk.
- **Distributed operators and service providers have no cross-site view.** A company running or servicing dozens of small sites has no unified pane, no cross-fleet intelligence, and no way to dispatch technicians against a live picture.
- **Zero-trust networks reject inbound access.** Enterprise and increasingly mid-market networks will not open inbound firewall ports, stand up a dedicated VLAN, or grant a vendor firewall exception. A platform not designed around outbound-only device communication from day one cannot credibly sell into that tier later.

---

## 3. Mission

> Give any operator — a single wastewater plant, a restaurant chain, a pool-service company running hundreds of sites, an enterprise campus — a live, unified, intelligent view of the equipment and process conditions that cause costly losses and compliance failures; automate the compliance and technician work that view makes possible; and make it simple enough that a non-technical operator can run it, online or off.

Every design decision should increase how early a real risk is caught, how much manual compliance/dispatch work is automated away, how easily the platform extends to a new device or vertical, or how simple the day-to-day experience is for a non-technical operator. When a decision trades any of those for short-term engineering convenience, the default answer is no.

---

## 4. Product Vision — one platform, four named parts

PeakLogic is not a sensor company and not a traditional SCADA vendor. It is a **lightweight, web-based monitoring, control, and operations-intelligence layer** for the distributed sites and device fleets where a conventional SCADA deployment has never been economically justifiable — filling the gap between raw field equipment and heavyweight enterprise control systems, and feeding its normalized data upward into those systems where they exist. It ships white-label sensors and a modern HMI as on-ramps, and absorbs a proven single-plant SCADA/HMI product (MooreView) as the fastest path to a validated operator experience.

### 4.1 The three components (one product)

- **PeakLogicSystems — the core cloud intelligence layer.** Multi-tenant SaaS. Multi-site monitoring, AI anomaly detection, predictive maintenance, compliance automation, technician/CMMS workflows, cloud dashboards, enterprise reporting. The brain. Structurally does what single-plant SCADA cannot: see and reason across every facility a customer or service provider operates, scoped by database-enforced row-level security.
- **PeakView360 — the modernized HMI/SCADA experience.** Real-time operator screens, alarm management, equipment dashboards, facility visualization, multi-pen historian trending. The face. Sources live data **locally from a Hub** (low-latency, offline-capable) and historical/cross-site data **from the cloud** — same UI, dual source. Can be the *primary* HMI for greenfield/small sites, or a *supervisory* layer alongside existing SCADA for brownfield plants that keep their control system.
- **PeakLogic Hubs — the on-prem edge units.** PLC/RTU acquisition (Modbus/OPC-UA/EtherNet-IP), edge processing, local alarm evaluation, offline reliability, and secure outbound-only store-and-forward to the cloud. The hands and ears at each site; the offline-resilient anchor. A productization of the existing PeakLogic Edge (`windows-hub/`) work.
- **PeakAssist — the help/support system.** First-class, contextual, one-click-from-anywhere, bundled offline on every Hub, cloud-synced. Serves both HMI users (inside PeakView360, offline via the Hub) and cloud users. Treated as a product pillar, not documentation (see §7 and the PeakAssist architecture artifact).

### 4.2 The governing pillars (every feature traces to one)

1. **Proactive, not reactive.** Surface a real risk before it becomes a loss — a leak before a flood, a cooler drift before spoilage, a pump anomaly before failure — not a better log of what already went wrong.
2. **Alongside existing control, never replacing safety-rated control.** PeakLogic unifies, analyzes, visualizes, and automates workflows across the sites and assets a conventional SCADA was never economical to cover, and feeds that normalized data upward into any enterprise system already in place. It never assumes the safety-rated, deterministic control logic in a plant's PLCs — that stays where it is. PeakView360 can be a primary HMI for sites that have none, or a supervisory layer where control already exists.
3. **Multi-site and multi-tenant from the core.** One operator, many sites; one service provider, many customers — all in one pane, isolated by RLS so no tenant ever sees another's data. This is the structural advantage over single-plant SCADA.
4. **Extensible by adapter, not by fork.** A device-adapter architecture, orchestrated by an AI/MCP layer, integrates white-label, third-party, and open-source devices — and the Hub's protocol drivers extend the same idea to PLCs/RTUs. New verticals and devices arrive through adapters and configuration, not a platform fork.
5. **Measure the real thing, across every condition that matters.** Electrical draw, water (flow *and* chemistry), gas, temperature, process values — first-class sensing, not a fixed narrow list. Wherever a proxy and the real signal diverge in value, measure the real thing (product temperature over ambient air; pool chemistry over a manual test strip).
6. **Automate the compliance and technician work the data makes possible.** Detection is the start, not the end: an acknowledged alarm becomes a work order; a period of monitored values becomes a regulator-ready compliance report; a predicted failure becomes a dispatched technician against a live route. The closed detect → dispatch → outcome loop is a moat competitors without it cannot copy.
7. **Radically simple to operate, online or off.** Adding/viewing/managing devices and reading a plant screen should be obvious to a non-technical operator — a deliberate reaction to the clunkiness of consumer smart-home management — and must keep working when the internet does not (Hub-local PeakView360 + offline PeakAssist).
8. **Outbound-only, enterprise-network-compatible from day one.** Devices and Hubs call out to the cloud over a persistent encrypted connection; commands ride back over that same connection. No inbound port, VLAN, or firewall exception is ever required.
9. **Safety-critical actuation fails safe locally.** A device (or Hub) must never depend on a live cloud round-trip for a safety-critical action; the cloud channel is for remote override, reset, and audit, not the sole trigger path.
10. **Adjacent to fire/life-safety and to plant control, never inside them.** The product covers the risk surface next to fire/life-safety (equipment, leaks, temperature, energy) without entering that UL-certified space — and operates alongside plant control without entering the safety-rated control space. Both boundaries are deliberate.
11. **Enterprise-sellable from day one.** SOC 2 readiness and a real security posture are designed in from the start, not retrofitted before a big customer's security review.

---

## 5. What PeakLogic Is Not

- **Not a SCADA/PLC replacement or a safety-control system.** PeakView360 is an HMI/visualization and supervisory layer; PeakLogic never assumes safety-rated, deterministic control logic, hard interlocks, or emergency-shutdown functions. Those stay in the plant's certified control system.
- **Not a fire alarm / life-safety system.** A distinct, heavily regulated, UL-certified category the product deliberately stays adjacent to.
- **Not a single-vertical point solution.** Not "just" pool, energy, or leak monitoring — a unified platform those are examples within.
- **Not a single-site tool.** Multi-tenant, multi-site, and service-provider operation is core, not an add-on — the specific thing single-plant SCADA (including MooreView as it exists today) cannot do.
- **Not a closed hardware ecosystem.** Third-party and open-source device integration is a first-class capability, not an afterthought.
- **Not, at MVP, an autonomous-actuation system.** Remote command/control (e.g. valve shutoff) is a roadmap item; MVP is detection, visualization, alerting, and workflow automation.
- **Not, at any near-term stage, an electrical load-control/panel product.** Actively conditioning current draw is a materially more regulated space (§11); a long-term, partnership-first idea, not a side effect of energy monitoring.
- **Not a general home-automation platform.** No scenes/routines/entertainment focus — the reason for existing is commercial and industrial operations, not consumer convenience.
- **Not the operator's system of record for compliance liability.** Compliance automation *assists* the operator's filing (the operator remains the filer of record), backed by an immutable audit trail — it does not assume regulatory responsibility.

---

## 6. Target Market & Vertical Expansion

**Primary buyers:** distributed operators (many small sites), **service providers** managing many customers' facilities, **multi-site** owners, and **compliance-heavy** operators for whom regulatory reporting is non-optional.

**Beachhead vertical — wastewater/water.** It is MooreView's proven domain (so the operator UX is validated, not guessed), it is intensely compliance-driven (NPDES permits, DMR reporting — the compliance-automation wedge), and it is full of distributed small plants and the service providers who run them. Adjacent beachheads carried from v1: pumping stations, quick-service/food service, pool-service monitoring, nursing homes/senior living, cold storage/refrigeration, retail, light industrial.

**Long-term expansion:** any distributed or multi-site operation with equipment, process-condition, compliance, or energy risk worth monitoring. The architectural implication is unchanged and load-bearing: the core (device- and protocol-adapter framework, AI/MCP orchestration, multi-tenant data model) must be **vertical-agnostic** — new verticals reachable through adapters and configuration, not a fork.

**Channel-partner motion.** Service providers are a first-class go-to-market: per-facility economics let a partner onboard customer sites profitably, and PeakLogic's revenue grows with their book of business — already modeled in the channel-partner portal and white-label estate work.

---

## 7. Guiding Principles (tie-breakers for the PRD, SRS, and later docs)

1. **Detect before loss, always the target** — a feature that only documents a failure after the fact is not fulfilling the product's reason for existing.
2. **Alongside existing control; never touch safety-rated control** — repeat this guardrail in every architecture doc that touches the device or command plane.
3. **Measure the real thing when it diverges from the easy proxy** — product temperature over ambient air is the model to generalize.
4. **Multi-tenant isolation is non-negotiable** — RLS-enforced, fails closed; no cross-tenant query, ever; N per-org scoped reads over one cross-tenant read.
5. **Extensibility lives in the adapter/skills layer, never in a fork of the core.**
6. **Outbound-only, never inbound** — device/Hub networking must never require a customer to open a port, add a VLAN, or grant a firewall exception.
7. **Offline reliability is a requirement, not a nice-to-have** — Hub-local PeakView360 and bundled offline PeakAssist must keep working with the internet unplugged.
8. **Safety-critical actuation fails safe locally** — cloud is override/reset/audit, not the sole trigger path.
9. **Compliance assists, never assumes liability** — operator remains filer of record; immutable audit trail is the evidence.
10. **AI orchestrates against defined contracts and is advisory, never authoritative** — deterministic Policy-Engine thresholds stay the safety floor; AI never arms actuation; explainable-or-it-doesn't-ship.
11. **PeakAssist is first-class** — no screen ships without its contextual help entry.
12. **Enterprise-sellable from day one** — SOC 2 readiness and security posture designed in, not retrofitted.

---

## 8. Risk Reduction & Compliance Philosophy

PeakLogic's bar is not "as good as the status quo" — it is measurably better than how operators manage this risk and compliance surface today:

| Dimension | Status Quo | PeakLogic (target) |
|---|---|---|
| Detection timing | After failure/loss | Before, in real time, while preventable |
| Coverage | Fragmented — a vendor per risk type | Unified across leak, temperature, energy, equipment, and process risk |
| Site scope | Single-site SCADA / point tools | Multi-site, multi-tenant, service-provider-ready |
| Above-plant intelligence | None — SCADA is blind above the floor | Fleet-wide AI anomaly detection + predictive maintenance |
| Device ecosystem | Closed, single-vendor | Open — white-label + third-party/open-source via adapters |
| Sensing accuracy | Proxy where convenient (ambient air) | The actual asset/product/process condition |
| Compliance reporting | Manual, per-period, error-prone | Automated, regulator-ready, audit-backed (operator remains filer of record) |
| Technician workflow | Phone calls and spreadsheets | Alarm → work order → dispatch → tracked outcome |
| Network compatibility | Often needs firewall/VLAN exceptions | Outbound-only; zero-trust compatible |
| Offline behavior | Cloud tools go dark on an outage | Hub-local operation + offline help |
| Compliance posture (of the vendor) | Bolted on before a sale, if at all | SOC 2 readiness designed in from day one |

This table is a north star for the Compliance & Certification Roadmap, not a final claim. Actual SOC 2 attestation, any FDA-cold-holding-adjacent claim, and any regulatory-reporting feature all require real audit and legal review before external claims — and compliance automation is positioned as operator-assist, not liability-assumption, precisely because of that.

---

## 9. Competitive Positioning

PeakLogic competes against four incumbent categories, none built to win on multi-site + intelligence + simplicity at once:

- **Single-site SCADA/HMI (e.g. MooreView-class products).** Strength: deep, proven per-plant operator UX and process visualization. Weakness: single-tenant, single-site, blind above the plant floor, no fleet AI, no service-provider model. *PeakLogic absorbs the operator UX and adds everything above it.*
- **Single-vertical IoT point solutions** (energy-only, leak-only, pool-only). Strength: niche depth. Weakness: several disconnected vendors/dashboards to cover one building.
- **Consumer smart-home ecosystems** (Alexa, SmartThings, Google Home). Strength: broad device ecosystems and a proven "skill"-style extensibility model. Weakness: not built for commercial/industrial risk or compliance, no enterprise-network security posture, and a device-management UX widely experienced as confusing — the deliberate anti-example.
- **Enterprise BMS / IWMS.** Strength: established trust in large facilities. Weakness: expensive, slow to deploy, built for large campuses not distributed small-to-mid-tier operators, and poor at rapidly integrating lightweight modern IoT. *This is also where PeakLogic's two-mode go-to-market (business vision §7.3) does double duty: against a regional facility with no BMS at all, PeakLogic is a modern, cloud-native alternative to traditional SCADA, at a fraction of a BMS-integrator build; against an enterprise that already has one, PeakLogic fills the gap between the field devices and that system — reaching the distributed and remote assets the incumbent was never economical to extend to, and feeding normalized data upward into it — rather than competing for the control-room seat outright. Deliberately not marketed as "a SCADA system" or "a SCADA replacement" in either mode — the claim is about what PeakLogic does at a given site, not what category the product belongs to.*

The durable differentiator is the **combination**: proactive risk-specific alerting, a modern multi-site HMI at a price point traditional SCADA never reached, fleet-wide AI, automated compliance and dispatch, enterprise-network-compatible architecture from day one, and a deliberately simpler operator experience — none of which any single incumbent offers together.

---

## 10. Offering Model & Extensibility

PeakLogic sells the same unified platform at increasing depth, per facility, not different products. The value-based, per-facility tiers (detailed in the commercialization roadmap and unified-vision pricing section):

1. **Monitor** — Hub + PeakView360 + alarms + historian + PeakAssist + basic cloud dashboard. Small single-site operators.
2. **Intelligence** — adds AI anomaly detection, predictive maintenance, CMMS work orders/PM. For preventing failures, not just watching them.
3. **Compliance** — adds automated regulatory reporting (DMR etc.), audit exports, retention SLAs. The regulated-facility wedge.
4. **Enterprise / Multi-site** — adds cross-facility rollups, channel-partner/service-provider management, API, SSO, custom report templates, SLAs.

**Extensibility remains two deliberately-distinct layers:** a **device/protocol-adapter layer** (the "skill" — how to talk to a specific device, protocol, or PLC) and an **AI/MCP orchestration layer** on top (reasoning about and invoking whatever adapters exist; exposing PeakLogic data/alerts as a tool to a customer's own AI/agent stack via an MCP server — the near-term direction; PeakLogic as MCP *client* deferred until a specific integration justifies it). This shapes the architecture from the beginning — retrofitting genuine extensibility onto a closed architecture later is a rebuild, not an iteration.

---

## 11. Three-to-Five Year North Star

By year three to five, PeakLogic should be:

- The **default answer** when a distributed or multi-site operator asks "how do I see, protect, and prove compliance for my facilities in one place?"
- Running a device/protocol ecosystem broad enough (via adapters and Hub drivers) that customers rarely hear "we don't support that sensor or PLC."
- The platform a **service provider** runs their whole book of customer sites on, with per-facility economics that scale with their business.
- **SOC 2 Type II attested**, cited by enterprise buyers as an actual purchase factor.
- Automating a regulated operator's compliance reporting end to end, with the operator as filer of record and an immutable audit trail as evidence.
- Shipping remote actuation (starting with leak/gas shutoff) safely in production, with fail-safe-local proven, not just specified.
- Held up internally as the **anti-example** to the Alexa/Smart Home device-management experience.
- Having deliberately evaluated — not assumed — whether active electrical load conditioning belongs in the product, and if pursued, via partnership with an already-certified hardware maker.

---

## 12. Success Criteria

- **Unified-platform proof point:** one reference facility running end-to-end — Hub acquiring from a PLC, PeakView360 rendering live (Hub-local) and historical (cloud), AI anomaly surfacing into an operator alarm, a work order created, PeakAssist contextual and offline.
- **Offline proof point:** the operator screen and help keep working with the internet physically unplugged.
- **AI-before-human proof point:** at least one real anomaly surfaced on an operator's alarm before a human noticed.
- **Compliance proof point:** at least one regulator-relevant report generated automatically from a period's monitored data, audit-backed.
- **Multi-site proof point:** a service provider manages multiple customer sites from one pane, isolation verified.
- **Trust validation:** SOC 2 Type II achieved and cited by enterprise buyers.
- **Extensibility proof point:** a real customer integrates a third-party/open-source device (or a new PLC) through the adapter framework without custom engineering from PeakLogic.
- **Loss-prevention proof point:** at least one real, quantifiable case of a PeakLogic alert preventing a costly loss, referenceable in sales.
- **Vertical reuse proof point:** a new vertical onboarded primarily through configuration and adapters, not net-new core engineering.
- **UX proof point:** device onboarding and operator-screen friction benchmarked as meaningfully simpler than the incumbents.
- **Enterprise proof point:** at least one enterprise deployment live using outbound-only networking, zero firewall/VLAN exceptions granted.

---

## 13. Key Risks & Assumptions

- **Assumption — customers pay to prevent losses and to automate compliance, not just absorb them.** Mitigation: lead with the highest-resonance losses (flooding a nursing home, spoiling a walk-in) and the non-optional pain of regulatory reporting.
- **Risk — scope explosion absorbing all of MooreView.** Mitigation: the unified-vision §4 disposition table (preserve/modernize/redesign/retire) is ruthless — harvest the operator surface, defer/retire CAD (MV Draw) and raw PLC programming; they are explicitly out of MVP.
- **Risk — "you're replacing our SCADA / touching our safety system" objection.** Mitigation: the above-SCADA guardrail, stated and repeated; primary-HMI positioning limited to greenfield/small sites.
- **Risk — offline reliability under-delivered erodes trust on the first outage.** Mitigation: Hub-local rendering + offline PeakAssist are MVP requirements; tested with the internet unplugged in the pilot.
- **Risk — compliance automation carries regulatory liability.** Mitigation: operator-assist framing (operator is filer of record), immutable audit trail, legal review before the Compliance tier ships.
- **Risk — AI false positives cause alarm fatigue.** Mitigation: AI ships as *context on* alarms in MVP (capped at warning, never auto-dispatch), tuned on real pilot data before raising its own alarms.
- **Risk — industrial protocol integration is genuinely hard.** Mitigation: pilot on one well-understood protocol (Modbus/OPC-UA); breadth is Phase 2.
- **Risk — a good device/protocol-adapter framework is a hard extensibility problem**, comparable to how long consumer platforms took to mature integration libraries. Scope realistically; "AI" does not make it trivial.
- **Risk — remote actuation carries safety/liability exposure if built carelessly.** Scoped as roadmap, fail-safe-local non-negotiable before any actuation ships.
- **Risk — merger terms could shift the PeakLogic-first foundation.** The unified-vision doc is the artifact to revise; the original `PeakLogic-Azure` repo remains the frozen standalone-PeakLogic fallback.
- **Assumption — the existing v1.0.0 validated patterns (RLS isolation, the infra stack structure) remain sound under this vision.** Checked continuously by the reconciliation sweep ([`unified-platform-integration-plan.md`](unified-platform-integration-plan.md)).

---

## 14. Stakeholders & Document Governance

- **Primary audience:** founding/architecture team (this is the shared reference for every subsequent artifact), future engineering hires, prospective investors, design-partner customers under NDA, and Purple Standard leadership under the merger.
- **Governance:** versioned in git with the rest of the architecture set. Material changes are called out explicitly and cross-checked against dependents — starting with the PRD. This v2 is a material reframe; it holds Draft status until formally approved, with v1 remaining the approved baseline in the interim.
- **Next artifact:** the PRD (#2), which translates §4–§12 into concrete, prioritized requirements and explicit MVP scope for the unified platform — the next step in the Phase-1 spine of the integration plan.

---

## Revision history

| Version | Date | Author | Notes |
|---|---|---|---|
| v1 | 2026-07-04 | PeakLogic | Initial vision — single-tier facilities risk intelligence platform. Approved. |
| Draft v2 | 2026-07-25 | PeakLogic | Unified-platform reframe: three-component model (PeakLogicSystems/PeakView360/PeakLogic Hubs) + PeakAssist; above-SCADA positioning; multi-site/service-provider/compliance-heavy targeting; MooreView absorption; compliance automation; per-facility offering tiers; canonical naming. v1 philosophy (proactive, measure-real-thing, outbound-only, fail-safe-local, SOC 2 from day one, fire/life-safety adjacency) preserved. Base v1 remains approved baseline until v2 is formally approved. |
| Draft v2 (amended) | 2026-07-27 | PeakLogic | §9 Competitive Positioning's Enterprise BMS/IWMS bullet cross-references the business vision doc's newly-formalized two-mode positioning (`../business/unified-product-vision.md` §7.3) — naming explicitly that PeakLogic *is* the SCADA/HMI against a regional facility with none, and sells the intelligence/compliance layer *above* an enterprise's existing BMS rather than competing for the control-room seat. Consistency amendment only; no change to §9's overall competitive framing or version status. |
| Draft v2 (amended) | 2026-07-27 | PeakLogic | Follow-up correction to the same §9 bullet: reworded the identity claim ("PeakLogic **is** the full SCADA/HMI") to a functional one ("a modern, cloud-native alternative to traditional SCADA" / sold "as a complementary operational layer"), and added an explicit note that PeakLogic is never marketed as "a SCADA system" or "a SCADA replacement" in either mode. Matches the same-day correction in `../business/unified-product-vision.md` §7.3 (Draft v0.3). Wording-only; no change to the two-mode strategy itself. |
