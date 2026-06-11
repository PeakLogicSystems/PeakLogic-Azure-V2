# PeakLogic

Multi-tenant, cloud-native IoT SaaS platform for asset, energy, and risk management.

## Verticals
- Pumping stations
- Quick service restaurants (QSR)
- Pool service monitoring

## What it does
Low-cost IoT devices detect abnormal equipment behavior early, reduce risk of damage, and proactively trigger service tickets to partners.

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
