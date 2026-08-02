# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **⚠️ Fork notice (2026-07-17, updated 2026-07-17):** This repo (`PeakLogic-Azure`) is a fork of the AWS-native PeakLogic repo, created to restructure PeakLogic's architecture for Azure while exploring a merger and common commercialization roadmap with **Purple Standard** (product **MooreView**), a Microsoft/Azure-centric partner company. It was seeded as a full copy at tag `aws-architecture-baseline`, when the source repo was still named `PeakLogicSystems` — **that repo has since been renamed to `PeakLogicSystems/PeakLogic-AWS`** (same GitHub account, new slug, purely so the two repos are easy to tell apart) — the rest of this file still describes the **AWS-native** architecture as of the fork point, and remains accurate for anything not yet touched by the restructuring effort. **Read `docs/architecture/azure-restructuring-plan.md` first** for what's been re-derived for Azure vs. what's still describing AWS. `PeakLogic-AWS` is untouched and continues to exist in parallel — this is not a replacement until a real decision is made; if this Azure direction doesn't pan out, `PeakLogic-AWS` is the complete, unmodified place to pick back up.

## Naming (canonical, locked 2026-07-24 — see `docs/architecture/unified-platform-integration-plan.md` §1)

| Layer / entity | Canonical name |
|---|---|
| Company | **PeakLogic** |
| Project codename (internal) | **Project Vantage** |
| Cloud / brain intelligence layer (SaaS) | **PeakLogicSystems** |
| HMI / SCADA layer | **PeakView360** |
| On-prem edge unit(s) | **PeakLogic Hub** / **PeakLogic Hubs** |
| Help / support system | **PeakAssist** |

Retired — do not use going forward: *PeakView Hub/360*, *PeakVantage Hub/360*, bare *Vantage* (now *Project Vantage*). The application-code prefix `peaklogic`/`PeakLogic` (e.g. `peaklogic-api`, `PeakLogic-dev-Api`) is consistent with the company name and stays — renaming deployed resource identifiers is out of scope. Still provisional pending trademark clearance.

> **Unified-platform reframe in progress (2026-07-24):** this repo is `PeakLogic-Azure-V2`, the PeakLogic-first merger/unified-platform development line. The architecture artifacts are being reconciled — docs **and** code — to the three-pillar platform (PeakLogicSystems / PeakView360 / PeakLogic Hubs + PeakAssist) absorbing Purple Standard's MooreView. **Read `docs/architecture/unified-platform-integration-plan.md` for live status.** Much of the AWS-native detail below still describes the pre-reframe state until the sweep reaches it.

## Governance: architecture-first (adopted 2026-07-04)

This project is moving to the same architecture-first discipline used by the IronQuill project: documents are produced in dependency order in `docs/architecture/` (see `docs/architecture/README.md` for live status and the full artifact list — Vision → PRD → SRS → Domain Model → Compliance & Certification Roadmap → ... → MVP/Enterprise Roadmap), every implementation decision should trace to the PRD once it exists, and later documents can force revisions to earlier ones.

**Existing code is reference, not authoritative.** Unlike IronQuill (which started pre-code), PeakLogicSystems already has a working v1.0.0 — that code isn't being thrown away, but it also isn't the source of truth going forward. As each architecture doc is produced, formally reconcile the existing implementation against it and revise/rewrite where real gaps surface, rather than either ignoring the docs or discarding working code wholesale.

The goal of this discipline is a fully commercialized, enterprise-sellable product — which is also why SOC 2 readiness and a real security/compliance posture are explicit artifacts in the list, not an afterthought bolted on before a big customer's security review.

## Monorepo Structure

