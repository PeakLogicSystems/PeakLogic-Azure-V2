# PeakLogic — Product Description

**Artifact #40** · v1.0 · 2026-08-02
**Status:** Current. Describes what is built, what is designed, and what is roadmapped, separately and without blurring the three.

---

## 1. What PeakLogic is

An intelligence layer for essential field services.

PeakLogic connects the equipment a business already operates and services — pumps, treatment units, chemistry, refrigeration — to monitoring, alerts, automation, and dispatch. Issues surface early, and the right work lands in the right system. Asset visibility and risk reduction, delivered as a service.

It sits between two bad options. **Autodialers** are cheap and call once the water is already too high. **Traditional SCADA** produces excellent data and is priced and scoped as a capital project. Most distributed assets — lift stations, aerobic treatment units, package plants, commercial pools, walk-in refrigeration, light commercial mechanical rooms — fall into the gap and are monitored by nobody.

Where a plant already runs SCADA, PeakLogic complements it: it instruments the long tail that platform cannot economically reach, and feeds normalised data upward into it. It does not replace safety-rated control logic.

---

## 2. The four-step chain

Most competitors stop after the first step, which is why an alarm reaches a phone and nothing else happens.

| Step | What it does |
|---|---|
| **Monitor** | Mixed-vendor equipment on one platform, over cellular or the site's own network |
| **Predict** | Per-asset baselines catch degradation — rising draw, longer cycles, drifting chemistry — before the failure it becomes |
| **Dispatch** | An alarm becomes a work order in the servicing partner's own system, routed to whoever is accountable |
| **Prove** | The record a regulator, an insurer, or a disputing customer asks for, compiled as it happens |

---

## 3. Platform architecture

Five named layers. The naming is locked (`CLAUDE.md`).

| Layer | Name | What it is |
|---|---|---|
| Cloud intelligence | **PeakLogicSystems** | Multi-tenant SaaS: ingest, analytics, compliance, work-order dispatch |
| Operator HMI | **PeakView360** | Live per-site view — Facility View, Historian, Equipment, docked alarm panel |
| Edge | **PeakLogic Hub** | On-site gateway. Acquires from PLCs/RTUs, serves PeakView360 over the LAN, stores and forwards |
| Help | **PeakAssist** | Contextual guidance on every screen, and an explanation attached to every alarm type |
| Operations | **Agent team** | Sixteen background agents across engineering, operations, data, and security |

### Front-end surfaces

Three portals and one operator app — not one application with role-based menus.

- **Customer Portal** — equipment owners. Their sites, their alerts, their compliance reports. Read-only: the customer watches, the partner services.
- **Partner Portal** — a service company's whole book of business. White-labelled per partner, with branding configured centrally.
- **Control Center** — PeakLogic staff only. Fleet overview by fan-out, audited act-as, device twins, firmware channels, branding, and the agent team.
- **PeakView360** — launched from inside a portal for a given site. Not a separate login.

### Tenant isolation

Every tenant-scoped query runs inside a transaction that sets `app.current_tenant_id`, activating PostgreSQL row-level security. Partner and staff contexts have their own equivalents. A site the platform holds no data for is **refused**, not approximated — the operator view renders nothing rather than falling back to another customer's facility.

---

## 4. Product packs

Packaged by what the site is, because a lift station and a hotel pool need different thresholds, different reports, and different words.

| Pack | Contents |
|---|---|
| **Lift Station** | Control panel upgrade, pump alternation and level logic, fleet view, critical work orders |
| **ATU Compliance** | Panel or gateway, treatment monitoring, service reminders, compliance reports |
| **Integrated Site** | Every lift station and treatment unit on one property, one dashboard |
| **WWTP Lite** | Aeration, lift station, and disinfection monitoring for package plants |
| **Pool** | Chemistry, ORP, salt cell, filter pressure, pump speed, turnover |
| **Cold Chain** | Walk-in and rack temperature, compressor short-cycling, door events |
| **Living Campus** | Assisted living and healthcare: HVAC comfort, kitchen cold, generator exercise, DHW, leak detection |

