# Changelog

All notable changes to the PeakLogic platform are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Security

- **Prod no longer deploys the automated cost-kill-switch actions.** `infra-azure/modules/budget.bicep`'s 90% (Key Vault throttle flag) and 100% (Postgres stop) automated actions are now dev/staging only — an unattended mechanism able to stop the production database is itself an availability risk on the one environment where that risk is least acceptable. Prod keeps a real four-threshold budget, routed entirely to email, matching what native Azure Cost Management already provides. `killswitchSecret` stays a required deploy-time input for all three stages for consistency but is inert for prod. SysAdmin Guide bumped to v2.1.2 (§3.2); nothing user-facing changed, so the User Guide was not bumped.
- **Remediated 49 of the 65 real findings from the first `infra-psrule` CI run** (resource tagging on every taggable resource across all 7 Bicep modules, TLS/ARR-affinity/HTTP2 on both Function Apps, Key Vault audit logging + prod-only purge protection, NSG outbound RDP/SSH deny rules, storage replication/soft-delete/container-soft-delete on both storage accounts, Postgres customer-controlled maintenance window + prod-only geo-redundant backup, `autoMitigate` on every metric alert, APIM managed identity/cipher hardening/min-API-version/API descriptors, IoT Hub min TLS). The remaining 16 are each a deliberate, written deferral at the point of the finding — see Technical Debt Register TD-57 for the full list and reasoning (structural Consumption/Flex-Consumption-tier limits, features needing a corresponding application-code change, a subscription-scoped resource this resource-group-scoped template can't deploy, and dev/staging cost-vs-availability tradeoffs already accepted elsewhere in this tree).

### Changed

- **Customer Portal and Partner Portal now share common frontend source** (`packages/ui`, `packages/domain`) instead of duplicated/hand-mirrored files. Three files were byte-identical between the two portals; the Customer Portal's hardware register was a hand-typed mirror of a few records from the Partner Portal's fleet register, with no compiler check forcing the two to stay in sync. Both portals now import the same source via a `@shared/*` alias — no separate build step. Verified with both `npm run build` (typecheck + bundle) **and** both portals' dev servers loaded in a real browser (login bypass, Home, Hardware, a Hub-bearing site's Facility View, the Partner Portal's Decommission dialog) — build passing alone would not have caught the issue below. SysAdmin Guide bumped to v2.1.1; nothing user-facing changed, so the User Guide was not bumped.

### Fixed

- **Customer Portal's Hardware page and PeakView360 embed showed a Hub's raw internal model code** (`hub-400`) **instead of its product name** (`PeakLogic Hub 400`) — caught by the runtime review above, not by typecheck. The Customer Portal's old hand-typed hardware fixture stored the friendly name directly; the canonical domain model it now reads from stores the short code (used to key firmware/protocol lookups) and expects callers to resolve the display name via `HUB_MODELS[model].name`, exactly as the Partner Portal's own hardware tables already did. Fixed in the same commit that introduced the shared domain model, before any release.

---

## [2.0.0] — 2026-08-01

Major release. Two structural changes since v1.2.0 — the platform moved from AWS to **Microsoft Azure**, and the product was reframed from a single IoT SaaS into the **unified three-pillar platform** (PeakLogicSystems · PeakView360 · PeakLogic Hubs, with PeakAssist spanning all three). 196 commits.

> **Note on the previous `[Unreleased]` section:** it described AWS-era work (CDK, RDS, CloudFront, Secrets Manager, AWS Budget Actions) completed before the Azure pivot. That work is real and remains in git history, but the infrastructure it describes is superseded by this release and is no longer deployed. It has been folded in here rather than shipped as its own version.

### Added

- **Azure infrastructure** (`infra-azure/`, Bicep) — network, data (PostgreSQL Flexible Server + Key Vault), api (Functions on Flex Consumption), iot (IoT Hub + DPS), apim (API Management with rate limiting), monitoring (Log Analytics, App Insights, metric alerts), ingest-alerts, and budget with a custom cost kill switch. Plus `infra-azure/entra/` — app registrations for three separate Entra tenants.
- **PeakView360** — the operator HMI/SCADA experience: real-time operator screen, docked alarm panel, multi-pen historian, equipment dashboard with predictive-maintenance health, and an interactive Facility View. All five surfaces built; currently running on preview data.
- **PeakLogic Hubs** — the on-prem edge tier. Cloud side (registration, heartbeat, silence sweep, PeakAssist bundle sync) and the .NET `PeakLogicEdge` agent, which cross-compiles to Windows and Linux and packages as an Azure IoT Edge module.
- **PeakAssist** — contextual, offline-capable help: authored content corpus, deterministic resolver, cloud seed, Hub bundle sync with content-based checksums, plus a working offline RAG prototype.
- **CMMS work-order lifecycle** — timestamp-driven dispatch funnel (dispatched → accepted → on-site → completed), conversion KPI, and the `service_visits` writer that closes the detect → dispatch → outcome → learn loop.
- **Compliance reporting** — draft DMR generation with explicit coverage-gap honesty (never interpolates a missing reading) and a permanent operator-is-filer-of-record disclaimer.
- **AI analytics (Tier 1)** — EWMA baselines and z-score anomaly detection, feature-flagged off by default, capped at `warning` so it can never auto-dispatch.
- **Device-silence detection** and **connection-behaviour anomaly detection** — the absence of an expected reading, and an unusual reporting cadence, are both now detectable.
- **Telemetry normalization fabric** — one canonical metric space across heterogeneous vendors.
- **CI/CD** — four Azure-native workflows using Entra Workload Identity Federation (no stored secrets), plus dependency/SCA scanning and PSRule for Azure infra policy checks.

### Changed

- **Cloud provider: AWS → Azure.** Identity moved from Cognito to Microsoft Entra External ID across three isolated tenants (customers / partners / staff); compute from Lambda to Azure Functions; database from RDS to PostgreSQL Flexible Server; device plane from AWS IoT Core to Azure IoT Hub + DPS; secrets from Secrets Manager to Key Vault; IaC from CDK to Bicep. The pre-pivot `infra/` tree is retained, deprecated, and deployed by nothing.
- **Product positioning corrected.** PeakLogic is a lightweight, web-based SCADA and intelligence layer for distributed sites where a traditional SCADA deployment was never economically justifiable. Where a site has no control system, PeakLogic is that layer; where one exists, PeakLogic fills the gap between the field devices and the enterprise system and feeds normalized data upward into it. Prior "sits above SCADA" framing removed throughout.
- **Verticals corrected** to water treatment / municipal wastewater, campus facilities (assisted living and healthcare), and QSR — plus the essential-service-provider audience (septic, pool, electrical, HVAC contractors), which the documentation had omitted entirely.
- **SysAdmin Guide → v2.0.0** and **User Guide → v2.0**, both realigned; see their own revision histories.

### Fixed

- **CRITICAL — tenant isolation had never actually worked.** Every session-scoped RLS primitive (`withTenant()`, `withChannelPartner()`, `withStaffSession()`, `withStaffActingOnTenant()`, and the ingest handler) used `SET LOCAL app.x = $1` — which is **not valid PostgreSQL**, because `SET` does not accept bind parameters. The core isolation mechanism this platform's security model depends on had therefore never executed successfully against a real database, on either cloud. Invisible because unit tests mock the pg client and no integration test had ever run. Fixed by switching every call to `SELECT set_config(name, value, true)`; verified against a real Postgres in CI.
- **`channel_partner_can_read_site()` used `ST_Contains(geography, geography)`** — an overload PostGIS does not have. The function would have thrown on first real invocation, meaning technician territory-scoped site access had never worked. Fixed with `ST_Covers`.
- **GitHub Actions had never run a single workflow** on this repository since its creation, so nothing had ever been CI-verified. Root cause was a first-push confirmation gate; once enabled, the first run immediately surfaced the two bugs above plus a missing `bicepconfig.json`, a missing PostGIS extension in the test database, and several test-fixture defects — all fixed.
- **Ingest hardening** — poison-message capture (Azure Functions has no native dead-letter for Event Hub triggers) and idempotency against at-least-once redelivery.

### Security

- **Audit logging extended from ~11% to ~95% of mutating routes.**
- **Device/Hub identity revocation on decommission** — previously only a database status flag was flipped; the IoT Hub identity is now disabled too.
- **Session revocation (force-logout)** via Microsoft Graph, available to tenant admins directly.
- **Ingest-rate-zero and Function error-rate alerts** — "monitoring silently stopped" is this platform's worst failure mode and was previously undetectable.
- **APIM rate-limit bypass closed** with a shared-secret header the backend validates.
- **Dependency/SCA scanning** added to CI.
- **RLS now genuinely enforced in integration tests** — they previously connected as a Postgres superuser, which bypasses row-level security unconditionally and made every isolation assertion meaningless.
- Known open items are tracked in `docs/architecture/technical-debt-register.md`, notably **TD-51** (RLS policy recursion) and **TD-52** (unset session variable cast behaviour), both surfaced once RLS was genuinely exercised.

### Known limitations

- **Nothing has been deployed to a real Azure subscription.** Every Bicep module, deployment procedure, and operational runbook is derived from source and Microsoft documentation, not from operating a live system. Both guides mark unverified procedures explicitly.
- Frontend surfaces run on preview/mock data; no PeakLogic Hub is installed at a customer site.
- MFA and Conditional Access are not configured.

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
