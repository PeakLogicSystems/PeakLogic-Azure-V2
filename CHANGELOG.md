# Changelog

All notable changes to the PeakLogic platform are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed
- **Clock format and time zone (Settings, v1.2.0) had no effect anywhere except the Settings page itself** — they were local component state, not shared app state, so a change never reached the Dashboard chart, Device Detail chart, or anywhere else. Moved into a new `PreferencesContext` (same shape as the already-working `ThemeContext`) and wired `frontend/src/lib/datetime.ts`'s formatting helpers into every place a time is actually rendered. Added a live clock to the Dashboard header as the clearest at-a-glance proof the setting is applied.
- **Light/dark mode appeared broken in the local dev preview** — root cause was a stale `npm run dev` process still serving the OS-level `@media (prefers-color-scheme: dark)` compiled CSS from before `tailwind.config.ts`'s `darkMode: 'class'` was added, compounded by a Windows quirk where killing the process didn't free port 5173, so a second server silently started on 5174 while testing kept hitting the stale one. The code itself was always correct — confirmed via a direct `npx tailwindcss` CLI build and a full `npm run build`, both correctly class-scoped. No code change needed, only a clean server restart.

### Added
- **Full international time zone selector** (SET-3) — a searchable combobox (`TimezoneSelect`) backed by `Intl.supportedValuesOf('timeZone')`, the complete ~400-zone IANA database with UTC offset labels, replacing the original 6-city US-only dropdown.
- **Real domain: `peaklogicsolutions.com`** (purchased via Cloudflare; DNS stays at Cloudflare, not migrated to Route53). New `infra/lib/domain-stack.ts` (one shared ACM certificate per stage, DNS-validated) and `infra/lib/marketing-stack.ts` (public marketing site — a "Coming Soon" splash page today, `marketing/index.html`, no build step). The app (`frontend-stack.ts`) now serves at `app.{domain}` instead of a raw CloudFront default domain. Replaced the `app.peaklogic.io` placeholder `allowed-origins.ts` had referenced since before this project had any real domain — closed TD-10 (CloudFront TLS 1.0) in the same change, now `staging`/`prod`-appropriate `TLS_V1_2_2021` on both distributions.
- **Cost kill switch** (`infra/lib/budget-stack.ts`, user-requested) — an AWS Budgets-based automated cost guard, no custom Lambda. A monthly cost budget (`-c budgetLimitUsd=`, default $5) emails at 50%/80% of the limit, then automatically stops the stage's RDS instance at 100% via AWS's native Budget Actions feature (its own documented `AWSBudgetsActions_RolePolicyForResourceAdministrationWithSSM` managed policy, not a hand-rolled equivalent). Requires `-c budgetAlertEmail=` at deploy time — fails synth loudly if omitted, same "no silent default" discipline as `-c stage=`. Disclosed limitations, not hidden: AWS Budgets track account-wide spend, not per-stage (fine under this project's current single-stage-at-a-time reality); billing data has reporting lag, so this is a strong fast response, not an instant circuit breaker; a Budget-Action-stopped RDS instance is still subject to AWS's own platform rule that it auto-restarts after 7 days, so this buys a pause, not a permanent shutdown.

### Changed
- **Corrected a wrong cost-saving claim in the SysAdmin Guide**: an earlier note claimed setting `natGateways: 0` and moving Lambda to public subnets reduces the NAT bill while staying functional — this is false, Lambda ENIs never receive a public IP even in a public subnet, and the change would have broken every database connection (`db.ts`'s Secrets Manager call for the RDS credential). Verified against AWS's own documentation before correcting.

### Security
- **`dev` stage RDS credential deliberately bypasses Secrets Manager** (TD-43, Technical Debt Register) — a plaintext password via CDK context (`-c devDbPassword=...`) instead of an auto-generated, access-controlled, rotated secret, paired with `natGateways: 0` for `dev`. A real, user-approved home-lab cost trade-off to reach $0/month for a minimal-device dev deployment — `staging`/`prod` are completely unaffected, both still use `fromGeneratedSecret()`. **Hard gate, tracked in `CLAUDE.md` and the Technical Debt Register: must be reverted before any real customer data touches this deployment, and must never be promoted to `staging`/`prod`.**
- **Known: esbuild/Vite dev-server CORS vulnerability** (GHSA-67mh-4wv8-2f99, moderate severity). Affects `vite <=6.4.1` via `esbuild <=0.24.2`. **Production is not affected** — the vulnerability only allows a malicious website to query the local Vite dev server while `npm run dev` is running. Fix requires upgrading Vite v5 → v8 and vitest v2 → v4+ together (breaking change); deferred past v1.1.0 to keep that release proportionate to what's actually shipping (tracked as TD-11, Technical Debt Register).

---

## [1.2.0] — 2026-07-12

The full architecture-first cycle for the Internal Administration Console, Settings & Preferences, and the Site → Asset → Device drill-down (PRD/SRS v1.6, 7 amended architecture artifacts). A real design bug — a circular row-level-security self-lookup policy — was caught and fixed during implementation, before any code shipped.

### Added

**Internal Administration Console** (superuser cross-tenant management for PeakLogic's own staff)
- Third, separate Cognito user pool (`StaffPool`) — `superadmin`/`account_manager` groups, unlike the group-less Partner Pool: role must be known before any database round-trip, since the cross-tenant "act as" handoff's own row-level security depends on it
- `superadmin`: unconditional access, and the only role that can create tenants, channel partners, or staff accounts. `account_manager`: scoped to an explicit "book of business" (`account_assignments` table) — sets up a newly-assigned customer's first users, device dashboards, and preliminary alert baselines, but cannot create tenants/partners/staff
- The "act as" pattern: `withStaffActingOnTenant()` verifies an `account_assignments` row, then defers entirely to the *existing* `tenant_isolation` RLS policies — deliberately not a repeat of the Channel-Partner Portal's approach of adding new permissive read policies across operational tables, since this needs cross-tenant write
- 12 new `/v1/admin/*` REST endpoints across 6 route handler files
- 2 new database tables (`peaklogic_staff_users`, `account_assignments`); `audit_log_entries` gained a third actor dimension (`actor_staff_user_id`)

**Settings & Preferences**
- 8 new `/v1/settings/*` endpoints (reuses the existing tenant Cognito pool — no new identity surface): profile/display preferences, password change and MFA status (proxy Cognito's own APIs, no parallel credential store), and self-service team management
- `users` gained `clock_format` (12h/24h), `timezone`, and `theme` (light/dark) columns
- Frontend: real light/dark theme (`ThemeContext`, class-based Tailwind dark mode, persisted to `localStorage`), retrofitted across every existing page; new Settings page (mock data except the theme toggle, which is real)

**Site → Asset → Device Drill-Down**
- New `SiteDetail`/`AssetDetail`/`DeviceDetail` frontend pages — a site's assets, an asset's independently-reporting devices (e.g. a pump's separate flow sensor, energy monitor, leak sensor, and power actuator), and a device's own live telemetry channels and 24-hour trend
- Consolidated Sites/Assets/Devices' three previously-independent mock data arrays into one relational dataset so drill-down has real IDs to navigate through

### Fixed
- **`GET /v1/devices` ignored all query parameters** and always returned the full tenant device list — a real, verified live defect found while designing the drill-down. Added `assetId`/`siteId` filters.
- **A circular RLS self-lookup policy**, caught during implementation before any code shipped: the drafted `staff_self_or_superadmin` policy on `peaklogic_staff_users` matched a staff member's own row by `id` — but the code that resolves `id` from a JWT's `cognito_sub` needs that same policy to already permit the lookup. Re-keyed the policy on `cognito_sub` instead.
- `users.role` CHECK constraint still allowed the removed `service_partner` value (dead since Security Architecture v1.1); dropped and re-added without it.

### Security
- `peaklogic_staff_users` and `account_assignments` both ship with RLS enabled and forced from the start (no retrofit gap, unlike `tenants`' v1.0.0→v1.1.0 history).
- Every staff write against a tenant's data (via the "act as" handoff) writes an `audit_log_entries` row with `actor_staff_user_id` set — held to a stricter audit-logging bar than the tenant-side routes it reuses query logic from.

### Known limitations (disclosed, tracked as TD-41/TD-42)
- No integration-test coverage yet for `withStaffSession()`/`withStaffActingOnTenant()` against a real Postgres.
- The admin console has no dedicated frontend UI — every `/v1/admin/*` endpoint is real and callable, but only via direct API calls today.

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
