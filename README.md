# PeakLogic — PeakVantage Hub / PeakVantage 360

Multi-tenant, cloud-native IoT platform for facilities and risk management — targeting small-to-mid-tier commercial and residential properties, built to scale to enterprise.

**PeakVantage Hub** is the core intelligence/monitoring hub; **PeakVantage 360** is the full device + software ecosystem built on it. (Placeholder product naming as of 2026-07 — not yet trademark-cleared.) Company is PeakLogic; `PeakLogicSystems` remains the engineering/repo name for the underlying cloud software. See `CLAUDE.md` for the architecture-first development process this project now follows.

## Positioning

PeakLogic is **not** a fire alarm / life-safety system (that's a heavily regulated, UL-certified space we deliberately stay adjacent to, not inside). Instead, we cover the risk surface next to it: equipment health, facility conditions (leaks, temperature, humidity), and energy usage — the everyday failures that cause costly losses (water damage, spoiled inventory, equipment downtime) but aren't covered by fire/alarm code.

## Verticals

Initial anchor verticals, with the platform designed to extend to any small/mid-tier commercial site:
- Pumping stations
- Quick service restaurants (QSR) & food service
- Pool service monitoring
- Nursing homes / senior living (leak & equipment risk)
- Cold storage / refrigeration (walk-in coolers, freezers — see below)
- Retail & light industrial facilities

## What it does

Low-cost IoT devices detect abnormal equipment and facility conditions early, reduce risk exposure (e.g. an undetected leak or a failed cooler compressor causing a shutdown-level loss), and proactively trigger service tickets to partners. Two examples that anchor the value proposition:

- **Leak detection**: a triggered sensor raises a critical alert immediately, aimed at catching (and eventually auto-shutting-off) a leak before it becomes water damage significant enough to shut down a facility.
- **Cold storage / food safety**: devices measure the **actual temperature of stored food/drink** (a probe in the product) rather than ambient air temperature. This does two things at once — lets the unit run warmer and more efficiently when the product itself is still safely cold (energy savings), while still catching a real FDA cold-holding violation (41°F / 4.4°C) before product has to be discarded.

Remote command/control of devices (e.g. actually shutting off a valve) is on the roadmap — see `CLAUDE.md` → "Future: Command & Control Architecture" for the network design constraints that shape it.

---

## Architecture (MVP)

```
IoT Devices → AWS IoT Core → Lambda (ingest) → RDS Postgres
                                                      ↓
                                          API Gateway + Lambda (REST)
                                                      ↓
                                          Cognito (SSO + RBAC)
                                                      ↓
                                          React SPA (S3 + CloudFront)
```

**Stack:** AWS IoT Core · Lambda · API Gateway · RDS Postgres · Cognito · S3 · CloudFront · SES

---

## Project Structure

```
peaklogic/
├── infra/          # AWS CDK (TypeScript) — all cloud resources
├── backend/        # Lambda functions + shared layers
│   ├── api/        # REST API handlers
│   ├── ingest/     # IoT telemetry ingestion
│   └── shared/     # DB client, auth middleware, types
├── frontend/       # React + Vite SPA
└── docs/           # Architecture decisions, data model, runbooks
```

---

## Getting Started

> Setup instructions will be added as each layer is built.

### Prerequisites
- Node.js 20+
- AWS CLI configured
- AWS CDK CLI: `npm install -g aws-cdk`
- GitHub CLI: `gh auth login`

---

## Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | 🔄 In progress | Repo setup, architecture, data model |
| 2 | ⏳ Planned | AWS infra (CDK): IoT Core, RDS, Cognito, API GW |
| 3 | ⏳ Planned | Device onboarding + telemetry ingestion |
| 4 | ⏳ Planned | Backend REST API |
| 5 | ⏳ Planned | React frontend: auth, dashboard, alerts |
| 6 | ⏳ Planned | Alert rules + service ticket generation |

---

## Branching Strategy

- `main` — production-ready code only
- `dev` — integration branch
- `feature/<name>` — feature branches, PR into `dev`
- `fix/<name>` — bug fixes

## Commit Convention

```
feat: add device onboarding wizard
fix: correct tenant RLS policy on telemetry table
infra: add Cognito User Pool CDK construct
docs: update data model schema
chore: update dependencies
```
