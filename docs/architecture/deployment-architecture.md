# Deployment Architecture

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.4), [Compliance & Certification Roadmap](compliance-certification-roadmap.md) (approved v1), [Security Architecture](security-architecture.md) (approved v1), [Multi-Tenant Architecture](multi-tenant-architecture.md) (approved v1)
**Last updated:** 2026-07-09

---

## 1. Introduction

### 1.1 Purpose

Several prior artifacts deferred a real decision here without naming it explicitly: Multi-Tenant Architecture §4 deferred resource-sharing/noisy-neighbor posture "before onboarding a tenant with a meaningfully different usage profile"; Compliance & Certification Roadmap §5 applied "flip for prod" reasoning to `multiAz`/`deletionProtection` without deciding *when* or *how* that flip happens. Neither asked the more basic question this document starts from: **does a deploy of this system even distinguish dev from prod today?** It didn't (§2) — that gap is this document's central finding and fix.

### 1.2 Scope

In scope: environment/deployment-stage strategy (single account vs. multiple, how resources avoid colliding across stages), the resulting HA/DR posture (Multi-AZ, NAT redundancy, instance sizing — formalizing the existing "flip for prod" TODOs into an actual, automatic decision), release and rollback process, and frontend deployment (existing, already well-documented — reconciled here, not redesigned).

