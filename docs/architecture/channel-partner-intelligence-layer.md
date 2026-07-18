# Channel Partner Intelligence Layer — Positioning & Capability Architecture

**Status:** 🟡 Draft v0.1 (2026-07-18)
**Purpose:** Fix the strategic positioning of the channel-partner offering and map it onto the architecture already designed — so every capability decision traces to a coherent value thesis. Reframes the partner portal from "another app" into an **intelligence and estate layer** that overlays a partner's *existing* business.
**Reads with:** [Target Reference Architecture](target-reference-architecture.md), [Platform Services](platform-services-architecture.md), [Policy Engine](policy-engine-design.md), [CMMS Dispatch & KPI](reporting-and-kpi-design.md).

---

## 0. The thesis

A channel partner (a pool-service company, an HVAC contractor, a facilities firm) already has a business: customers, technicians, trucks, a CMMS/FSM they dispatch from, a revenue model. **PeakLogic does not replace any of that.** It gives them an **intelligence and estate-management layer** they log into to onboard customers and devices, monitor equipment, set thresholds, and get AI analytics — and the *output* of that intelligence flows **back into their own management systems**. The result: the partner adds a sensing-and-intelligence tier on top of their pre-existing model, delivering higher-quality, more efficient, more proactive service — and growing/optimizing their revenue while doing it.

**One line:** PeakLogic is the partner's **system of intelligence**, not their system of record. It senses, analyzes, and decides what needs attention; their existing systems remain where the work is scheduled, billed, and recorded.

---

## 1. The load-bearing principle

> **Overlay, don't replace. Intelligence flows out to the partner's systems of record.**

This principle resolves a lot of design questions at once:

- The **CMMS integration is an *output* connector**, not a workflow the partner must adopt ([CMMS design](reporting-and-kpi-design.md)). We push work orders *into* their CMMS; we never ask them to abandon it. That's why the connector framework is bi-directional and vendor-adapter-based rather than a PeakLogic ticketing product they must migrate to.
- The partner's **existing business model is the substrate**; PeakLogic is additive. Adoption friction stays low because nothing they already run gets thrown away.
- PeakLogic's job is to be **the best sensing + intelligence + decisioning layer**, and to integrate cleanly outward — not to become an ERP/CRM/CMMS. That keeps scope honest and the product sharp.

---

## 2. The partner capability journey → architecture map

Everything the partner does in the layer, mapped to what's already designed or built vs. the one real gap:

| Partner capability | What it means | Maps to | State |
|---|---|---|---|
| **Log in** | Branded, isolated partner access | `PeakLogicPartners` Entra External ID tenant; white-label branding | Designed (identity ported; branding partial) |
| **Onboard customers** | Add & attribute customer orgs | Tenant/attribution model; `account`/partner attribution | Built (data model) |
| **Onboard devices** | Register + field-provision equipment | ZTP + [Device Onboarding](device-onboarding-and-telemetry-acquisition.md) (register-in-cloud → connect → config-push) | Designed (roadmap) |
| **Monitor** | Live estate view: sites → assets → devices, health, alerts | Telemetry ingestion + dashboards + Super-Console-style views (shared UI package) | Built/designed |
| **Set thresholds** | Tune what alerts, per customer/site/asset | **[Policy Engine](policy-engine-design.md)** — tenant/site/asset threshold overrides, inheritance, audited | **Built (steps 1+3), flag-gated** |
| **Get AI analytics** | Anomaly / predictive / prescriptive intelligence beyond fixed thresholds | **AI Analytics layer (§3)** | **GAP — not yet designed** |
| **Output to their systems** | Actionable work → their CMMS/FSM | **[CMMS dispatch connector](reporting-and-kpi-design.md)** (bi-directional) | Designed |
| **Grow / optimize revenue** | Prove & compound the value | **[Conversion KPI + scorecards + Reports](reporting-and-kpi-design.md)** | Designed |

**The map's punchline:** six of the seven capabilities already have a home in the architecture. The one genuine gap this positioning surfaces is a first-class **AI Analytics layer** — which is also the word the partner value story leans on hardest ("intelligence layer").

---

## 3. The AI Analytics layer (the named gap)

"Get AI analytics" is currently under-specified — the Policy Engine gives *deterministic* threshold intelligence, but the "intelligence layer" promise implies more. This is a distinct capability to design (not now, but named honestly), built on foundations we've already laid:

