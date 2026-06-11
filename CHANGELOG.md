# Changelog

All notable changes to the PeakLogic platform are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Security
- **Known: esbuild/Vite dev-server CORS vulnerability** (GHSA-67mh-4wv8-2f99, moderate severity). Affects `vite <=6.4.1` via `esbuild <=0.24.2`. **Production is not affected** — the vulnerability only allows a malicious website to query the local Vite dev server while `npm run dev` is running. Fix requires upgrading Vite v5 → v8 (breaking change); scheduled for v1.1.0 with proper migration testing.

---

## [1.0.0] — 2026-06-10

### Added

**Infrastructure (AWS CDK v2)**
- `PeakLogic-Network` stack: VPC (2 AZ), public/private/isolated subnets, NAT Gateway, Lambda and RDS security groups
- `PeakLogic-Data` stack: RDS PostgreSQL 16 (db.t3.micro), encrypted storage, 7-day backups, Secrets Manager credentials
- `PeakLogic-Auth` stack: Cognito User Pool with email sign-in, TOTP MFA, RBAC groups (admin/operator/service_partner), PKCE SPA client
- `PeakLogic-Api` stack: Two Lambda functions (peaklogic-api, peaklogic-ingest), API Gateway REST with Cognito authorizer, 200/100 burst/rate throttling
- `PeakLogic-IoT` stack: IoT Core Thing type (PeakLogicSensor), per-device scoped MQTT policy, topic rule routing telemetry to ingest Lambda
- `PeakLogic-Frontend` stack: Private S3 bucket with CloudFront OAC distribution, HTTPS enforcement, SPA 404 fallback

**Backend API (18 endpoints)**
- Full CRUD for Sites, Assets, Devices, Tickets (`/v1/{resource}` and `/v1/{resource}/{id}`)
- Read + acknowledge/resolve/suppress for Alerts
- Time-series telemetry query endpoint with deviceId, metric, from/to, limit params
- Device claim flow: `POST /v1/devices` finds unclaimed device by serial and assigns to tenant
- Multi-tenant request pipeline: `getAuth()` → `requireRole()` → `withTenant()` (PostgreSQL RLS)
- Module-level `pg.Pool` singleton (max 2 connections) with Secrets Manager credential caching

**Telemetry Ingest**
- IoT Core-triggered Lambda processes MQTT payloads, bulk-inserts telemetry, updates device heartbeat
- Hardcoded threshold alert rules for pump, hvac, and pool_system asset categories
- Alert deduplication: skips creation if open/acknowledged alert exists for same device+metric+severity
- Auto-creates emergency service ticket + fires partner webhook on CRITICAL alerts (8s timeout)

**Frontend (React 18 + Vite + Tailwind CSS)**
- Cognito authentication via AWS Amplify v6 with PKCE flow; `VITE_PREVIEW=true` bypass for local development
- Pages: Dashboard, Sites, Assets, Devices, Alerts, Tickets
- Device onboarding wizard: 2-step claim-by-serial + assign-to-asset flow
- Dark sidebar layout with PeakLogic branding (brand-purple #7C3AED, brand-green #22C55E)
- `useApi` hook and typed `apiFetch` client with automatic JWT injection

**Database**
- PostgreSQL schema with Row-Level Security on all tenant-scoped tables (users, sites, assets, devices, telemetry, alerts, service_tickets)
- `withTenant()` transaction wrapper sets `SET LOCAL app.current_tenant_id` for RLS enforcement
- Composite index on `telemetry(tenant_id, device_id, time DESC)`

**Scripts & Tooling**
- `scripts/provision-devices.ts`: provisions IoT Core Things + X.509 certificates + DB records; idempotent; supports `--count`, `--serials`, `--db-only`, `--region` flags
- Device certificate bundle saved per device: `certificate.pem`, `private.key`, `device-config.json`

**Documentation**
- `docs/data-model.sql`: full PostgreSQL schema with RLS policies
- `README.md`: architecture overview, stack summary, branching conventions
- `PeakLogic_SysAdmin_Guide.html`: comprehensive system administrator reference (15 sections)
- `CLAUDE.md`: codebase guidance for Claude Code AI assistant
- `PeakLogic Claude Dev Session V1_06102026.txt`: full development session transcript

---

[Unreleased]: https://github.com/PeakLogicSystems/PeakLogicSystems/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/PeakLogicSystems/PeakLogicSystems/releases/tag/v1.0.0
