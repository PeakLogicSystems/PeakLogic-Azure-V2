# Changelog

All notable changes to the PeakLogic platform are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Security
- **Known: esbuild/Vite dev-server CORS vulnerability** (GHSA-67mh-4wv8-2f99, moderate severity). Affects `vite <=6.4.1` via `esbuild <=0.24.2`. **Production is not affected** — the vulnerability only allows a malicious website to query the local Vite dev server while `npm run dev` is running. Fix requires upgrading Vite v5 → v8 and vitest v2 → v4+ together (breaking change); deferred past v1.1.0 to keep that release proportionate to what's actually shipping (tracked as TD-11, Technical Debt Register).

---

## [1.1.0] — 2026-07-12

The architecture-first governance process (`docs/architecture/`, adopted after v1.0.0) drove this entire release: every item below traces to a specific approved architecture artifact, and the two Critical security fixes were found *during* that process, not reported externally.

### Added

**Channel-Partner Portal** (white-label operational dispatch for pool-servicing channel partners — PRD v1.5/SRS v1.5)
- Second, separate Cognito user pool (`PartnerPool`) with its own authorizer — channel-partner logins are structurally isolated from tenant logins, not a themed variant of the same pool
- 17 new `/v1/partner/*` REST endpoints across 4 route handler files: self-read/branding (white-label logo + colors), territory CRUD (map-drawn boundaries, GeoJSON wire format over PostGIS storage), technician/dispatcher provisioning (creates a real Cognito account via `AdminCreateUserCommand`, not just a DB row), and route management with an explicit `suggested → confirmed` state machine (an AI-suggested daily route is never authoritative until a human confirms it)
- 4 new database tables: `territories`, `channel_partner_users`, `route_assignments`, `route_stops`; `channel_partners` gained `branding` (JSONB) and `status` (active/suspended) columns
- Real, cross-tenant Row-Level Security for the portal — a channel partner's session can read across every tenant attributed to it, and a technician's session is further scoped to their own assigned territory and their own day's route, all enforced at the database layer
- `writeAuditLog()` — dual-scope (tenant/channel-partner) audit logging, implemented for the first time (previously designed but never actually built despite earlier documentation claiming otherwise)

**Sensing**
- New `pool_chemistry` alert-rule category — pH and free-chlorine thresholds cited to CDC's Model Aquatic Health Code (5th Ed., Dec 2024); TDS threshold cited to pool-industry consensus guidance. Total chlorine remains unimplemented (disclosed, tracked as TD-25)
- New `gas_sensor` alert-rule category — binary leak-detected signal, structurally identical to the existing `leak_sensor` category

**Infrastructure & Delivery**
- `MonitoringStack` — 5 CloudWatch alarms per stage (API/ingest Lambda errors, API 5xx, RDS CPU/storage) plus an SNS topic; zero monitoring existed before this
- `CiCdStack` and a full GitHub Actions pipeline (`ci.yml`, `deploy-dev.yml`, `deploy-staging.yml`, `deploy-prod.yml`) — OIDC-federated deploy roles, no long-lived AWS keys in GitHub
- Stage-parameterized deployments — every `cdk` command now requires an explicit `-c stage=dev|staging|prod` with no default, and RDS Multi-AZ/deletion-protection/instance-size/NAT-gateway-count are all stage-conditional instead of a manual "flip before prod" step
- RDS credential rotation (30-day schedule, all stages)
- `cdk-nag` (`AwsSolutionsChecks`) wired into every `cdk synth`
- A real automated test suite where none existed before: 65 backend unit tests, 25 backend RLS-focused integration tests (self-skip cleanly without a real database), 5 infrastructure CDK-assertion tests

### Changed
- **Row-Level Security is now actually enforced against the application's own database role** (`FORCE ROW LEVEL SECURITY` applied to all 14 RLS-enabled tables). Previously the application connected as the same role that owns every table, and PostgreSQL table owners silently bypass RLS by default — meaning every "RLS enforces tenant isolation" claim in this project's history, back to the first migration, described a mechanism that would not have actually held once deployed. See Fixed (Security) below.
- `devices.tenant_id` changed from `NOT NULL` to nullable, matching the claim/provisioning flow's actual pre-claim state (an unrelated, pre-existing bug found while fixing the RLS gap above)
- API Gateway CORS restricted from `Cors.ALL_ORIGINS` to the two real frontend origins
- Database connections now validate the RDS TLS certificate (`rejectUnauthorized: true`) instead of skipping validation
- MFA enforced pool-wide (`Mfa.REQUIRED`) for the tenant user pool
- Orphaned `service_partner` Cognito group removed — no route ever checked for it, so anyone placed in it would have had unintended full tenant-data read access

### Fixed

**Security — Critical**
- `telemetry` table had zero Row-Level Security, the one exception among every tenant-scoped table — any authenticated user of any tenant could read any other tenant's raw sensor data by passing another tenant's `device_id` to `GET /v1/telemetry`. Live, exploitable in shipped v1.0.0 code.
- RLS was never enforced against the application's own database role, project-wide (see Changed above) — the most severe finding in this project's architecture-review history. Never live-exploited (nothing had been deployed to a real AWS account), but would have been on first real deploy.
- `POST /v1/tickets` accepted an arbitrary `webhookUrl` from the request body with zero validation — a live SSRF letting any authenticated `operator`+ user make the Lambda send outbound requests anywhere, including internal network reconnaissance. Fixed with a shared, tested `postWebhook()` helper (HTTPS-only, resolves the hostname, rejects private/loopback/link-local address ranges).

**Security — Other**
- `getAuth()`'s role resolution failed *open* to `'operator'` when a Cognito user had no group assigned, instead of failing closed — now returns 403.
- `tenants.status` (active/suspended/trial) existed in the schema with zero enforcing code — a suspended tenant could keep fully using the platform. Now checked inside `withTenant()`.
- Device claim and provisioning (`devices.ts`, `provision-devices.ts`) connected to the database with zero Row-Level Security session variables set. Fixed with dedicated session markers and layered RLS policies.
- Telemetry ingest wrote metric values with zero runtime validation — a malformed value could reach the database and rule engine unchecked. Fixed with a pure, testable `sanitizeMetrics()` function.
- A leak in the device-claim RLS fix's own first draft — an unscoped lookup policy would have exposed every unclaimed device system-wide to any tenant's device list. Caught in a dedicated third review pass before ever shipping; never live.

**Other**
- CI/CD's originally-designed production-deploy required-reviewer approval gate tested as non-functional on this repository's current GitHub billing tier (a live `422`) — redesigned to manual-dispatch-only, matching staging, so it no longer silently provides zero real approval gate.
- Cross-stack reference strength pinned explicitly, closing an unaddressed CDK synth warning present since the first deploy of this stack.

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