- **Anomaly detection** — learn a device/asset's normal behavior (there's already a `metric_baselines` table in the schema) and flag deviations the fixed thresholds miss. Feeds new alerts/policies.
- **Predictive maintenance** — trend toward failure (pump degradation, compressor drift, filter loading) → dispatch *before* the breakdown. This is the sharpest revenue lever: proactive service the partner can sell.
- **Prescriptive recommendations** — not just "something's wrong" but "likely cause + recommended action," attached to the CMMS work order so the tech arrives informed.

**What it builds on (already designed):** the canonical telemetry from the **Normalization Fabric** (vendor-agnostic input), the **Device Capability Model** (knowing what each metric means), and the **Policy Engine** (a learned anomaly can *emit* a policy/alert through the exact same audited path). So the AI layer is an *additive* module over the platform's existing spine, not a parallel stack.

**Discipline:** design it against a real, named need (predictive maintenance for a specific asset class a launch partner cares about), on the same secure foundation (per-tenant models, RLS, fan-out) — not as a speculative "AI everything" bolt-on.

> **Now designed:** [`ai-analytics-layer-design.md`](ai-analytics-layer-design.md) — anomaly (on `metric_baselines`) → predictive (labeled by the CMMS outcome loop) → prescriptive (work-order enrichment), emitting through the existing alert pipeline, advisory-never-authoritative, classical-first.

---

## 4. The revenue thesis (why a partner buys this)

The positioning isn't just architectural — it's the commercial story the KPI/reporting exists to *prove*:

1. **Reactive → proactive service.** Predictive/threshold intelligence turns "wait for the customer to call" into "we already dispatched." Higher-margin planned work, fewer emergencies.
2. **A new recurring-revenue line.** The partner can resell *monitoring* as a subscription on top of break-fix — recurring revenue on their existing customer base, with PeakLogic as the engine.
3. **Efficiency.** Fewer wasted truck rolls (know before you go), better routing, informed techs (prescriptive work orders). More jobs per tech per day.
4. **Quality & retention.** Catching a food-safety excursion or a pool-chemistry breach before it becomes an incident is a retention and reputation win.
5. **Provable value.** The **auto-ticket → service-call conversion KPI and partner scorecards** ([CMMS/KPI design](reporting-and-kpi-design.md)) quantify all of the above — the evidence a partner needs to justify the spend and that PeakLogic needs to justify the price. The KPI is *partner-facing*, not just PeakLogic-internal.

Every one of these compounds the partner's *existing* model rather than competing with it — which is the whole point of "intelligence layer on top of," and why adoption risk is low.

---

## 5. What stays true (the guardrails)

- **Isolation unchanged.** A partner sees only their attributed accounts; a customer never sees the partner console; the AI models and analytics are per-tenant/partner-scoped and fan-out-computed — the same [Target Ref §5.3](target-reference-architecture.md) rule. The intelligence layer widens capability, not the attack surface.
- **Secretless outward integration.** CMMS/system-of-record credentials live in Key Vault as references, resolved via managed identity.
- **Overlay, not lock-in.** Because the output is standard connectors into the partner's own systems, PeakLogic earns its place on value, not switching-cost captivity — the healthier long-term position.

---

## 6. What this reframes / decides

- The **channel-partner portal's scope** is settled: an estate-management + intelligence surface (onboard, monitor, set thresholds, AI analytics), with integration-out — *not* a CMMS/FSM/CRM. Future feature requests get measured against "does this strengthen the intelligence layer, or drift us into being a system of record we shouldn't own?"
- **AI Analytics** is now an explicitly-tracked capability with a home in the architecture and a foundation to build on — no longer an unnamed promise.
- The **KPI/scorecards are repositioned as partner-facing** growth tooling, not only PeakLogic-internal value reporting.

---

## 7. Artifact amendments when this shapes real work

**User Personas / PRD / Vision** (the channel-partner value positioning; partner-facing analytics & scorecards), **Platform Services** (AI Analytics named as a service alongside the existing eight), a future **AI Analytics design doc** (anomaly/predictive/prescriptive, built on `metric_baselines` + normalization + capability model + Policy Engine), and the **channel-partner portal spec** (estate + intelligence scope, integration-out).
