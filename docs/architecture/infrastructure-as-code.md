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

### 2.1 Fixed outright (5)

| Finding | Fix |
|---|---|
| L1 / IAM5 — deprecated `logRetention` | Replaced with explicit per-function `logs.LogGroup` constructs (api-stack.ts) — `logRetention` provisions a custom-resource Lambda with a wildcard IAM policy to set retention after the fact; deprecated by CDK itself |
| APIG1 — no API Gateway access logging | Added a dedicated access-log `LogGroup` + `accessLogDestination`/`accessLogFormat`, distinct from the existing execution-logging config |
| S1/S10 — S3 bucket logging/TLS | `enforceSSL: true` + a shared access-logs bucket for the frontend bucket |
| CFR3 — CloudFront access logging | Same shared access-logs bucket, via `logBucket`/`logFilePrefix` |
| VPC7 — no VPC Flow Logs | Added via `ec2.FlowLog` → a new CloudWatch Logs group |

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

### 2.3 Flagged, genuinely open (1)

**SMG4 — RDS secret has no automatic rotation scheduled.** Real, undisputed SOC 2-relevant gap. Fixing it means provisioning a rotation Lambda (`rds.DatabaseInstance#addRotationSingleUser()`) inside the VPC and testing it against a real database — a bigger lift than this pass, and blocked on the same "nothing has ever actually been deployed" constraint as everything else in Deployment Architecture §4.3. Tracked in §5, not implemented here.

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
| §2 cdk-nag adoption | New finding — 21 sub-findings, fixed/suppressed/flagged as itemized above |
| §2.1's logging additions | Security Architecture §6 (incident-response forensic sources) |
| §3 Cross-stack reference strength | New finding — already fixed |
| §4 Dependency pinning | Security Architecture code reconciliation (where `package-lock.json` was first committed) |

---

## 6. Open Questions

1. **§2.3's SMG4 (secret rotation) is a real, unresolved SOC 2-relevant gap** — needs a rotation Lambda, tested against a real database once one exists to test against (Deployment Architecture §4.3).
2. **CFR4 (CloudFront TLS version) is blocked on a real custom domain + ACM certificate** — `app.peaklogic.io` isn't actually owned/configured anywhere yet, despite being referenced as a placeholder in `auth-stack.ts`. A real domain decision, not an infra-code fix.
3. **No CDK unit/snapshot tests exist** (`infra/` has no `test/` directory at all) — `cdk-nag` catches best-practice/compliance drift on every synth now, but nothing catches a logic regression (e.g., an accidentally-removed security group rule, a wrong stage suffix) short of a human reading the diff. Flagged for Test Strategy (#18), not solved here.
4. **Lambda runtime version (L1) and Cognito Plus tier (COG8) are both suppressed as "not yet," not "never."** Worth a periodic revisit rather than treating the suppression as permanent — no specific trigger defined here beyond what's already stated per-item in §2.2.

---

## 7. Review Log

Not yet reviewed — draft v0.1.
