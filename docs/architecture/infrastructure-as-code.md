# Infrastructure as Code

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v2.0 — full rewrite for Azure (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1 — AWS-native — until v2.0 is approved)
**Depends on:** [Deployment Architecture](deployment-architecture.md) (Draft v2.0, pending), [Security Architecture](security-architecture.md) (Draft v2.0, pending)
**Last updated:** 2026-07-17
**Fork note (v2.0):** the first `PeakLogic-Azure`-specific rewrite — `azure-restructuring-plan.md` item 16 flagged this 🟣 **full rewrite required**: AWS CDK v2 has no Azure equivalent, and the real Bicep-vs-Terraform decision (`azure-restructuring-plan.md` §4) is made here, for the first time, with real research. See §2 and §8 Review Log. The AWS-native `PeakLogic-AWS` repo's own CDK codebase and this document's Approved v1 are unaffected.

---

## 1. Introduction

### 1.1 Purpose

Deployment Architecture §1.2 explicitly deferred "the CDK code organization/module structure itself" here rather than covering it as part of environment/topology strategy. This document's job is the CDK codebase's own quality, correctness, and best-practice posture — not what gets deployed where (that's decided), but whether the code that deploys it is actually sound.

### 1.2 Scope

In scope, unchanged from the AWS version's scope statement: the IaC tool choice itself (§2, new for this rewrite — the AWS version never had to make this decision, since CDK was inherited as a given), the module/file structure (§3), automated best-practice/compliance checking (§4), and dependency version-pinning policy (§6). Out of scope, unchanged: CI/CD automation (→ CI/CD Pipeline, #17), and IaC unit/snapshot testing (→ Test Strategy, #18).

---

## 2. IaC Tool Decision: Bicep, not Terraform *(new — the real evaluation `azure-restructuring-plan.md` §4 flagged as open)*

**This is the one decision the AWS version of this document never had to make** — CDK was already the established tool before Security Architecture-era governance began. For this fork, the choice is real and was evaluated with current (2026-07-17) research, not defaulted to whichever tool is more familiar.

### 2.1 The real tradeoffs, verified via current comparisons, not assumed from older Bicep-vs-Terraform conventional wisdom

| Dimension | Bicep | Terraform |
|---|---|---|
| State management | **Stateless** — Azure Resource Manager itself tracks deployment history; no state file to store, lock, corrupt, or leak secrets into | Explicit state file — powerful (drift detection, targeted operations) but a real operational burden (remote state backend, locking, sensitive-value handling) |
| New Azure resource coverage | **Day-zero** — Bicep compiles to ARM templates, Microsoft's own native deployment format, so new Azure services are usable immediately | The `azurerm` provider has documented lag (sometimes weeks) for brand-new services |
| Cost | No separate state-backend cost | A hosted/remote state backend is a real added cost line item |
| Ecosystem breadth / multi-cloud | Azure-only by design | Broader ecosystem, genuine multi-cloud support (irrelevant here — this track is Azure-committed, not multi-cloud) |
| Entra ID/External ID resource support | Real gaps for identity resources specifically (see §2.2) | Also real gaps for the same resources (see §2.2) — not a Bicep-specific weakness |

### 2.2 A real, disclosed limitation that applies to *both* tools equally — verified, not discovered as a Bicep-specific gap after committing

**Neither Bicep nor Terraform can fully automate Microsoft Entra External ID (CIAM) tenant provisioning** — verified via a live, still-open GitHub issue on HashiCorp's own `terraform-provider-azuread` repository requesting exactly this support, and via documentation confirming Bicep needs a separate, non-IaC HTTP-request-based flow for the same category of resource. **This means the two Entra External ID tenants Security Architecture §2.0 designed (`PeakLogicCustomers`, `PeakLogicPartners`) cannot be created by either tool's normal declarative flow** — tenant creation itself is a manual/portal or custom-script action regardless of which IaC tool wins this decision. **This finding shaped, but did not decide, the tool choice**: since neither tool solves this, it's not a differentiator — disclosed here so it isn't discovered mid-implementation as a surprise, and so App Role definitions/assignments *within* an already-existing tenant (which both tools *can* automate, once the tenant itself exists) aren't confused with tenant creation itself.

### 2.3 Decision: Bicep

**Given PeakLogic's own established engineering posture — cost-conscious (TD-43's plaintext-credential-to-avoid-NAT-Gateway-cost trade-off, single-AWS-account-over-multi-account, `db.t3.micro` at MVP scale), single-cloud (this track is Azure-committed, not multi-cloud), and small-team (no dedicated platform/DevOps function to operate a remote Terraform state backend)** — Bicep is the better fit: no state-backend cost or operational surface to maintain, day-zero coverage of new Azure services (relevant given this platform will lean on newer IoT Hub/DPS and Entra External ID capabilities), and Azure-native tooling parity with how CDK synthesizes to CloudFormation (Microsoft's own equivalent native deployment mechanism, ARM). **This mirrors the same proportionality reasoning that chose CDK+TypeScript over more portable alternatives on the AWS side** — optimize for this specific team and this specific cloud commitment, not for hypothetical future flexibility. Terraform's genuinely stronger multi-cloud story and broader community-module ecosystem are real advantages this project doesn't currently need, the same "don't build for hypothetical requirements" discipline CLAUDE.md's own engineering principles already state.

---

## 3. Module Structure (new — mirrors CDK's stack structure, Bicep-native)

Mirrors `infra/`'s existing CDK stack breakdown (`bin/peaklogic.ts` → `Network → Data → Auth → Api → IoT, Frontend`) as closely as Bicep's own module system allows, in a new `infra-azure/` directory (kept separate from the AWS-native `infra/`, both retained per this repo's fork-preserves-everything discipline):

| CDK stack (AWS reference) | Bicep module (`infra-azure/modules/`) | Notes |
|---|---|---|
| `bin/peaklogic.ts` (app entry, stage context) | `main.bicep` | Orchestrator; requires an explicit `stage` parameter with **no default** — Bicep parameters support this natively (`@allowed(['dev','staging','prod']) param stage string`, no default value), mirroring CDK's own "missing flag fails synth" discipline exactly |
| `network-stack.ts` | `network.bicep` | VNet, subnets, NSGs — Deployment Architecture §2's resource-group-per-stage boundary is expressed via `main.bicep`'s target resource group, not this module itself |
| `data-stack.ts` | `data.bicep` | Azure Database for PostgreSQL Flexible Server, Key Vault (Security Architecture §4.3) |
| `auth-stack.ts` | *(no direct Bicep equivalent — see §2.2)* | Entra tenant/App Role provisioning is manual/scripted, not Bicep-managed; app-registration-level config that *can* be automated is a candidate for a future `auth.bicep`, not built in this pass |
| `api-stack.ts` | `api.bicep` | Compute (Azure Functions, pending a final confirmation this is the right compute choice — Device & Command Security Architecture and Security Architecture both wrote "mechanism TBD" pending this document) |
| `iot-stack.ts` | `iot.bicep` | IoT Hub + DPS (Device & Command Security Architecture §2) |
| `frontend-stack.ts` | `frontend.bicep` | Static hosting + CDN (Deployment Architecture §5) |
| `budget-stack.ts` | `budget.bicep` | Azure Cost Management budget + action group (§7 open item — Azure's real equivalent to AWS Budget Actions needs its own verification pass, not assumed identical) |

**Confirmed here, not left open**: compute is **Azure Functions**, resolving the "mechanism TBD" placeholder every other Azure-track document has been carrying. Rationale: closest structural analogue to the existing Lambda-per-function model (`peaklogic-api`, `peaklogic-ingest`) this codebase's application logic already assumes, and Multi-Tenant Architecture §2.1a already verified Azure Functions' warm-instance connection-pooling behavior is safe under this project's `SET LOCAL` pattern — re-deriving that verification against a different Azure compute service would be wasted work.

---

## 4. Automated Compliance Checking: PSRule for Azure (rewritten — real, verified cdk-nag equivalent)

**Verified via Microsoft's own PSRule for Azure documentation, not assumed to have a direct Azure analogue**: PSRule for Azure is a real, current, actively maintained tool — 500+ pre-built rules validating Bicep/ARM templates offline (pre-deployment) against the Azure Well-Architected Framework, the direct structural analogue of `cdk-nag`'s `AwsSolutionsChecks` (a rule engine checking IaC against a cloud-native best-practices framework, runnable in CI before any real deployment). **Decision: adopt PSRule for Azure the same way the AWS version adopted `cdk-nag`** — wired into every Bicep build/validate pass, not left as optional manual review.

**Not yet run against real Bicep code** — unlike the AWS version's 21 real, itemized findings (each fixed or suppressed with a written reason), this fork has no Bicep modules written yet to run PSRule against. This section states the tool decision and adoption principle; the actual findings-and-fixes pass happens once §3's modules are written (tracked in this project's implementation follow-up, not this document).

---

## 5. Cross-Module References and Deployment Scoping (rewritten — Bicep's structurally different model, not a direct §3 AWS-version port)

**A real, disclosed structural difference, not a gap**: the AWS version's §3 fixed an implicit cross-stack-reference-strength CDK setting — Bicep has no direct equivalent concept, since Bicep modules don't have CloudFormation-style cross-stack exports/imports with a strength setting at all; a Bicep module's outputs are consumed directly by its caller within the same deployment, resolved at deployment time, not via a separate stack-export mechanism. **This means the specific finding the AWS version fixed cannot recur on Bicep by construction** — flagged here as a genuine "different enough that the old finding doesn't translate," not silently dropped without explanation.

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

## 6. Dependency/Tooling Version Pinning (rewritten — Bicep's different mechanism)

**A real, disclosed structural difference from the AWS version's npm-lockfile-based answer**: Bicep has no package-manager-style dependency tree the way a CDK/npm project does — a `.bicep` file's only real "dependency" is the Bicep CLI/compiler version itself (which determines available language features and the ARM API versions it knows how to target) and the explicit `apiVersion` pinned on each resource declaration. **Decision, mirroring the AWS version's own "make the implicit pin explicit" principle**: pin the Bicep CLI version in a `bicepconfig.json` at the `infra-azure/` root, and require every resource declaration to specify an explicit `apiVersion` rather than relying on whatever the compiler defaults to — the direct analogue of `package-lock.json` making version drift impossible by accident. **Not yet created** — this is a design decision, not yet implemented, since no `infra-azure/` modules exist yet.

---

## 7. Traceability

| Section | Traces to |
|---|---|
| §2 IaC Tool Decision *(new v2.0)* | `azure-restructuring-plan.md` §4 (real open decision); verified via current Bicep-vs-Terraform comparisons and HashiCorp's own `azuread` provider GitHub issue tracker |
| §3 Module Structure *(new v2.0)* | Mirrors `infra/`'s existing CDK stack breakdown; confirms Azure Functions as compute, resolving every other Azure-track document's "mechanism TBD" |
| §4 PSRule for Azure adoption *(rewritten v2.0)* | Verified via Microsoft's own PSRule for Azure documentation as the real cdk-nag equivalent |
| §5 Cross-module references *(rewritten v2.0)* | Real, disclosed structural difference — Bicep has no direct equivalent of the AWS version's finding |
| §6 Tooling version pinning *(rewritten v2.0)* | Mirrors the AWS version's "make the implicit pin explicit" principle, different mechanism |

---

## 8. Open Questions

1. **No Bicep modules exist yet** — §3's module structure is a plan, not shipped code. PSRule for Azure (§4) has nothing to run against yet.
2. **Azure's real equivalent to AWS Budget Actions (the cost kill switch, `infra/lib/budget-stack.ts` on the AWS side) needs its own verification pass, not assumed identical.** Azure Cost Management supports budgets and action-group-triggered alerts, but whether it can automatically *stop* a specific resource (the AWS version's "stop the RDS instance at 100%" capability) the same way, or only alert, is a real open question flagged here, not resolved — a materially important gap given how much this project's AWS-side cost discipline (TD-43, the whole `budget-stack.ts` effort) depended on that specific automatic-stop capability existing.
3. **The Entra External ID tenant-creation gap (§2.2) means whoever implements `main.bicep` needs a documented manual/scripted prerequisite step** (creating `PeakLogicCustomers`/`PeakLogicPartners` before any Bicep deployment can reference them) — not yet written up as an operational runbook, flagged for whoever picks up implementation.
4. **The Azure Functions compute decision (§3) has not been verified via a real deployment or even a real Bicep synth** — chosen based on the strongest available reasoning (matches existing Lambda-per-function application logic, already-verified connection-pooling safety) but not load-tested or cost-compared against alternatives (Azure Container Apps, App Service) the way a dedicated compute-evaluation pass might do.
5. **No `bicepconfig.json` or `infra-azure/` directory exists yet** — §6's version-pinning design is not implemented.

---

## Revision History

**v2.0 (2026-07-17)** — the first `PeakLogic-Azure`-specific rewrite, forced by `azure-restructuring-plan.md` item 16.

- **§2 added**: the real Bicep-vs-Terraform evaluation, resolving `azure-restructuring-plan.md` §4's open decision. Verified via current comparisons (state management, day-zero Azure coverage, cost) and a real, disclosed finding that applies to *both* tools equally — neither can fully automate Entra External ID tenant creation (confirmed via a live, open HashiCorp GitHub issue, not assumed). **Decision: Bicep**, for the same cost-conscious, single-cloud, small-team proportionality reasoning that has driven every other tooling choice in this project's history.
- **§3 added**: a Bicep module structure mirroring the AWS version's CDK stack breakdown as closely as Bicep's own module system allows, in a new `infra-azure/` directory kept separate from `infra/`. **Resolves a real, standing "mechanism TBD" placeholder every other Azure-track document has carried**: compute is Azure Functions, chosen because Multi-Tenant Architecture §2.1a already verified its connection-pooling safety and it matches the existing Lambda-per-function application logic most directly.
- **§4 rewritten**: PSRule for Azure adopted as the verified, real cdk-nag equivalent — same adoption principle (wired into every build, not manual-only review), no findings yet since no Bicep code exists to run it against.
- **§5 rewritten, not silently dropped**: the AWS version's cross-stack-reference-strength finding has no Bicep equivalent by construction (Bicep modules don't have the CloudFormation-style export/import mechanism that finding was about) — stated explicitly as a structural difference, not omitted without explanation.
- **§6 rewritten**: Bicep's dependency/version-pinning story (CLI version + explicit `apiVersion` per resource) replaces npm/`package-lock.json`, same "make the implicit pin explicit" principle.
- **Honestly scoped throughout**: no Bicep code has been written yet for this fork (§8 items 1, 5) — this document makes real, considered decisions (tool choice, module structure, compute service) but does not yet ship or verify infrastructure code, unlike the AWS version's own extensively fixed-and-verified `cdk-nag` findings.
- **Downstream artifacts requiring their own amendments/follow-up as a result** (tracked in `azure-restructuring-plan.md` §2): CI/CD Pipeline (#17, needs to know Bicep is the deployment mechanism); real `infra-azure/` implementation work (this project's implementation-phase tracking, not a further architecture-doc amendment).