Six sub-packages (five with their own `package.json`/`tsconfig.json`; `marketing/` is plain static HTML, no build tooling). `windows-hub/` (a separate .NET/C# codebase, PeakLogic Edge — the hub device app) is intentionally outside this table's Node/CDK conventions; see its own `windows-hub/README.md`.

**The front end is three portals plus one operator app** — not one application with role-based menus. `marketing/demo.html` is the definitive map.

| Directory | Purpose | Runtime |
|---|---|---|
| `infra-azure/` | **Bicep IaC — all live Azure resources.** Modules + `entra/` app registrations | — |
| `backend/` | Azure Functions — REST API, telemetry ingest, scheduled jobs | Node 20 |
| `customer-portal/` | **Customer Portal** — equipment owners; their own sites, alerts and compliance reports only | Browser |
| `channel-partner-portal/` | **Partner Portal** — a service company's whole book of business (home, sites, device *Control* affordance, work orders, Facility Builder, partner switching). White-labelled per partner | Browser |
| `peakview360/` | **PeakView360** — the live per-site operator view (Facility View, Historian, Equipment + docked alarm panel). Launched from inside a portal; *not* a separate login | Browser |
| `marketing/` | Public site (`peaklogicsolutions.com`) + `demo.html` (demo index) + `control-center.html` (**Control Center**, staff-only) | Browser |
| `windows-hub/` | PeakLogic Edge — the .NET on-prem Hub agent (Windows + Linux) | .NET 8 |
| `scripts/` | Admin tooling, DB migrations | Node 20 |
| `ops/` | Standalone operational functions (cost kill switch) | Node 20 |
| `infra/` | ⚠️ **DEPRECATED** — pre-pivot AWS CDK. Deployed by nothing; see `infra/README.md` | Node 20 |

**The backend is not deployed independently.** CDK bundles it at deploy time via esbuild. The `ApiStack` in `infra/lib/api-stack.ts` points `entry:` directly into `../../backend/`. There is no build step to run before deploying the backend.

**Real domain, added 2026-07-12:** `peaklogicsolutions.com` (purchased via Cloudflare; DNS deliberately stays at Cloudflare, not migrated to Route53 — see `infra/lib/domain-stack.ts`'s header comment for the trade-off). `infra/lib/domain-stack.ts` owns one shared ACM certificate (us-east-1, DNS-validated — the validation CNAME must be added to Cloudflare by hand on first deploy per stage) covering three names per stage: the bare/`www` domain (marketing site, `marketing-stack.ts`) and `app.{domain}` (the real app, `frontend-stack.ts`). Prod owns the bare domain; `dev`/`staging` get their own subdomain (`dev.peaklogicsolutions.com`) — see `allowed-origins.ts`'s `getAllowedOrigins(stage)`. This replaced a long-standing `app.peaklogic.io` placeholder that predated any real domain purchase, and closed TD-10 (CloudFront TLS 1.0) in the same change — see the Technical Debt Register.

## Common Commands

```bash
# Front end — three portals + the operator app, each its own Vite app
cd customer-portal        && npm install && npm run dev   # :5176
cd channel-partner-portal && npm install && npm run dev   # :5174
cd peakview360            && npm install && npm run dev   # :5175
# `npm run build` in any of them runs `tsc && vite build` (typecheck + bundle).
# marketing/ (incl. demo.html and control-center.html) is static — no build step.

# Channel Partner Portal (demo — login screen only, no real PartnerPool auth wired up)
cd channel-partner-portal
npm install
npm run dev          # http://localhost:5175 (5174 if free) — deliberately a different port
                      # from frontend/, so both can run side by side
npm run typecheck    # tsc --noEmit

# Backend
cd backend
npm run typecheck    # tsc --noEmit (no standalone build needed)

# Infrastructure — every command requires an explicit stage; there is no
# default (Deployment Architecture §2). Missing -c stage= fails synth outright.
# Also requires -c budgetAlertEmail=you@example.com (cost kill switch, see
# "Cost Kill Switch" section below) — fails synth outright if omitted too.
cd infra
npm install
npm run synth:dev            # cdk synth -c stage=dev — validate without deploying
npm run diff:dev             # cdk diff -c stage=dev — show what would change vs deployed state
npm run deploy:dev           # cdk deploy --all -c stage=dev --require-approval never (10–15 min)
npm run deploy:staging       # same, -c stage=staging
npm run deploy:prod          # cdk deploy --all -c stage=prod — no --require-approval never;
                              # CDK's default (require-approval broadening) prompts on any
                              # IAM/security-group change, deliberately less automated than
                              # dev/staging
npx cdk deploy PeakLogic-dev-Api -c stage=dev   # deploy a single stack

# Device provisioning
cd scripts
npm install
npx ts-node provision-devices.ts --count 5 --db-only

# Database migrations (Database Schema §4.2 — not yet run against a real DB, verify
# node-pg-migrate's exact API/file conventions against the installed version first)
cd scripts
npm run migrate:up      # apply all pending migrations
npm run migrate:down    # roll back the most recent migration
```

There are no test suites in this codebase.

## Architecture

### Tenant Isolation (Critical Pattern)

Every API route that touches the database **must** use `withTenant()` from `backend/shared/db.ts`. This wraps the query in a transaction that sets `app.current_tenant_id` to the caller's tenant via `SELECT set_config('app.current_tenant_id', $1, true)`, which activates PostgreSQL Row-Level Security on all tenant-scoped tables. Skipping this wrapper means the query runs without a tenant filter and will either return no rows (RLS blocks it) or all rows (if running as superuser).

**CRITICAL, found and fixed 2026-08-01 — read before touching any `SET LOCAL`/session-variable code.** Every one of these session-variable calls (`withTenant()`, `withChannelPartner()`, `withStaffSession()`, `withStaffActingOnTenant()`, plus `ingest/handler.ts`'s own tenant-scoping call) used to write `SET LOCAL app.current_tenant_id = $1` — a literal `SET LOCAL` command with a bind parameter. **That is not valid PostgreSQL syntax**: `SET`/`SET LOCAL` is a parser-level utility command that does not accept query parameters at all, only literal values — a real, well-documented PostgreSQL/node-postgres limitation, not a version quirk. This means the entire tenant/partner/staff isolation mechanism this whole platform's security model depends on had never actually executed successfully against a real Postgres server, in this project's entire history — invisible because every unit test mocks the `pg` client (which never validates SQL at all) and no integration test had ever actually run until GitHub Actions was finally enabled on this repo the same day (see TD-49, `docs/architecture/technical-debt-register.md`). Fixed by switching every one of these calls to `SELECT set_config(name, value, is_local)` — a normal function call that *does* support bind parameters, with `is_local = true` as the exact `SET LOCAL` equivalent (reverts at end of transaction). Verified against the real CI Postgres integration test run, not just typechecked. Full writeup: `docs/architecture/water-sector-security-hardening-strategy.md` §9 (v0.6).

The ingest Lambda (`backend/ingest/handler.ts`) is the one intentional exception to needing `withTenant()` itself — it bypasses RLS by using `pool.connect()` directly because it operates as a system process writing across tenants — but it sets `app.current_tenant_id` via the identical `set_config()` mechanism once a device's tenant is resolved, and was equally affected by the bug above until the same fix.

### Request Flow

```
Browser → CloudFront/S3 (static SPA)
        → API Gateway (Cognito authorizer validates JWT)
          → peaklogic-api Lambda
            → backend/api/handler.ts  (getAuth extracts tenantId + role from JWT claims)
            → backend/api/router.ts   (dispatches on "METHOD /v1/resource/{id}" key)
            → backend/api/routes/*.ts (each route calls requireRole then withTenant)

IoT Device (MQTT) → AWS IoT Core → Topic Rule → peaklogic-ingest Lambda
                                                 → backend/ingest/handler.ts
```

### Router Key Format

`backend/api/router.ts` keys on `event.httpMethod + " " + event.resource` — where `event.resource` is the **API Gateway resource template** (e.g. `/v1/devices/{deviceId}`), not the actual URL path. Adding a new route requires both registering it in the router's `ROUTES` map **and** adding the corresponding method + resource in `infra/lib/api-stack.ts`.

The `addCrud()` helper in `api-stack.ts` generates the path parameter name by stripping the trailing `s` from the resource name: `'devices'` → `{deviceId}`, `'alerts'` → `{alertId}`. The `alerts` resource only registers GET/GET-detail/PUT (no POST, no DELETE) — alert creation is done exclusively by the ingest Lambda.

### CDK Stack Dependency Order

Stacks must be deployed in order: `Network → Data → Auth → Api → IoT, Frontend`. `IoTStack` depends on `api.ingestFn` (exported from `ApiStack`) to wire the IoT topic rule directly to the Lambda ARN.

### Environments / Deployment Stages (Deployment Architecture §2)

Single AWS account, three stages (`dev`/`staging`/`prod`) distinguished by a required CDK context value, not separate accounts — matches this project's cost-conscious MVP posture everywhere else (t3.micro RDS, single NAT gateway, `multiAz: false`). Every stack name and every account+region-unique resource name (Lambda function names, the REST API name, the Cognito user pool/client, the IoT thing type/policy/rule/log group) is suffixed by stage so all three can coexist in one account without collision — e.g. `PeakLogic-dev-Api`, `peaklogic-prod-api` (Lambda), `PeakLogicDevicePolicy-staging`.

**No default stage exists on purpose** — `infra/bin/peaklogic.ts` throws if `-c stage=` is omitted, rather than silently deploying to `dev`. A missing flag failing loudly is a much safer outcome than a mistyped one deploying to the wrong environment.

**One deliberate exception to full stage isolation:** the MQTT topic namespace itself (`peaklogic/{thingName}/telemetry`, `.../commands`) is NOT stage-scoped — only the IoT Core resource *names* (thing type, policy, rule) are. Staging that too would mean touching device firmware/provisioning config, out of proportion for what this fix needed. Consequence: if `dev` and `prod` IoT stacks are ever both deployed to the same AWS account, both stages' `TelemetryRule`s match the same topic pattern (`peaklogic/+/telemetry`, unscoped by stage) and both ingest Lambdas would fire on the same device's telemetry. **Operational rule: only one stage's IoT stack may be deployed per AWS account at a time**, or use genuinely separate AWS accounts per stage if `dev` and `prod` ever need real devices reporting simultaneously.

### Alert Rules

Defined in `backend/ingest/rules.ts` as `RULES_BY_CATEGORY`. Threshold functions receive the asset's `specs` JSONB — if specs are null, defaults are used. Deduplication prevents a second alert of the same `(device_id, metric, severity)` while one is already `open` or `acknowledged`. Critical alerts auto-create a service ticket and fire a webhook (fire-and-forget, 8s timeout) using the tenant's `settings.webhook_url`.

**Policy Engine (config-driven rules), `POLICY_ENGINE_ENABLED`-gated:** as of `docs/architecture/policy-engine-design.md`, `RULES_BY_CATEGORY` is also the **seed** for the `policies` table (migration `1783875840000_policy-engine.sql`), and `backend/ingest/policy-resolver.ts` resolves per-reading thresholds from the DB (platform defaults + tenant/site/asset overrides) when `POLICY_ENGINE_ENABLED=true`. **The flag defaults off — ingest still evaluates the compiled-in `RULES_BY_CATEGORY` unless it's set.** The compiled seed is retained permanently as the resolver's fail-safe fallback (a safety monitor must never fail into silence). `evaluateRuleSet(rules, …)` is the rule-source-agnostic evaluator both paths share; `evaluateRules(category, …)` is the thin legacy wrapper.

Categories today: `pump`, `hvac`, `pool_system`, `refrigeration`, `leak_sensor`, `energy_meter`. This dictionary is meant to be extended — adding a new vertical/asset type is just a new key with its own rule list, not a schema change (`assets.category` is unconstrained TEXT). `refrigeration` deliberately keys off `product_temp_c` (a probe in the food/drink itself), not ambient air temp — that's the energy-savings-plus-food-safety pitch: the unit can run warmer when the product itself is still safely cold.

### Azure Monitoring (`infra-azure/modules/monitoring.bicep`, Enterprise Audit §6 P0 item 4)

`infra-azure/` now has three modules: `network.bicep`, `data.bicep`, `monitoring.bicep` (added 2026-07-21) — still none deployed/validated against a real Azure subscription (no Azure CLI/subscription access in this environment). `monitoring.bicep` provisions a Log Analytics Workspace, workspace-based Application Insights (nothing sends it telemetry yet — no Function App exists), an Action Group (email, `alertEmail` param), and 3 real metric alerts against the Postgres Flexible Server (`cpu_percent`/`storage_percent`/`connections_failed` — thresholds sourced from Microsoft's own Azure Monitor Baseline Alerts reference, verified via live lookup, not guessed). **Deliberately does not fake the audit's actual "ingest rate zero"/Function-error-rate/DLQ-depth alerts** — those need `api.bicep`/`iot.bicep` (Functions/IoT Hub resources) to scope an alert to, and neither exists yet (audit §6 P0 item 1). See the module's own header comment for the exact, disclosed follow-up list.

### Ingest Hardening (Enterprise Audit finding 2.4)

Two independent reliability gaps, closed together since they both touch `backend/ingest/`:

- **No dead-letter path (2.4a).** Azure Functions has no native DLQ for Event Hub/IoT Hub triggers — a message that throws was previously just gone once Event Hubs' retry policy gave up. `backend/shared/poison-messages.ts`'s `recordPoisonMessage()` now writes the raw payload + error to a `poison_messages` table (no RLS — system/ops table, same posture as `channel_partners`) before `ingest/main.ts`'s per-message catch swallows it and moves on to the rest of the batch. Best-effort and never-throwing itself — a failure to *record* a poison message must never crash the message loop it's a safety net for.
- **No idempotency (2.4b).** Event Hubs is at-least-once — a redelivered batch previously double-inserted an identical telemetry row and double-counted it into `metric_baselines`' EWMA. `telemetry_dedup_idx` (unique on `device_id, time, metric`) + `ON CONFLICT DO NOTHING` in `ingest/handler.ts` makes a redelivered exact reading a no-op; the telemetry-insert and baseline/anomaly-scoring loops were merged into one pass so a duplicate metric skips baseline/anomaly work entirely, not just the insert. Rule evaluation (threshold/Policy Engine) is unaffected — it was already protected from duplicate *alerts* by `createAlertAndMaybeTicket()`'s own open/acknowledged dedup, a separate, pre-existing mechanism this doesn't touch.

### Device-Silence Detection (`backend/jobs/`)

Closes the Enterprise Audit's (2026-07-19) §3 P0 finding: "a dead freezer sensor is indistinguishable from a healthy freezer" — every existing rule (`rules.ts`, Policy Engine, AI Analytics) fires on a *bad reading being present*; none of them detect the *absence* of an expected one. Not feature-flag-gated (unlike Policy Engine/AI Analytics) — there's no existing behavior it could change, only a genuinely new alert type.

- **`backend/jobs/silence-detection.ts`** — pure: `findSilentDevices()` compares `last_seen_at` against a per-category expected reporting interval × a grace multiplier (default 3x, to absorb ordinary network jitter before flagging). Interval defaults (`DEFAULT_REPORTING_INTERVAL_S`) are **placeholder engineering estimates, not sourced from real device datasheets** — nothing has ever deployed, so no real fleet cadence exists to tune against yet.
- **`backend/jobs/silence-detection-handler.ts`** — orchestrates a scheduled sweep across *every* tenant. Since this is a scheduled job, not a request or a device event, it can't use `withTenant()`'s single-tenant entry point directly: it first does a narrowly-scoped system read (`app.system_sweep_context`, migration `1784051700000`, mirrors `app.ingest_context`'s precedent) to enumerate tenant ids, then fans out per-tenant through the **unmodified** `withTenant()` — one bad tenant (suspended, transient error) is caught and skipped, never aborting the whole sweep.
- Emits `alerts.type='device_silent'` through the **same** shared alert path every other source uses (`backend/shared/alerts.ts`'s `createAlertAndMaybeTicket()` — extracted from `ingest/handler.ts` this same day once a second real consumer needed it). Capped at `severity='warning'` — same reasoning as AI Analytics Tier 1: this detection path has no production track record yet, so it doesn't auto-dispatch a service ticket.
- Also sets `devices.status = 'offline'` when a device goes silent — a real, previously-unreachable schema value (verified by grep before building this: nothing had ever set it). Self-correcting: the ingest heartbeat already flips it back to `'online'` on the device's next real reading.
- **`backend/jobs/silence-detection.main.ts`** — the Azure Functions Timer-trigger entry point (`app.timer`, every 5 minutes), ready to run the moment `infra-azure` gains a Functions-hosting module (not yet built — audit §6 P0 item 1). The application logic above has no Azure-specific dependency and is fully unit-tested independent of any deployment.

### AI Analytics — Tier 1 anomaly detection, `AI_ANALYTICS_ENABLED`-gated

As of `docs/architecture/ai-analytics-layer-design.md` (artifact #34, Approved v1.0): a first-class AI layer, phased anomaly → predictive → prescriptive. **Only Tier 1 (anomaly detection) is built.** Same zero-default-behavior-change discipline as the Policy Engine flag above — `AI_ANALYTICS_ENABLED` defaults off.

- **`backend/ingest/baseline.ts`** maintains `metric_baselines` (EWMA trailing mean/stddev per device+metric) on **every** ingested reading, regardless of the flag — this is cheap bookkeeping with no alert-pipeline coupling. (Real gap closed 2026-07-21: this table existed since the Policy Engine era but nothing had ever written to it.)
- **`backend/ingest/anomaly.ts`** scores a reading against its *pre-update* baseline when the flag is on, withholding until `MIN_SAMPLES_FOR_ANOMALY` (20) is met. Findings are capped at `severity='warning'` — never `'critical'` — so Tier 1 can never auto-create a service ticket (`handler.ts`'s critical-only ticket creation is unreachable for anomaly alerts by design; anomaly detection has no measured precision yet).
- Emits through the **existing** alert pipeline (`alerts.type='anomaly'`, same dedup/ticket logic as `'threshold'` — `handler.ts`'s `createAlertAndMaybeTicket()` is the shared path both types go through) and records an `ai_findings` row for every real detection (whether or not the resulting alert is new or deduped).
- Thresholds (`MIN_SAMPLES_FOR_ANOMALY`, `DEFAULT_SIGMA_THRESHOLD`) are hardcoded module constants today, not yet a Policy Engine knob — flagged as the natural next step once real telemetry history exists to tune against (there is currently none; nothing has ever deployed).
- **Connection-behavior anomaly added 2026-08-01** (`backend/ingest/connection-anomaly.ts`, Water-Sector Security Hardening Strategy §5 Tier 2 item 2 — a *security-roadmap* tier, unrelated to this section's own anomaly→predictive→prescriptive Tier 1/2/3 numbering, disambiguated here on purpose). Reuses `baseline.ts`/`anomaly.ts` completely unchanged against a reserved pseudo-metric (`CONNECTION_INTERVAL_METRIC`) — the gap in seconds since a device's own previous reading is scored the same EWMA/3-sigma way a real telemetry value is, closing a real, previously-named gap ("the anomaly layer is purely telemetry-value statistics, not network/security telemetry"). An unusually short interval reads as possible flooding/replay/beaconing; an unusually long one (short of full silence) reads as an early warning before `jobs/silence-detection.ts` would fire. Emits `alerts.type='connection_anomaly'` (a new, unconstrained `alerts.type` value, no migration needed) and an `ai_findings` row tagged `explanation.signal='connection_interval'` (kind stays `'anomaly'` — the CHECK constraint doesn't have a narrower kind, and this genuinely is one, just scored on a different data dimension).
- **Tiers 2 (predictive maintenance) and 3 (prescriptive/LLM enrichment) are design-only.** Tier 3's locked LLM vendor is **Claude via Microsoft Foundry** (Anthropic's models went GA there 2026-06-29, hosted on Azure infra with native Azure auth/billing — the Azure-native choice, not a vendor exception) — see design doc §7a.
- Cross-tenant model training and cross-tenant benchmarking are both explicitly **not built** — per-tenant only, per a 2026-07-21 decision; see design doc §6/§6a for the (unbuilt) technical shape and the real legal caveats around anonymized benchmarking specifically.

### Unified-Platform Backend Increments (v2.0, `PeakLogic-Azure-V2`)

Self-contained, unit-tested logic built on the v2.0 schema (migrations `1784142000000`–`…240000`), same pure-logic + fan-out-handler + Timer-main shape as device-silence detection. None deployed (no Functions-hosting module yet); all fully tested independent of Azure.

- **PM work-order generation** (`backend/jobs/pm-generation*.ts`, PRD §5.20 CM-3.1). Pure `findDuePmSchedules()`/`computeNextDue()` (advances a due schedule to its next *future* occurrence in one step — a badly-overdue schedule generates one work order, not a backlog). Handler fans out per tenant via the same `app.system_sweep_context` → `withTenant()` two-phase isolation as the silence sweep; a category-scoped schedule fans out to one work order per matching asset (`service_tickets.asset_id` is NOT NULL). A due schedule advances `next_due_at` in the same transaction that creates its work orders → idempotent within a run. Daily Timer (`0 0 6 * * *`).
- **Compliance report generation** (`backend/compliance/report-generator.ts`, PRD §5.21). Pure `generateComplianceReportDraft()` — period readings + exceedances → a DMR draft (per-parameter count/min/max/avg, exceedance counts, **coverage-gap honesty** — a parameter with no readings is a gap, never interpolated). Two boundaries baked in: **generation ≠ delivery** (CP-5.1 delivery is blocked on absent outbound infra — not attempted), and an always-present **operator-is-filer-of-record disclaimer** (CP-2.1). Readings are period-bound so a late-synced prior-period reading can't leak in.
- **PeakAssist resolution** (`backend/shared/peakassist.ts`, PRD §5.22). Pure `resolveHelp()`/`resolveAlarmHelp()` — orders a screen's help (guide → procedure → troubleshooting → …) and, when opened from an active alarm, prepends that alarm's explanation (PA-3.1) without duplication; unknown alarm type falls back to the context list (no dead link). Same content model whether loaded from the cloud DB or a Hub's offline bundle. The **authored v1 content corpus** lives in `backend/shared/peakassist-content.ts` (`PEAKASSIST_CONTENT` — screen guides, alarm explanations for every emitted `alerts.type`, procedures, troubleshooting, playbooks, glossary); `peakassist-content.test.ts` enforces the governance gates against the resolver (every screen context has a guide, every alarm type is explained). It's the repo source of truth. The **cloud-side seed is built**: `scripts/migrations/1784142300000_peakassist-seed.sql` is **generated** from the corpus by `backend/shared/peakassist-seed.ts` (`buildPeakAssistSeedSql`, correct SQL escaping + deterministic FNV-1a bundle checksum, idempotent by re-seed) and a **golden-file test** (`peakassist-seed.test.ts`) fails if the committed SQL ever drifts from the corpus — regenerate, never hand-edit. The **Hub bundle-sync logic** is also built: `backend/shared/peakassist-sync.ts` + `-handler.ts` — `compareContentVersions`/`needsBundleUpdate`/`planHubSync` (the per-Hub delta decision, keyed off the `peakassist_content_version` a Hub reports on heartbeat), `buildBundle`, and `verifyBundle` (checksum integrity; the checksum is **content-based + order-independent** so a Hub reproduces it from downloaded rows regardless of order, and a test proves it matches the seed migration's recorded value). `syncForHub()` is the cloud endpoint a Hub polls. Remaining (design-stage): the Hub-agent runtime that polls/downloads/installs the bundle + the authoring CMS.
- **CMMS work-order lifecycle** (`backend/shared/cmms/work-order-lifecycle.ts` + `-handler.ts`, Reporting/KPI #32 / Domain Model §2.12 / PRD §5.20). The dispatch funnel is tracked by four `service_tickets` timestamp columns (`dispatched_at`→`accepted_at`→`on_site_at`→`completed_at`), NOT the `status` enum. Pure `currentStage()`/`advanceWorkOrder()` (forward-only, idempotent — never regresses, never re-completes) + `computeFunnel()` (the real dispatched→on-site **conversion KPI** from timestamps, not a stored number). The handler `advanceWorkOrderStage()` is the writer that closes the gap flagged in `shared/types.ts`: on completion it **records the previously-unwritten `service_visits`** row — the outcome that feeds the conversion KPI and the AI training loop (detect→dispatch→outcome→learn, #34). RLS-scoped via the caller's `withTenant()`; `timestampColumn` is a fixed enum (injection-safe). `ServiceTicket` type aligned with the v2.0 schema (`on_site_at`/`completed_at`/`pm_schedule_id`).
- **PeakLogic Hub fleet — registration / heartbeat / silence / agent-integrity** (`backend/shared/hubs.ts` + `hubs-handler.ts` + `jobs/hub-silence-*` + `hub-integrity.ts`, Domain Model §2.11 / PRD §5.19). Pure `buildHubRegistration()` (a new Hub starts `provisioning`, not online — its first heartbeat flips it), `applyHeartbeat()` (→ online + last_seen + reported versions), `findSilentHubs()`/`hubHealthSummary()` — the silence logic generalizes device-silence to the edge fleet (an online Hub that stops heart-beating → offline). Handlers: `registerHub()`/`recordHeartbeat()` (request-scoped, RLS via the caller's `withTenant()`; the heartbeat COALESCEs versions so a bare beat never nulls a known agent/PeakAssist-content version) + `runHubSilenceSweep()` (scheduled, same two-phase `system_sweep_context`→`withTenant()` isolation as device silence; self-correcting on the next heartbeat). **Agent-integrity check added 2026-08-01** (Water-Sector Security Hardening Strategy §5 Tier 2 item 1): `recordHeartbeat()` now also runs `checkHubAgentIntegrity()` against `KNOWN_HUB_AGENT_VERSIONS` (the real `edge-vX.Y.Z` GitHub Release tags) — a reported `agentVersion` PeakLogic never published raises a real `hub_agent_unexpected_version` alert via `shared/alerts.ts`'s new `createHubAlert()` (device_id/asset_id left NULL, the hub identity travels in `context.hubId` — no migration needed, both FKs were already nullable). This repurposes the exact `DriftStatus.Unexpected` vocabulary the on-device `windows-hub/.../DesiredStateReconciler.cs` already established, applied to the one field the plain HTTP heartbeat (no Azure IoT Hub needed) can see — a tamper signal, not just fleet visibility. Capped at `severity='warning'`, no auto-ticket, same "no production track record yet" posture as anomaly/device-silence alerts. 22 tests total (12 pre-existing `hubs.ts` + 5 new `hub-integrity.test.ts` + 5 new `hubs-handler.test.ts`, the latter's first-ever coverage).
- **Telemetry Normalization Fabric** (`backend/shared/normalization.ts`, Domain Model §2.10 / Platform Services / PRD §5.18–§5.19). Pure `applyTag()` (raw × scale + offset → engineering units) + `normalizeReadings()` — the shared vocabulary layer both **PeakLogic Hubs** (normalizing raw PLC/RTU reads) and **PeakView360** (rendering `tags`) depend on, mapping heterogeneous sources into the one canonical metric space `telemetry.metric` uses. Never-silent handling: an unmapped `sourceRef` → `unmapped`, a non-finite raw or transformed value → `rejected` (a bad PLC read never becomes a fabricated reading); duplicate `sourceRef` → first-wins, ordering-independent. 10 tests.

### Unified-Platform API Routes (v2.0)

Thin route wiring over the tested handlers, registered in `backend/api/router.ts` (matched by `api/match.ts`; no infra registration needed on Azure). All tenant-scoped via `withTenant()` (RLS):
- **Hubs** (`api/routes/hubs.ts`): `GET/POST /v1/hubs`, `POST /v1/hubs/{hubId}/heartbeat`, `GET /v1/hubs/{hubId}/peakassist-sync` (returns the newer bundle to install, if any).
- **PeakView360** (`api/routes/peakview360.ts`): `GET /v1/hmi-screens[?siteId]`, `GET /v1/tags[?siteId]` (config, not live data).
- **CMMS** (`api/routes/tickets.ts`): `POST /v1/tickets/{ticketId}/advance` (funnel advance + `service_visit` on completion), `GET /v1/tickets/funnel` (conversion KPI from `computeFunnel`).
- New matcher shapes (trailing-literal after a param; literal-beats-param, e.g. `/tickets/funnel` before `/tickets/{ticketId}`) are covered in `api/match.test.ts`.

### Future: Command & Control Architecture (not yet implemented)

Actuation (e.g. remotely shutting off a valve) is on the roadmap but not built. Two things are worth locking in now, before that subsystem exists, so later work doesn't have to relitigate them:

- **Network model is already right — extend it, don't replace it.** Devices connect *outbound* to AWS IoT Core over a persistent MQTT/TLS session (mutual TLS via per-device X.509 certs, provisioned in `scripts/provision-devices.ts`). Once that connection is open, the cloud can push messages down it — no inbound firewall rule, port-forward, or dedicated VLAN is ever required on the customer network, which matters because most target customers (especially enterprise, zero-trust) will not grant those. `infra/lib/iot-stack.ts`'s `DevicePolicy` already scopes each device to subscribe/receive on its own `peaklogic/{thingName}/commands` topic — nothing publishes to it yet, but the channel exists.
- **Prefer port 443 over 8883 for any future firmware.** `device-config.json` (written by `provision-devices.ts`) currently hardcodes port `8883`. AWS IoT Core supports the identical MQTT session over `443` (looks like ordinary HTTPS to network security appliances), which is far more likely to pass a locked-down egress firewall unmodified. This is a firmware-side connection setting, not an infra change.
- **TLS-inspection proxies are a known limitation, not something to engineer around.** Some enterprise zero-trust stacks terminate/re-encrypt all outbound TLS to inspect it, which breaks IoT Core's mutual-TLS device certs. This has to be handled as a customer onboarding step (an allowlist/bypass exception for the AWS IoT endpoint from their IT), not solved in code.
- **Safety-critical actuation must default to local, not cloud-dependent.** For something like a leak shutoff, the device should trip off its own sensor reading immediately, without waiting on a cloud round trip — the cloud command channel is for remote override/reset/manual control and audit logging, not the sole trigger path. Design any future device firmware and the command API around that split.
- **Not designed yet:** the actual command-publish path (an API endpoint + Lambda to publish to the `commands` topic), an ack/delivery-confirmation pattern (device shadow vs. custom ack topic), and an audit table logging who/what issued each command and its outcome. Design these together as one piece of work when actuation is actually scheduled — don't build the publish path without the audit trail.

### Frontend Auth Bypass

Each portal ships a bypassable login for preview use. All four surfaces currently run on their own in-repo preview data and are not wired to the API — see §10 of the SysAdmin Guide.

## Key Files

| File | What to know |
|------|-------------|
| `backend/shared/db.ts` | Pool singleton + `withTenant()` — touch this carefully; it underpins all tenant isolation |
| `backend/shared/auth.ts` | `getAuth()` reads Cognito JWT claims from `event.requestContext.authorizer.claims`; role comes from the first Cognito group |
| `backend/shared/response.ts` | All Lambda responses go through helpers here — never return raw objects |
| `backend/api/router.ts` | Full list of registered routes |
| `infra/lib/api-stack.ts` | Where API Gateway resources are declared — must match the router |
| `backend/ingest/rules.ts` | `RULES_BY_CATEGORY` — edit here to change alert thresholds (moved out of `handler.ts` in v1.1.0 so it could be unit-tested in isolation) |
| `docs/data-model.sql` | Canonical schema including all RLS policies — hand-maintained snapshot; actual schema changes are applied via `scripts/migrations/`, then mirrored in here by hand in the same commit |
| `scripts/migrations/` | Versioned schema migrations (node-pg-migrate, Database Schema §4.2) — applied via `scripts/migrate.ts`, never automatically by `cdk deploy` |
| `sysadmin-guides/PeakLogic_SysAdmin_Guide.html` | Operator-facing reference — deploying, administering, and troubleshooting the platform. Kept current every release, see Release Process below |
| `user-guides/PeakLogic_User_Guide.html` | End-user-facing reference — plain-language walkthrough of the actual application. Checked every release, updated when user-facing behavior changes, see Release Process below |

## Environment Setup

**Front end** (per-portal `.env.local` for local dev):
```
VITE_PREVIEW=true                     # bypasses Cognito (dev only)
VITE_API_URL=https://...amazonaws.com/v1
VITE_USER_POOL_ID=us-east-1_xxx
VITE_USER_POOL_CLIENT_ID=xxx
VITE_REGION=us-east-1
```

**Scripts** (`scripts/.env`):
```
AWS_REGION=us-east-1
DB_HOST=<rds-endpoint>
DB_SECRET_ARN=<arn>   # production — or use DB_USER + DB_PASSWORD for local dev
```

Lambda environment variables are injected by CDK at deploy time from stack outputs — do not set them manually.

## ⚠️ Known Temporary Security Trade-off — Dev Stage DB Credentials (added 2026-07-12)

**The `dev` stage does not use Secrets Manager for its RDS credential.** This was a deliberate, user-approved home-lab cost decision — see `docs/architecture/technical-debt-register.md` TD-43 for the full record — traded off to reach genuinely $0/month for a minimal-device home-lab prototype deploy (no NAT Gateway, no Secrets Manager charge, no VPC endpoint).

**What's actually different for `dev` only** (`staging`/`prod` are completely unaffected — verified via `cdk synth`, both still use `fromGeneratedSecret()`/`DB_SECRET_ARN`):
- `infra/lib/data-stack.ts`: RDS master password comes from a CDK context value (`-c devDbPassword=...`) via `Credentials.fromPassword(...cdk.SecretValue.unsafePlainText(...))` — **this password ends up in plaintext in the synthesized CloudFormation template and stack outputs**, not access-controlled or rotated the way a real secret is.
- `infra/lib/network-stack.ts`: `dev` gets 0 NAT gateways (this is *why* the plaintext path was needed at all — it removes apiFn/ingestFn's only reason to need outbound internet, which was fetching the RDS credential from Secrets Manager).
- Automatic credential rotation is skipped entirely for `dev`.
- `backend/shared/db.ts`'s `getPool()` has a `DB_PASSWORD` branch that reads the credential straight from a Lambda env var instead of calling Secrets Manager.

**🔴 This is a hard gate, not a someday cleanup item: before any real customer data ever touches this deployment — including promoting this pattern to `staging` or `prod`, or pointing a real customer's device fleet at what was a `dev`-stage sandbox — this must be reverted to the Secrets Manager path every other stage already uses.** If a future session is asked to move toward a real customer pilot, deploy for an actual customer, or "promote dev to prod," proactively flag this exact trade-off before proceeding, even if not explicitly asked to check.

## Cost Kill Switch (added 2026-07-15)

**Every deploy requires `-c budgetAlertEmail=you@example.com`** — `infra/lib/budget-stack.ts` fails synth loudly without it, same "no silent default" discipline as `-c stage=`. User-requested, in response to real worry about unplanned AWS charges once a real account/deploy exists.

**What it does**: AWS's own native Budget Actions feature (no custom Lambda) — a monthly cost budget (`-c budgetLimitUsd=`, default `$5`) emails at 50%/80% of the limit, then **automatically stops the stage's RDS instance at 100%**, using AWS's documented `AWSBudgetsActions_RolePolicyForResourceAdministrationWithSSM` managed policy rather than a hand-rolled equivalent (cdk-nag `AwsSolutions-IAM4` suppressed with that reasoning). RDS is the one resource in this architecture that bills hourly regardless of usage — everything else (Lambda, API Gateway, CloudFront, S3, Cognito, IoT Core) is already pay-per-use with nothing to "stop."

**Real, disclosed limitations — do not oversell this as a complete safety net:**
- **AWS Budgets track account-wide spend, not per-stage.** If more than one stage is ever deployed to the same AWS account simultaneously, each stage's `BudgetStack` would watch the *same* total account cost, not its own slice — fine under this project's current single-stage-at-a-time reality, would need real redesign (cost-allocation tags + a filtered budget) before that changes.
- **Billing data has reporting lag** (typically updated a few times a day) — this is a strong, fast first response, not an instantaneous circuit breaker.
- **A Budget-Action-stopped RDS instance is still subject to AWS's own platform rule that a stopped instance auto-restarts after 7 days**, regardless of what triggered the stop. This buys a pause to notice and fix the underlying cost driver, not a permanent shutdown — if nothing is done within 7 days, RDS resumes billing on its own.

## Azure Cost Kill Switch (added 2026-07-21, `infra-azure/modules/budget.bicep` + `ops/cost-killswitch/`)

The Azure equivalent of the AWS kill switch above — built because **Azure Cost Management budgets are alert-only; there is no native Budget-Actions-style auto-stop** (`project_peaklogic_azure_cost_findings` memory). Same 50%/80%/100% shape, deliberately:

- **Every `infra-azure` deploy requires `killswitchSecret` and (already required) `alertEmail`** — `budget.bicep` has no default for either.
- **50%/80%**: email-only, reusing `monitoring.bicep`'s existing on-call Action Group (no stop-function receiver attached to it — a CPU-spike alert firing on that same group must never also stop the database).
- **100%**: a dedicated `${namePrefix}-cost-killswitch-ag` Action Group both emails and invokes a small, standalone Function (`ops/cost-killswitch/`, its own `package.json` — deliberately NOT bundled into the main app's future `api.bicep` Function App, so the powerful "can stop the database" ARM permission stays on a narrowly-scoped identity, not the whole application's).
- **Auth is a self-managed shared secret, not Azure's built-in Function key** — the webhook carries `?secret=...`, checked in-code (`ops/cost-killswitch/src/auth.ts`, constant-time comparison, fails closed if unset). Deliberate: correctly retrieving a Function host key via Bicep's `listKeys()` couldn't be verified against a live subscription; a secret we generate and fully unit-test could be.
- **The Function's own managed identity gets `Contributor`, scoped to just the Postgres server resource** (no narrower built-in role exists for "start/stop only" on this resource type) — least privilege applied at the scope, not the role.
- **Same 7-day-auto-restart caveat as AWS**: verified via Microsoft's own docs that a stopped Postgres Flexible Server auto-restarts after 7 days regardless of what stopped it — a pause to fix the cost driver, not a permanent shutdown.
- **Genuine improvement over the AWS side, not just parity**: this budget is resource-group-scoped (one per stage), so multiple stages in one subscription don't share a single account-wide budget the way AWS Budgets do.
- Not deployed/validated against a real subscription — same disclosed limitation as every other `infra-azure/` file.

## CI/CD (`.github/workflows/`, wired for Azure 2026-08-01, see `docs/architecture/cicd-pipeline.md`)

Four workflows, all Azure-native: `ci.yml` (every PR/push into `dev`/`main` — typecheck/build/test jobs per package, plus `backend-dependency-audit`/`frontend-dependency-audit`/`scripts-dependency-audit`: `npm audit --omit=dev --audit-level=high` per package, added 2026-08-01 for Tier 0.6 of the security hardening strategy below; plus two infra jobs — `infra-validate`: `az bicep build` against `infra-azure/main.bicep` + the 3 `entra/*.bicep` files, compile-time validation only, no credentials needed; `infra-psrule`: PSRule for Azure (`microsoft/ps-rule@v2.9.0`), added 2026-08-01 for Tier 2 item 3, the cdk-nag-equivalent best-practices check `infra-validate` never covered — expands each `*.psrule.bicepparam`-driven deployment (`ps-rule.yaml`'s own header explains why raw `.bicep` isn't scanned directly), genuinely untested end-to-end like everything else in `infra-azure/`); `deploy-{dev,staging,prod}.yml` (Entra Workload Identity Federation via `azure/login@v2` — no stored client secrets — then a two-step deploy: `az deployment group create` provisions/updates the Azure *resources*, `Azure/functions-action@v1` separately zip-deploys `backend/`'s built code to the Function App). `dev` deploys automatically on push; `staging`/`prod` are `workflow_dispatch`-only (this repo's free GitHub tier doesn't support required-reviewer environment protection, confirmed via a live `422` — the human who triggers the run is the approval gate).

**Cannot run yet — the workflows are real, the Azure account behind them isn't.** Before any of these fire successfully, someone with real Azure access needs to: create a subscription; create the `peaklogic-{dev,staging,prod}-rg` resource groups (`az group create` — deliberately out-of-band, not done by the workflow itself, per `main.bicep`'s own design); create one Entra App Registration per stage (`PeakLogic-{stage}-CiCd`) with a federated identity credential trusting this repo (cicd-pipeline.md §4.1); and set these in repo Settings → Secrets and variables → Actions:
- **Variables:** `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_DEV_CLIENT_ID` / `AZURE_STAGING_CLIENT_ID` / `AZURE_PROD_CLIENT_ID`, `ALERT_EMAIL`
- **Secrets** (one pair per stage): `{DEV,STAGING,PROD}_DB_ADMIN_PASSWORD`, `{DEV,STAGING,PROD}_KILLSWITCH_SECRET`

`infra/` (AWS CDK) is no longer validated or deployed by any workflow — retained only as historical reference per this file's fork notice.

## Branching & Commits

- `main` — production-ready only; tagged at every release
- `dev` — active development (default working branch)
- `feature/<name>` → PR into `dev`

Commit prefix convention: `feat:` `fix:` `infra:` `chore:` `docs:`

## Version Control Standards — Required

PeakLogic is an industrial IoT SaaS platform monitoring safety-critical equipment. **Version discipline is non-negotiable.** The platform follows [Semantic Versioning 2.0.0](https://semver.org) and [Conventional Commits 1.0.0](https://www.conventionalcommits.org).

### Version Scheme: `vMAJOR.MINOR.PATCH`

| Bump | Trigger | Example |
|------|---------|---------|
| **MAJOR** | Breaking API contract changes, DB schema breaking changes (column removal/rename, constraint changes requiring migration), security model overhaul, infrastructure changes requiring tenant data migration | `v1.x.x → v2.0.0` |
| **MINOR** | New features, new API endpoints, new frontend pages, new CDK resources, new alert categories, non-breaking schema additions (new columns with defaults, new tables) | `v1.0.x → v1.1.0` |
| **PATCH** | Bug fixes, configuration changes, dependency updates, documentation-only updates, performance improvements, non-breaking security patches | `v1.0.0 → v1.0.1` |

### Release Process — Execute in This Order

Every time a version is accepted and shipped, run through all steps. **Two documentation sets are maintained in lockstep with every release, not as an afterthought**: the System Administrator Guide (always updated) and the User Guide (checked every time, updated when user-facing behavior changed). Skipping either check is how documentation quietly goes stale — don't skip it even when a release looks purely backend/infra.

```
1.  All feature work merged to dev; typecheck passes (backend/ via `npm run typecheck`; each portal via `npm run build`)
2.  Determine version bump based on change types above
3.  Update CHANGELOG.md — move [Unreleased] items under new [vX.Y.Z] heading with ISO date
4.  git checkout main && git merge dev && git push origin main
5.  git tag vX.Y.Z && git push origin vX.Y.Z
6.  Update sysadmin-guides/PeakLogic_SysAdmin_Guide.html — REQUIRED every release, no exceptions:
      a. Bump version number in cover page, footer, and <title> to match the platform vX.Y.Z
      b. Add a row to the Document Revision History table
      c. Update every section affected by the release's actual changes (infra, schema, API,
         RLS/security posture, endpoints, alert rules, env vars, troubleshooting) — re-verify
         against the real code/config, don't just add a changelog blurb and leave stale detail
         in place further down the document
7.  Copy the updated guide to:
      sysadmin-guides/PeakLogic_SysAdmin_Guide_vX.Y.Z_YYYYMMDD.html  (keep ALL archived copies)
8.  Check user-guides/PeakLogic_User_Guide.html — did anything a real end user would see or do
    change this release (new/changed frontend page, a "Coming soon" feature went live, a
    workflow changed, new terminology)?
      - If yes: update the affected section(s), bump the guide's own version number (its own
        simple vN.M scheme — independent of the platform's SemVer, since this doc changes on a
        different cadence than infra/backend releases; see "Documentation Archiving Rules"),
        add a Revision History row, and archive a copy the same way as the sysadmin guide:
        user-guides/PeakLogic_User_Guide_vN.M_YYYYMMDD.html
      - If no: note that explicitly in the release commit message rather than silently skipping
        it — "User Guide: no change, nothing user-facing shipped this release" is a real,
        deliberate check, not a gap
9.  git add CHANGELOG.md sysadmin-guides/PeakLogic_SysAdmin_Guide*.html \
      user-guides/PeakLogic_User_Guide*.html   (only add the user-guide files if step 8 changed them)
    git commit -m "docs: release vX.Y.Z — update CHANGELOG and sysadmin/user guides"
    git push origin main
```

### Rollback Procedure (Deployment Architecture §4.2)

The release process above is forward-only — this is what to do when a deploy needs to be undone. Two distinct paths, since a bad *infrastructure* change and a bad *application code* change are different failure modes, but both use the same underlying mechanism: redeploy from a known-good tagged commit. Neither path needs new tooling — the existing tag-per-release discipline above already provides everything a rollback needs, it just wasn't written down as a procedure before now.

**Infrastructure rollback** (a CDK/stack change caused the problem):
```
1.  Identify the last known-good tag (git tag --list, or CHANGELOG.md)
2.  git checkout vX.Y.Z-previous-good   # detached HEAD at the target commit
3.  cd infra && npm install
4.  npm run diff:<stage>                # review exactly what will change back — never skip this
5.  npm run deploy:<stage>               # re-synthesizes and applies the prior template
6.  Verify the affected stack(s) in the AWS Console / CloudFormation events
7.  git checkout dev                    # return to normal working state
```

**Application code rollback** (a backend/frontend code change caused the problem):
Backend and frontend are bundled fresh at every `cdk deploy` — there is no separately-versioned deployable artifact to "roll back" independently of infrastructure. Rollback is the same mechanism as the infrastructure path above: check out the previous release tag and redeploy. `npm run deploy:<stage>` re-bundles `backend/` and re-runs the Lambda/API Gateway/frontend stacks from that tag's source, which *is* the rollback.

**Not yet true, flagged in Deployment Architecture §7:** this procedure has never been exercised against a real deploy, since no environment has ever actually been deployed to AWS yet (§4.3 of that document). Treat these steps as the documented starting point, not a tested runbook, until a real `dev`-stage deploy (and ideally a rollback drill) has happened at least once.

### CHANGELOG Format

Follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Use these categories only: `Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, `Security`. Write entries in past tense, user-facing language. Always maintain an `[Unreleased]` section at the top for work in progress.

### ⚠️ Guides Track the Product, Not the Architecture Docs (added 2026-08-01)

**Both guides must be verified against the actual running surfaces — the click-through demo (`marketing/demo.html`) and the portal apps themselves — not against the architecture documents.** This is not a style preference; it is the rule that would have prevented the worst documentation failure this project has had.

For months the User Guide described a single combined application (Dashboard / Sites / Assets / Devices / Alerts / Tickets) that **is not the product**. The real front end is three separate portals plus PeakView360. The guide was internally consistent, versioned, archived, and completely wrong, because every update was written from architecture docs rather than from the screens. The SysAdmin Guide had the same failure in its §10 and additionally documented AWS infrastructure while titled "Azure fork".

**Before changing either guide, open these and confirm what is actually there:**

| Surface | Where | Audience |
|---|---|---|
| Demo index | `marketing/demo.html` | The definitive map of what the product *is* |
| Customer Portal | `customer-portal/src/pages/` | Equipment owners — their sites only |
| Partner Portal | `channel-partner-portal/src/pages/` | Service companies — their whole book of business |
| Control Center | `marketing/control-center.html` | PeakLogic staff only |
| PeakView360 | `peakview360/src/screens/` + `components/AppShell.tsx` | Operators, launched from inside a portal |

**`frontend/` no longer exists.** It was the original single tenant app; it was retired on 2026-08-01 after its two remaining unique features were ported (device onboarding → Partner Portal, water-quality report → Customer Portal). Anything referring to it in the architecture documents is historical.

**Three specific accuracy rules, each learned from a real error:**
1. **Never describe a capability as available when it is not.** The Partner Portal renders a *Control* affordance, but actuation is a hard MVP gate (CC-3.1/CC-4.1) and no code path publishes a device command. Mark it `Coming soon` with an honest status line.
2. **Count the screens.** PeakView360 has *three* nav destinations plus a docked alarm panel — an earlier standalone Operator screen was merged into Facility View. A guide claiming "five screens" was wrong.
3. **State the deployment reality.** No Azure environment has ever been deployed. Any procedure never executed against a live subscription must say so rather than reading as a tested runbook.

### Documentation Archiving Rules (SysAdmin Guide + User Guide)

Two separately-versioned HTML guides are maintained, each in its own top-level directory. Never move either elsewhere, and never let one get updated without at least checking the other (Release Process step 6/8 above).

| File | Purpose |
|------|---------|
| `sysadmin-guides/PeakLogic_SysAdmin_Guide.html` | Always the current/latest version — update in place |
| `sysadmin-guides/PeakLogic_SysAdmin_Guide_vX.Y.Z_YYYYMMDD.html` | Immutable snapshot at each release — versioned with the **platform's SemVer** (matches the git tag), since this guide documents infra/backend/security posture that changes with every release |
| `user-guides/PeakLogic_User_Guide.html` | Always the current/latest version — update in place |
| `user-guides/PeakLogic_User_Guide_vN.M_YYYYMMDD.html` | Immutable snapshot at each *content* change — versioned with its **own simple `vN.M` scheme**, independent of platform SemVer. Bump the minor number (`v1.0`→`v1.1`) for adding/correcting a section; bump the major number (`v1.x`→`v2.0`) for a significant restructure or a wave of "Coming soon" features going live at once. Does **not** bump on releases where nothing user-facing changed — see Release Process step 8 |

**Never delete archived copies from either directory** — they form the audit trail. Both guides' `<title>`, cover page, Revision History table, and footer must be updated to match on every release where that guide changes. The User Guide's `<span class="badge badge-soon">Coming soon</span>` tags (§5–9 in the current edition) are the live signal for what to graduate to a fully-described feature the next time the underlying button/action is actually wired up in the frontend — check that list specifically at each release rather than only skimming for new pages.

## Git Discipline — Required

After completing any meaningful unit of work — a new feature, a bug fix, a refactor, an infra change, or a new file — **commit and push immediately**. Do not batch unrelated changes. The GitHub remote must always reflect current state.

```bash
git add <specific files>          # never use git add -A blindly
git commit -m "type: description" # follow the prefix convention above
git push origin dev               # push to remote immediately
```

Write commit messages that describe *why* the change was made. A future developer (or Claude instance) reading the log should understand intent without opening the diff.

Do not push `.env`, `.env.local`, `device-certs/`, or any file containing secrets. These are gitignored — verify with `git status` before committing if unsure.
