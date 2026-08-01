# PeakLogic — Intelligence & Control Layer for Essential Services

**Lightweight, web-based SCADA and predictive-intelligence platform** for the operators and service providers who run distributed systems, facilities, and device fleets — the sites where a traditional SCADA deployment has never made financial sense.

For distributed or cost-sensitive sites with no control system today, PeakLogic **is** the control and monitoring layer, at a fraction of a traditional SCADA build. For larger operations that already run one, PeakLogic is **complementary**: it fills the gap between raw field devices and heavyweight enterprise SCADA, and **feeds its data upward** into the systems those operators already use. It never touches safety-rated PLC control logic.

**Three components, one product:**
- **PeakLogicSystems** — the cloud intelligence layer (multi-tenant SaaS: multi-site monitoring, anomaly detection, predictive maintenance, compliance automation, reporting).
- **PeakView360** — the operator experience (real-time screens, alarm management, equipment dashboards, facility visualization, historian).
- **PeakLogic Hubs** — the on-prem edge units (PLC/RTU acquisition, edge processing, offline reliability, secure outbound-only cloud sync).
- **PeakAssist** — the offline-capable, contextual help system spanning all layers.

Company is **PeakLogic**; internal project codename **Project Vantage**. See [`docs/business/unified-product-vision.md`](docs/business/unified-product-vision.md) for strategy and `CLAUDE.md` for the architecture-first development process.

## Positioning

PeakLogic occupies a real gap in the market: **too small for traditional SCADA, too critical to leave unmonitored.** Enterprise SCADA and BMS platforms are expensive, slow to deploy, and built for large single campuses — not for an operator running twenty distributed sites, or a service contractor responsible for equipment across hundreds of customer locations.

The value is **predictive maintenance and risk mitigation**: catching critical device failure before it becomes an expensive repair, a replacement, a compliance violation, or downtime that costs far more than the equipment itself.

PeakLogic is **not** a fire alarm / life-safety system — that is a heavily regulated, UL-certified space we deliberately stay adjacent to. We cover the risk surface next to it: equipment health, facility conditions (leaks, temperature, humidity), and energy usage.

## Who it's for

**Facility operators** — where equipment failure means downtime, safety risk, or a compliance issue:
- **Water treatment & municipal wastewater** (primary beachhead)
- **Campus facilities** — assisted living, healthcare, senior living
- **Quick service restaurants (QSR)** — restaurants, gas stations, convenience

**Essential service providers** — the platform doubles as a predictive-analytics and intelligence layer these businesses use to optimize their own operations and reduce cost and risk for their customers:
- Septic companies
- Pool service providers
- Electrical contractors
- HVAC contractors

Common equipment across both: pumps, lift stations, commercial HVAC, refrigeration, electrical/energy panels, flow meters, and leak/level sensing — normalized into one live view regardless of vendor.

## What it does

Devices and gateways stream readings over secure, outbound-only connections. Each vendor's data is mapped to one common model, so nothing gets ripped and replaced. Configurable per-asset thresholds flag readings that drift out of range; critical alerts become service tickets automatically and flow into the CMMS and tools the operator already runs. Two examples that anchor the value proposition:

- **Leak detection**: a triggered sensor raises a critical alert immediately, aimed at catching (and eventually auto-shutting-off) a leak before it becomes water damage significant enough to shut down a facility.
- **Cold storage / food safety**: devices measure the **actual temperature of stored product** (a probe in the food/drink) rather than ambient air. This lets the unit run warmer and more efficiently while the product is still safely cold (energy savings), while still catching a real FDA cold-holding violation (41°F / 4.4°C) before product must be discarded.

Remote command/control of devices (e.g. actually shutting off a valve) is on the roadmap — see `CLAUDE.md` → "Future: Command & Control Architecture" for the network constraints that shape it.

---

## Architecture

Azure-native. See [`docs/architecture/target-reference-architecture.md`](docs/architecture/target-reference-architecture.md) for the full picture.

```
Devices / PeakLogic Hubs
   │  outbound-only MQTT/TLS, per-device X.509 (DPS-enrolled)
   ▼
Azure IoT Hub ──► Event Hub-compatible endpoint
                        │
                        ▼
              Azure Functions (ingest)  ──►  Azure Database for
                                             PostgreSQL Flexible Server
                                             (row-level security per tenant)
                        ▲
   Browser ─► API Management ─► Azure Functions (REST API)
   (React SPA)  (rate limiting)        │
                                       ▼
                          Microsoft Entra External ID
                          (customers · partners · staff — 3 isolated tenants)
```

**Stack:** Azure IoT Hub + DPS · Azure Functions (Flex Consumption) · API Management · PostgreSQL Flexible Server · Microsoft Entra External ID · Key Vault · Application Insights / Log Analytics · Bicep IaC

---

## Project Structure

```
PeakLogic-Azure-V2/
├── infra-azure/              # Bicep IaC — all Azure resources (active)
│   ├── modules/              # network, data, api, iot, apim, monitoring, budget, ingest-alerts
│   └── entra/                # Entra app registrations (3 tenants, deployed separately)
├── backend/                  # Azure Functions — API + ingest + scheduled jobs
│   ├── api/                  # REST handlers + routers
│   ├── ingest/               # Telemetry ingestion, rules, anomaly detection
│   ├── jobs/                 # Scheduled sweeps (silence detection, PM generation)
│   └── shared/               # DB/RLS, auth, alerts, CMMS, PeakAssist
├── frontend/                 # React + Vite SPA — tenant app
├── peakview360/              # React + Vite SPA — operator HMI/SCADA experience
├── channel-partner-portal/   # Partner white-label portal
├── customer-portal/          # Customer-facing portal
├── windows-hub/              # PeakLogic Edge — .NET agent for on-prem Hubs (Windows + Linux)
├── marketing/                # Public marketing site (static)
├── ops/                      # Operational tooling (cost kill switch)
├── scripts/                  # Admin tooling, DB migrations
├── docs/                     # Architecture artifacts, business strategy, data model
├── sysadmin-guides/          # Operator-facing system administration guide
├── user-guides/              # End-user guide
└── infra/                    # ⚠️ DEPRECATED — pre-pivot AWS CDK, retained for reference only
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- Azure CLI (`az`) with the Bicep extension
- .NET 8 SDK (only for `windows-hub/`, the PeakLogic Edge agent)
- GitHub CLI: `gh auth login`

### Common commands

```bash
# Backend
cd backend && npm ci
npm run typecheck && npm test

# Frontend / PeakView360
cd frontend && npm ci && npm run dev
cd peakview360 && npm ci && npm run dev

# Infrastructure (validate — deploying needs a real Azure subscription)
az bicep build --file infra-azure/main.bicep --stdout > /dev/null
```

See `CLAUDE.md` for the full command reference, deployment process, and release discipline.

---

## Branching Strategy

- `main` — production-ready, tagged releases only
- `dev` — active development (default working branch)
- `feature/<name>` — feature branches, PR into `dev`

## Commit Convention

```
feat: add device onboarding wizard
fix: correct tenant RLS policy on telemetry table
infra: add IoT Hub + DPS Bicep module
docs: update data model schema
chore: update dependencies
```