---

## 5. Capabilities, by build state

Stated separately because the distinction is what makes the rest credible.

### Built and tested

- **Telemetry ingest** with at-least-once deduplication, poison-message capture, and range sanitising. A bad PLC read never becomes a fabricated reading.
- **Threshold alerting** — per-category rule sets, plus a config-driven Policy Engine with platform, tenant, site, and asset overrides. The compiled rules remain the permanent fail-safe: a safety monitor must never fail into silence.
- **Anomaly detection (Tier 1)** — per-device EWMA baselines and sigma scoring. Capped at `warning` severity: it has no measured precision yet, so it cannot dispatch a technician.
- **Device- and Hub-silence detection** — absence is a signal. Every threshold rule needs a value to test, so a dead sensor would otherwise be indistinguishable from a healthy one.
- **Connection-behaviour anomaly** — reporting cadence scored the same way a telemetry value is. An unusually short interval reads as flooding or replay; a long one is an early warning before full silence.
- **Hub agent integrity** — a reported agent version PeakLogic never published raises a tamper alert.
- **CMMS work-order lifecycle** — dispatch funnel tracked on timestamps, not a status enum, producing a real conversion KPI and a service-visit record that feeds the learning loop.
- **Compliance report generation** — DMR drafts with coverage-gap honesty: a parameter with no readings is reported as a gap, never interpolated. The operator remains the filer of record.
- **PeakAssist** — authored content corpus with governance tests that fail the build if a screen has no guide or an alarm type has no explanation.
- **Telemetry normalisation** — raw PLC values to engineering units, with unmapped and rejected states that are never silently dropped.
- **Facility View** — projected isometric scene per site, with orthographic views and locate-by-sensor-type.

### Designed, not built

- Predictive maintenance Tier 2 (failure-mode prediction), prescriptive Tier 3 (LLM enrichment via Claude on Microsoft Foundry)
- Four of the sixteen agents, including **WARDEN-TEN**, the tenant-isolation prover — the highest-priority gap
- Compliance evidence packs, restore drills, secrets and certificate lifecycle

### Roadmapped

- **Actuation.** No code path issues a device command today and no permission grants one. Control is planned, because operators will want remote reset, setpoint change, and shutoff. The authorisation model, safety interlocks, and audit trail are being designed **before** any command path exists, and safety-critical trips will stay local to the equipment rather than depending on a cloud round trip.
- Facility Builder authoring (MV Draw merge), site photography as a live-view backdrop
- Cross-tenant benchmarking — explicitly not built, and carrying real legal caveats

---

## 6. Deployment

Azure-native throughout. IoT Hub with DPS, Azure Functions on Flex Consumption, API Management, PostgreSQL Flexible Server with PostGIS, Microsoft Entra External ID across three isolated tenants, Key Vault, Application Insights, all defined in Bicep.

Devices connect **outbound** over MQTT/TLS with per-device certificates. No inbound firewall rule, port forward, or dedicated VLAN is ever required on a customer network — which matters, because most target customers will not grant them.

**No environment has been deployed.** Infrastructure is compile-validated and CI runs typecheck, unit tests, integration tests against real PostgreSQL, dependency audit, and PSRule best-practice checks on every push. Everything above describes code that exists and is tested, not code that is running in production.

---

## 7. What PeakLogic will not do

- Replace a permitted, safety-rated PLC without an equipment-maker partner
- Submit filings to a regulator or assume regulatory responsibility
- Replace a licensed inspector
- Build a city-wide hydraulic model
- Train models across tenants, or benchmark one customer against another

---

## 8. Related documents

- `docs/business/infrastructure-and-compute-forecast.md` — cost per site, scaling inflection points
- `docs/architecture/prd.md`, `srs.md`, `domain-model.md` — requirements and data model
- `docs/architecture/agent-operations-team-design.md` — the sixteen agents
- `docs/architecture/water-sector-security-hardening-strategy.md` — security posture and the incident that drove it