Out of scope: the CDK code organization/module structure itself (→ Infrastructure as Code, #16), CI/CD automation — **none exists today** (no `.github/` directory, no pipeline of any kind; every deploy step in `CLAUDE.md`'s release process is manually run) — that gap belongs to CI/CD Pipeline (#17), not here. This document assumes deploys stay manual for now and designs the stage/HA model to be correct either way.

---

## 2. Critical gap found and fixed: zero environment separation existed

**The gap:** `infra/bin/peaklogic.ts` declared exactly one fixed set of stack names (`PeakLogic-Network`, `PeakLogic-Data`, etc.) with no environment concept anywhere — no context variable, no naming suffix, nothing in `cdk.json`. Every account+region-unique resource name was hardcoded too: both Lambda function names (`peaklogic-api`, `peaklogic-ingest`), the REST API name, the Cognito user pool/client names, and the IoT thing type/policy/rule/log group names. **A `cdk deploy` run from the `dev` branch and one run from `main` would target the exact literal same AWS resources** — there was no way to stand up a staging or pre-prod environment distinct from whatever was already deployed, despite `CLAUDE.md`'s own branching model (`dev` = active development, `main` = production-ready, tagged releases) implying environment separation should exist.

**Why this had gone unnoticed:** per [[project-peaklogic-overview]]'s own history, `cdk synth` had apparently never been run successfully before Security Architecture's code-reconciliation pass surfaced an unrelated bundling bug — so nothing had ever actually attempted a real deploy that would have surfaced the collision.

**Fixed 2026-07-09 (commit `1ef0fdf`), before this document was drafted, given how load-bearing it is** — the same severity judgment call made for Multi-Tenant Architecture's telemetry RLS gap, though this one is a design gap in never-yet-deployed infrastructure rather than a live data exposure, so it didn't warrant interrupting mid-task the same way.

### 2.1 Decision: single AWS account, stage-suffixed resources — not separate accounts per stage

Two real options exist for environment isolation: separate AWS accounts per stage (full blast-radius isolation, the AWS-recommended best practice at real organizational scale) or one account with stage-suffixed resource names (cheaper, simpler, less operational overhead). **Decision: single account, three stages (`dev`/`staging`/`prod`) distinguished by a required CDK context value.** This matches the cost-conscious MVP posture already made everywhere else in this codebase (`db.t3.micro`, single NAT gateway, `multiAz: false` — all explicit "acceptable for now" calls) and the PRD §8 framing that MVP validates the product thesis with a small number of design-partner tenants, not general availability. Multi-account setup is real, valuable ops maturity — appropriate to revisit once there's an actual SOC 2 Type II engagement or enterprise customer requiring that level of isolation, not before.

Implementation: `infra/bin/peaklogic.ts` reads `-c stage=` and throws if it's missing or not one of `dev`/`staging`/`prod` — **no default.** A missing flag failing the synth outright is a much safer failure mode than a mistyped one silently deploying to the wrong environment. Every stack ID and every previously-hardcoded resource name is now suffixed by stage (e.g. `PeakLogic-dev-Api`, `peaklogic-prod-api`, `PeakLogicDevicePolicy-staging`). Verified via `cdk synth` for both `dev` and `prod`: distinct stack names, and a diff of both templates' named resources confirmed zero collisions.

### 2.2 One deliberate exception: the MQTT topic namespace is not stage-scoped

IoT Core resource *names* (thing type, policy, topic rule, log group) are stage-suffixed like everything else, but the MQTT topic pattern devices actually publish/subscribe to (`peaklogic/{thingName}/telemetry`, `.../commands`) is not. Extending stage-scoping there would mean changing what firmware/`provision-devices.ts` write into `device-config.json`, a materially bigger, product-facing change than this fix warranted.

**Consequence:** the `TelemetryRule`'s SQL (`FROM 'peaklogic/+/telemetry'`) is unscoped by stage — if `dev` and `prod` IoT stacks were ever both deployed to the same AWS account, both stages' ingest Lambdas would fire on literally the same telemetry from any device, regardless of which stage's Thing it was provisioned under. **Operational rule adopted instead of a code fix:** only one stage's IoT stack may be deployed per AWS account at a time, or use genuinely separate AWS accounts per stage if `dev` and `prod` ever need real devices reporting simultaneously. Documented in `CLAUDE.md`'s new "Environments / Deployment Stages" section so this isn't rediscovered the hard way later.

---

## 3. High Availability & Disaster Recovery

### 3.1 Formalized: three "flip for prod" TODOs are now automatic, not manual

Three settings previously had hardcoded values and a code comment saying to change them before a production deploy — a manual step a human could forget. All three now key off `stage` directly (commit `1ef0fdf`), verified via `cdk synth` to actually differ between `dev` and `prod`:

| Setting | dev / staging | prod | Why |
|---|---|---|---|
| RDS `multiAz` | `false` | `true` | Prod gets automatic failover to a standby in a second AZ; not worth the cost at design-partner scale |
| RDS `deletionProtection` | `false` | `true` | Prevents an accidental `cdk destroy`/console delete from taking out the production database |
| RDS instance size | `db.t3.micro` | `db.t3.medium` | The existing code comment's own threshold ("when you have paying customers") — prod stage is that threshold now |
| NAT gateways | 1 | 2 (one per AZ) | Closes a real single point of failure: with 1 NAT gateway, CDK's default VPC construct routes *every* private subnet's egress through it regardless of AZ, so that NAT's AZ having an outage would break every Lambda's AWS-API connectivity (Secrets Manager, IoT Core, etc.) platform-wide, not just in the affected AZ — acceptable for non-prod, not for prod |

### 3.2 Backup / RPO / RTO — existing mechanism, no explicit target stated until now

RDS automated backups exist (`backupRetention: 7 days`, existing/reconciled) and support point-in-time recovery within that window. No document before this one stated an explicit RPO/RTO target to hold that mechanism accountable to. **Decision:** RPO ≤ 5 minutes (RDS automated backups' continuous transaction-log capture already provides this within the 7-day window; not a new mechanism, just naming the number PRD §6's non-contractual 99.9% uptime target implies), RTO ≤ 4 hours (point-in-time restore to a new instance, DNS/connection-string cutover — not yet drilled or timed against a real restore, see §5). No cross-region backup replication exists or is recommended yet — single-region is consistent with the single-account, cost-conscious posture elsewhere in this document, and PRD §6's target is an internal engineering goal, not yet a contractual SLA that would require it.

---

## 4. Release & Rollback Process

### 4.1 Release Process (existing, reconciled)

`CLAUDE.md`'s release process (merge `dev` → `main`, tag `vX.Y.Z`, update CHANGELOG and sysadmin guide, deploy) is already fully documented and followed — no gap, no change here. Worth stating explicitly for the first time: this process has never actually been exercised end-to-end against real infrastructure, since (per §2) no deploy has ever succeeded — `cdk synth` itself only started working during this document's own investigation.

### 4.2 Real gap found: no rollback procedure exists

**The gap:** `CLAUDE.md`'s release process is entirely forward-only — merge, tag, deploy. Nothing describes what to do when a deploy introduces a real production problem.

**Recommendation:** two distinct rollback paths, since a bad deploy and a bad code release are different failure modes:
- **Infrastructure rollback:** `cdk deploy` against a previous git commit/tag re-synthesizes and applies the prior CloudFormation template — this already works via normal git checkout + redeploy, no new tooling needed, just needs to be a documented, known procedure rather than something to figure out under pressure.
- **Application code rollback:** since backend/frontend are bundled fresh at every CDK deploy (no separate artifact versioning), "rollback" means redeploying from the previous release tag on `main`, the same mechanism as a forward deploy. Worth stating explicitly in `CLAUDE.md`'s release process so it's a known, rehearsed path — not implemented as new tooling in this draft, since the existing tag-per-release discipline (`Version Control Standards` in `CLAUDE.md`) already provides everything a rollback needs; it just isn't written down as a procedure.

Not implemented in this draft — recommended as a `CLAUDE.md` documentation addition (§7), since it requires no new code, just writing down the existing tag-based mechanism as an explicit runbook step.

### 4.3 Real gap found: no deploy has ever been drilled

Beyond the specific `cdk synth` bug fixed in Security Architecture and the environment gap fixed in §2, the more general fact is that **this entire deployment pipeline has zero track record** — no stack has ever been successfully `cdk deploy`'d against a real AWS account. This isn't a design flaw to fix in this document (the design is now verified via `synth`, as far as static validation can confirm), but it is a real, standing risk: the first real deploy to any environment, including `dev`, is also the first time this entire system will be exercised end-to-end, and will very likely surface issues static synthesis can't catch (IAM permission edges, actual VPC routing behavior, RDS provisioning time, Cognito quirks). Flagged as an open item (§7) — recommend a `dev`-stage deploy drill before this system is relied on for anything real, independent of any specific code change.

---

## 5. Frontend Deployment (existing, reconciled)

Manual `npm run build && aws s3 sync dist/ s3://BUCKET --delete && aws cloudfront create-invalidation --distribution-id ID --paths "/*"`, already fully documented in the SysAdmin Guide (including a troubleshooting entry for "forgot to invalidate the cache"). No `BucketDeployment` CDK construct automates this — a deliberate manual step, not an oversight, consistent with this project having no CI/CD automation at all yet (§1.2). No gap found; no change recommended until CI/CD Pipeline (#17) exists to potentially automate it.

---

## 6. Traceability

| Section | Traces to |
|---|---|
| §2 Environment separation | New finding — already fixed (commit `1ef0fdf`) |
| §2.2 MQTT topic namespace exception | New finding — documented operational constraint, not a code fix |
| §3.1 Stage-conditional HA | Compliance & Certification Roadmap §5 (the original "flip for prod" comments), Multi-Tenant Architecture §4 (resource-sharing posture deferred here) |
| §3.2 RPO/RTO targets | PRD §6 (99.9% uptime, non-contractual) |
| §4.2 Rollback procedure gap | New finding — no existing requirement covers this |
| §4.3 Undrilled deploy risk | New finding |

---

## 7. Open Questions

1. **§4.2's rollback procedure is recommended but not yet written into `CLAUDE.md`** — a documentation task, not a code change; the underlying tag-based mechanism already exists.
2. **§4.3: no environment has ever actually been deployed.** Recommend a `dev`-stage deploy drill as a standing action item, independent of any further architecture work — static verification (`synth`, `typecheck`) has gone as far as it can.
3. **§3.2's RTO (≤4 hours) is a stated target, not a tested one** — no restore-from-backup drill has ever been run. Revisit once §4.3's deploy drill establishes that a real environment exists to test against.
4. **CI/CD Pipeline (#17) will need to know about the stage model** this document just introduced — `-c stage=` is a required parameter any future pipeline automation must pass explicitly per environment, not something to rediscover independently when that artifact is written.

---

## 8. Review Log

Not yet reviewed — draft v0.1.
