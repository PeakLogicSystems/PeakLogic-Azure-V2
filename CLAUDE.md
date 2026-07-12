# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Naming

- **Company:** PeakLogic
- **Internal codename:** Vantage
- **Product:** PeakVantage Hub (the core intelligence/monitoring hub) and PeakVantage 360 (the full device + software ecosystem built on it)

Placeholder naming as of 2026-07 — not yet trademark-cleared, treat as provisional and update everywhere if it changes.

## Governance: architecture-first (adopted 2026-07-04)

This project is moving to the same architecture-first discipline used by the IronQuill project: documents are produced in dependency order in `docs/architecture/` (see `docs/architecture/README.md` for live status and the full artifact list — Vision → PRD → SRS → Domain Model → Compliance & Certification Roadmap → ... → MVP/Enterprise Roadmap), every implementation decision should trace to the PRD once it exists, and later documents can force revisions to earlier ones.

**Existing code is reference, not authoritative.** Unlike IronQuill (which started pre-code), PeakLogicSystems already has a working v1.0.0 — that code isn't being thrown away, but it also isn't the source of truth going forward. As each architecture doc is produced, formally reconcile the existing implementation against it and revise/rewrite where real gaps surface, rather than either ignoring the docs or discarding working code wholesale.

The goal of this discipline is a fully commercialized, enterprise-sellable product — which is also why SOC 2 readiness and a real security/compliance posture are explicit artifacts in the list, not an afterthought bolted on before a big customer's security review.

## Monorepo Structure

Four independent sub-packages, each with their own `package.json` and `tsconfig.json`:

| Directory   | Purpose                                      | Runtime   |
|-------------|----------------------------------------------|-----------|
| `infra/`    | AWS CDK v2 stacks (TypeScript)               | Node 20   |
| `backend/`  | Lambda source (API + ingest)                 | Node 20   |
| `frontend/` | React SPA (Vite + Tailwind)                  | Browser   |
| `scripts/`  | Admin tooling (device provisioning, DB migrations) | Node 20   |

**The backend is not deployed independently.** CDK bundles it at deploy time via esbuild. The `ApiStack` in `infra/lib/api-stack.ts` points `entry:` directly into `../../backend/`. There is no build step to run before deploying the backend.

## Common Commands

```bash
# Frontend
cd frontend
npm install
npm run dev          # http://localhost:5173 (requires VITE_PREVIEW=true in .env.local)
npm run build        # output to frontend/dist/
npm run typecheck    # tsc --noEmit

# Backend
cd backend
npm run typecheck    # tsc --noEmit (no standalone build needed)

# Infrastructure — every command requires an explicit stage; there is no
# default (Deployment Architecture §2). Missing -c stage= fails synth outright.
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

Every API route that touches the database **must** use `withTenant()` from `backend/shared/db.ts`. This wraps the query in a transaction that sets `SET LOCAL app.current_tenant_id = '<uuid>'`, which activates PostgreSQL Row-Level Security on all tenant-scoped tables. Skipping this wrapper means the query runs without a tenant filter and will either return no rows (RLS blocks it) or all rows (if running as superuser).

The ingest Lambda (`backend/ingest/handler.ts`) is the one intentional exception — it bypasses RLS by using `pool.connect()` directly because it operates as a system process writing across tenants.

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

Hardcoded in `backend/ingest/handler.ts` in `RULES_BY_CATEGORY`. Threshold functions receive the asset's `specs` JSONB — if specs are null, defaults are used. Deduplication prevents a second alert of the same `(device_id, metric, severity)` while one is already `open` or `acknowledged`. Critical alerts auto-create a service ticket and fire a webhook (fire-and-forget, 8s timeout) using the tenant's `settings.webhook_url`.

Categories today: `pump`, `hvac`, `pool_system`, `refrigeration`, `leak_sensor`, `energy_meter`. This dictionary is meant to be extended — adding a new vertical/asset type is just a new key with its own rule list, not a schema change (`assets.category` is unconstrained TEXT). `refrigeration` deliberately keys off `product_temp_c` (a probe in the food/drink itself), not ambient air temp — that's the energy-savings-plus-food-safety pitch: the unit can run warmer when the product itself is still safely cold.

### Future: Command & Control Architecture (not yet implemented)

Actuation (e.g. remotely shutting off a valve) is on the roadmap but not built. Two things are worth locking in now, before that subsystem exists, so later work doesn't have to relitigate them:

- **Network model is already right — extend it, don't replace it.** Devices connect *outbound* to AWS IoT Core over a persistent MQTT/TLS session (mutual TLS via per-device X.509 certs, provisioned in `scripts/provision-devices.ts`). Once that connection is open, the cloud can push messages down it — no inbound firewall rule, port-forward, or dedicated VLAN is ever required on the customer network, which matters because most target customers (especially enterprise, zero-trust) will not grant those. `infra/lib/iot-stack.ts`'s `DevicePolicy` already scopes each device to subscribe/receive on its own `peaklogic/{thingName}/commands` topic — nothing publishes to it yet, but the channel exists.
- **Prefer port 443 over 8883 for any future firmware.** `device-config.json` (written by `provision-devices.ts`) currently hardcodes port `8883`. AWS IoT Core supports the identical MQTT session over `443` (looks like ordinary HTTPS to network security appliances), which is far more likely to pass a locked-down egress firewall unmodified. This is a firmware-side connection setting, not an infra change.
- **TLS-inspection proxies are a known limitation, not something to engineer around.** Some enterprise zero-trust stacks terminate/re-encrypt all outbound TLS to inspect it, which breaks IoT Core's mutual-TLS device certs. This has to be handled as a customer onboarding step (an allowlist/bypass exception for the AWS IoT endpoint from their IT), not solved in code.
- **Safety-critical actuation must default to local, not cloud-dependent.** For something like a leak shutoff, the device should trip off its own sensor reading immediately, without waiting on a cloud round trip — the cloud command channel is for remote override/reset/manual control and audit logging, not the sole trigger path. Design any future device firmware and the command API around that split.
- **Not designed yet:** the actual command-publish path (an API endpoint + Lambda to publish to the `commands` topic), an ack/delivery-confirmation pattern (device shadow vs. custom ack topic), and an audit table logging who/what issued each command and its outcome. Design these together as one piece of work when actuation is actually scheduled — don't build the publish path without the audit trail.

### Frontend Auth Bypass

Set `VITE_PREVIEW=true` in `frontend/.env.local` to skip the Cognito `Authenticator` and render the app with a placeholder user. This flag is checked in `frontend/src/App.tsx`. All frontend pages currently use hardcoded mock data — they are not yet wired to the real API.

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

**Frontend** (`frontend/.env.local` for local dev, `frontend/.env` for production builds):
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
1.  All feature work merged to dev; typecheck passes (npm run typecheck in backend/ and frontend/)
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
