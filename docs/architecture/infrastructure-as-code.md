# Infrastructure as Code

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1
**Depends on:** [Deployment Architecture](deployment-architecture.md) (approved v1), [Security Architecture](security-architecture.md) (approved v1)
**Last updated:** 2026-07-09

---

## 1. Introduction

### 1.1 Purpose

Deployment Architecture §1.2 explicitly deferred "the CDK code organization/module structure itself" here rather than covering it as part of environment/topology strategy. This document's job is the CDK codebase's own quality, correctness, and best-practice posture — not what gets deployed where (that's decided), but whether the code that deploys it is actually sound.

### 1.2 Scope

In scope: automated best-practice/compliance checking of the CDK code (adopting `cdk-nag`, and working through everything it found), the deprecated-API and cross-stack-reference issues already surfacing from real `cdk synth` runs across prior artifacts, and dependency version-pinning policy. Out of scope: CI/CD automation that would run these checks on every PR (→ CI/CD Pipeline, #17 — none exists yet, per Deployment Architecture §1.2), and CDK unit/snapshot testing (→ Test Strategy, #18 — flagged here as a real gap this document found, but not solved here).

---

## 2. Automated Compliance Checking: `cdk-nag` Adopted

**Decision: wire `cdk-nag`'s `AwsSolutionsChecks` into every `cdk synth`**, not just rely on manual review the way every prior artifact's infra findings were caught (all found by a human reading code line-by-line). `infra/bin/peaklogic.ts` now runs it via `Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))` — every future synth surfaces new findings automatically, not only when someone happens to write an architecture doc that looks closely.

**Version note:** `cdk-nag@2.28.0`, not the current `3.0.1` — the latest major requires `aws-cdk-lib ^2.257.0`, and this project pins `^2.140.0`. Bumping the core CDK framework version just to adopt a linting tool would be a materially bigger, riskier change than this fix warranted (untested framework-wide behavior changes across all 6 stacks); `2.28.0` supports `aws-cdk-lib ^2.78.0`, comfortably compatible with what's already pinned.

First run surfaced **21 real findings** across every stack. All were worked through — nothing left as an unexplained red mark:

### 2.1 Fixed outright (6)

| Finding | Fix |
|---|---|
| L1 / IAM5 — deprecated `logRetention` | Replaced with explicit per-function `logs.LogGroup` constructs (api-stack.ts) — `logRetention` provisions a custom-resource Lambda with a wildcard IAM policy to set retention after the fact; deprecated by CDK itself |
| APIG1 — no API Gateway access logging | Added a dedicated access-log `LogGroup` + `accessLogDestination`/`accessLogFormat`, distinct from the existing execution-logging config |
| S1/S10 — S3 bucket logging/TLS | `enforceSSL: true` + a shared access-logs bucket for the frontend bucket |
| CFR3 — CloudFront access logging | Same shared access-logs bucket, via `logBucket`/`logFilePrefix` |
| VPC7 — no VPC Flow Logs | Added via `ec2.FlowLog` → a new CloudWatch Logs group |
| SMG4 — no RDS secret rotation | `dbInstance.addRotationSingleUser()`, 30-day schedule, all stages. Real story in §2.3 — this one fought back |

All four logging additions double as new forensic sources for the incident-response gap Security Architecture §6 already flagged — before this, Lambda logs and `audit_log_entries` were the only two; API Gateway access logs, CloudFront access logs, and VPC Flow Logs are all new investigative surfaces a responder didn't have.

### 2.2 Suppressed, each with a written, specific reason (13)

Every suppression names *why*, not just the rule ID — re-litigate the reason if a finding reappears after code changes, not just re-suppress the ID:

| Finding | Reason accepted |
|---|---|
| IAM4 (×3) | AWS-managed Lambda/API-Gateway execution-role policies — standard CDK scaffolding, replacing them duplicates an AWS-maintained baseline for no real gain |
| IAM5 (×1) | CloudWatch Logs' required log-stream ARN wildcard suffix on `grantInvoke()` — correct IAM syntax, not an open grant. **Took two attempts to locate**: the finding attaches to the IAM-*holding* resource (`iot-stack.ts`'s `ruleRole`), not the granting one (`api-stack.ts`'s `ingestFn`) — the first suppression, placed in `api-stack.ts`, silently never matched anything until traced to the right stack |
| RDS11 | Default port 5432 — port obfuscation is weak security theater given RDS's real isolation is network-layer (Multi-Tenant Architecture §2.1), matching how TLS cert validation was reasoned about in Security Architecture §4.2 |
| COG8 | Cognito Plus tier is a real paid feature-tier upgrade, not a config flag — cost/feature tradeoff deferred at design-partner-tenant scale |
| APIG3, CFR2 | WAF — already decided against for now in Security Architecture §3.3 |
| CFR4 | TLSv1 allowed only because this distribution uses CloudFront's *default* certificate — a custom `minimumProtocolVersion` requires a custom domain + ACM cert, which requires actually owning `app.peaklogic.io`'s DNS. Not yet true, despite `auth-stack.ts`'s Cognito callback URLs already referencing that domain as a placeholder |
| L1 (Lambda runtime) | `NODEJS_20_X` is still actively supported LTS; a bump is a deliberate future upgrade (also requires updating esbuild's bundling target), not done reactively to a linter finding alone |
| APIG2 | Every route already validates its own inputs in the Lambda handler before touching the database — API Gateway-level validation would be redundant defense-in-depth |
| CFR1 | No regulatory/business requirement to geo-restrict today |
| RDS3, RDS10 (dev/staging only) | Multi-AZ and deletion protection are a deliberate MVP cost tradeoff (Deployment Architecture §3.1) — **suppressed only for non-prod**; prod actually has both enabled, so prod synths with zero findings on these rules, not a suppression |

### 2.3 SMG4 — the one that took three attempts and a real architecture fix

**RDS secret rotation is now real** (`dbInstance.addRotationSingleUser()`, 30-day schedule, all stages — commit `206902c`), but getting there surfaced a genuine, structural CDK cross-stack limitation, not just a missing config flag:

1. Calling `addRotationSingleUser()` directly on `dbInstance` from `data-stack.ts` hit a CloudFormation dependency cycle. Reading CDK's own `SecretRotation` source showed why: it unconditionally calls `target.connections.allowDefaultPortFrom(securityGroup)`, which needs the DB's own endpoint port to build the ingress rule it adds — and that rule is placed in whichever stack owns the DB's security group. `rdsSg` lived in `NetworkStack`, instantiated *before* `DataStack` even exists in `bin/peaklogic.ts` — so it could never depend back on `DataStack` for that port value. Structurally unfixable via options; reproduced identically with the plainest possible call, no security-group or subnet overrides at all.
2. Moving only the *call site* to `api-stack.ts` (which already depends on both `NetworkStack` and `DataStack` without a cycle) didn't help — `addRotationSingleUser` is a method *on* `dbInstance`, so `this` inside it is always `dbInstance`/`DataStack` regardless of which file's code invokes it. Same cycle, unchanged.
3. Constructing `secretsmanager.SecretRotation` directly with `ApiStack` as its scope avoided *that* specific issue, but not the underlying one — the ingress-rule placement problem is independent of where `SecretRotation` itself lives.

**The actual fix:** move `rdsSg`'s creation out of `NetworkStack` and into `DataStack` — the only stack that ever consumed it anyway. With the DB, its secret, and its own security group all living in one stack, every reference `addRotationSingleUser` needs is local; the only remaining cross-stack reference (`Data -> Network` for `vpc`/`lambdaSg`) is the same direction `DataStack` already needed to create the DB in the first place. Verified via `cdk synth` for both `dev` and `prod`: zero findings, zero resource-name collisions, `AWS::SecretsManager::RotationSchedule` and `AWS::Serverless::Application` both present in the synthesized template.

**Why this is worth narrating, not just stating as done:** three of the four attempts looked individually reasonable and each failed for a different, non-obvious reason. A future reader hitting the same CDK error with a different resource should recognize the pattern — a convenience method's "automatic" cross-resource wiring can force a stack dependency that contradicts your instantiation order — rather than rediscovering it from scratch.

---

## 3. Real gap found and fixed: cross-stack reference strength was implicit

Every `cdk synth` run across every prior artifact's verification carried the same unaddressed warning: no feature flag configured for `@aws-cdk/core:defaultCrossStackReferences`, silently defaulting to `"strong"`. **Fixed:** `infra/cdk.json` now sets it explicitly. Since nothing has ever actually been deployed (Deployment Architecture §4.3), there's no live cross-stack-reference migration risk the usual "`both` → `weak`" two-step dance exists to protect against — setting `"strong"` directly just makes the already-in-effect default explicit and documented instead of implicit and easy to overlook.

---

## 4. Dependency Version Pinning — existing practice, stated explicitly for the first time

`package.json` uses caret ranges (`aws-cdk-lib: ^2.140.0`), which would normally mean floating minor-version drift on `npm install`. **The actual pinning mechanism is the committed `package-lock.json`** (added to git during Security Architecture's code reconciliation) — installs are reproducible today regardless of the caret range, since `npm install` respects the lockfile unless explicitly told to update. No gap, no change — this section exists so a future reader doesn't have to rediscover that the lockfile, not the caret range, is what actually pins versions.

---

## 5. Traceability

| Section | Traces to |
|---|---|
| §2 cdk-nag adoption | New finding — 21 sub-findings, fixed/suppressed as itemized above |
| §2.1's logging additions | Security Architecture §6 (incident-response forensic sources) |
| §2.3 RDS rotation + stack restructure | New finding — already fixed (commit `206902c`) |
| §3 Cross-stack reference strength | New finding — already fixed |
| §4 Dependency pinning | Security Architecture code reconciliation (where `package-lock.json` was first committed) |

---

## 6. Open Questions

1. **§2.3's rotation fix has never run against a real database** — like everything else touched by Deployment Architecture §4.3's standing caveat, this is verified only via `cdk synth`, not a real deploy. The rotation Lambda's actual behavior (can it truly reach both RDS and Secrets Manager from `PRIVATE_WITH_EGRESS`, does the single-user rotation strategy work cleanly against this schema) is unconfirmed until a real `dev`-stage deploy happens.
2. **CFR4 (CloudFront TLS version) is blocked on a real custom domain + ACM certificate** — `app.peaklogic.io` isn't actually owned/configured anywhere yet, despite being referenced as a placeholder in `auth-stack.ts`. A real domain decision, not an infra-code fix.
3. **No CDK unit/snapshot tests exist** (`infra/` has no `test/` directory at all) — `cdk-nag` catches best-practice/compliance drift on every synth now, but nothing catches a logic regression (e.g., an accidentally-removed security group rule, a wrong stage suffix) short of a human reading the diff. Flagged for Test Strategy (#18), not solved here. §2.3's saga is a concrete example of exactly the kind of regression a snapshot test would have caught immediately instead of requiring three manual synth-and-diagnose cycles.
4. **Lambda runtime version (L1) and Cognito Plus tier (COG8) are both suppressed as "not yet," not "never."** Worth a periodic revisit rather than treating the suppression as permanent — no specific trigger defined here beyond what's already stated per-item in §2.2.

---

## 7. Review Log

Reviewed 2026-07-09 (initial draft) and 2026-07-09 (post-SMG4-fix update). One systematic citation issue found and fixed in the first pass; the second pass updated §2.1/§2.3/§5/§6 to reflect SMG4 actually shipping, verified against the real commit rather than just editing prose to match intent.

1. **First pass — every in-code `// Infrastructure as Code §N` citation was wrong.** All nine were written referencing section numbers before this document's structure was finalized, and drifted once §3/§4 ended up being "cross-stack references" and "dependency pinning" rather than what the code comments assumed. Fixed all nine (`api-stack.ts` ×2, `auth-stack.ts`, `data-stack.ts` ×2, `frontend-stack.ts` ×2, `iot-stack.ts`, `bin/peaklogic.ts`) to point at the sections that actually discuss them. Re-ran `cdk synth` after the fix — still zero `AwsSolutions` findings, confirming the citation fix touched only comments, not behavior.
2. **First pass — re-verified, held up:** the "no `test/` directory exists" claim via a direct filesystem check; the zero-findings claim for both `dev` and `prod` via a fresh `cdk synth` re-run of each.
3. **Second pass — re-verified the SMG4 fix claims against the actual commit**, not just the intended design: confirmed `AWS::SecretsManager::RotationSchedule` and `AWS::Serverless::Application` both appear in the synthesized `dev` template, confirmed zero `AwsSolutions` findings remain on a fresh synth of both stages, confirmed zero resource-name collisions between `dev` and `prod`'s `Data` stack templates after the `rdsSg` relocation.
