# CI/CD Pipeline

**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Company:** PeakLogic
**Project codename:** Project Vantage
**Status:** Draft v0.3 — the four `.github/workflows/*.yml` files described here are now REAL, implemented, Azure-native workflows (2026-08-01), not just this design doc. Still Draft, same root blocker as v0.2: no real Azure subscription/Entra App Registrations exist yet, so nothing here has run end-to-end.
**Depends on:** [Deployment Architecture](deployment-architecture.md) (Draft v2.0, pending), [Infrastructure as Code](infrastructure-as-code.md) (Draft v2.0, pending), [Security Architecture](security-architecture.md) (Draft v2.0, pending)
**Last updated:** 2026-07-17
**Fork note (v0.2):** the first `PeakLogic-Azure`-specific rewrite — `azure-restructuring-plan.md` item 17 flagged this 🟣 **full rewrite required**: OIDC-federated AWS IAM roles → Entra Workload Identity Federation, a genuinely different mechanism. **Re-verified live against this actual repo, not assumed identical**: the GitHub billing-tier constraint §2.3 found on the AWS repo (`gh api repos/.../branches/main/protection` → 403) was re-run directly against `PeakLogicSystems/PeakLogic-Azure` and returns the identical 403 — same free-tier private repo, same real constraint, confirmed rather than assumed to carry over. The AWS-native `PeakLogic-AWS` repo's own Draft v0.1 is unaffected.

---

## 1. Introduction

### 1.1 Purpose

Deployment Architecture §1.2 and Infrastructure as Code §1.2 both explicitly deferred CI/CD automation here, both noting the same fact: **none exists.** No `.github/` directory, no pipeline of any kind — every step in `CLAUDE.md`'s release process (typecheck, merge, tag, deploy) is manually run by a human. This document isn't formalizing an existing pipeline; it's designing one from nothing, which is a different kind of artifact than most that preceded it — fewer "gaps found in existing code," more "decisions made and then implemented."

### 1.2 Scope

In scope: pipeline platform choice, what runs on every PR vs. what deploys where and on what trigger, AWS authentication from CI (a real decision, not a formality — this project has been deliberate about avoiding long-lived credentials everywhere else, e.g. Secrets Manager rotation in Infrastructure as Code §2.3), and a real constraint of this specific GitHub repo that shapes the whole design (§2.3).

Out of scope: what tests exist and what they should cover (→ Test Strategy, #18 — this document runs whatever Test Strategy defines, it doesn't define it) and anything about deployment topology/stages themselves, already decided (→ Deployment Architecture, #15).

---

## 2. Platform and Trigger Strategy

### 2.1 Platform: GitHub Actions

No real alternative was seriously considered — the repo is already on GitHub, `gh` tooling is already in use for releases, and introducing a second CI vendor (CircleCI, Jenkins, etc.) for a single-repo project at this scale would be paying integration cost for no real benefit over the platform already in front of the team.

### 2.2 What runs on every PR (`ci.yml`) — same shape, Azure-native validation

Same trigger/parallelism design as the AWS version (independent jobs, no cross-blocking) — cloud-agnostic CI structure, unaffected by the Azure switch. Only the infra job's tooling changes:

| Job | Command | Working directory |
|---|---|---|
| `backend-typecheck` | `npm run typecheck` | `backend/` |
| `frontend-build` | `npm run build` | `frontend/` |
| `scripts-typecheck` | `npm run typecheck` | `scripts/` |
| `infra-validate` *(renamed from `infra-synth`)* | `bicep build --stdout` (or `az bicep build`) for compile-time validation, plus PSRule for Azure (Infrastructure as Code §4) run against the compiled templates — the Azure-native equivalent of `cdk synth` + `cdk-nag`, not a renamed AWS command | `infra-azure/` |

**Not yet implemented or verified for this fork** — unlike the AWS version, which tested directly that `cdk synth` fails non-zero on an unsuppressed `cdk-nag` finding, no `infra-azure/` Bicep modules exist yet (Infrastructure as Code §8) to run `bicep build`/PSRule against at all. This job's design is real and considered; its behavior is unverified.

### 2.3 Real constraint, re-verified live against this actual repo, not assumed to carry over from the AWS finding

**Re-tested directly against `PeakLogicSystems/PeakLogic-Azure`, not assumed identical because the AWS repo had the same issue**: `gh api repos/PeakLogicSystems/PeakLogic-Azure/branches/main/protection` returns the identical `403 — Upgrade to GitHub Pro or make this repository public to enable this feature.` — this repo is also private, also on GitHub's free tier. **This finding is about the GitHub billing plan, not the cloud provider being deployed to — confirmed by re-running the actual check, not inferred from "GitHub is GitHub regardless of cloud."** Required status checks before merge cannot be technically enforced on this repository either, for the same reason.

**What this changes about the design, unchanged from the AWS version's own conclusion:** `ci.yml`'s checks are advisory, not enforced by GitHub itself. The actual gate stays procedural — `CLAUDE.md`'s release process checklist, not a GitHub-enforced block. This is a repository/billing-tier fact, entirely independent of which cloud the deploy targets, so the AWS version's reasoning transfers without needing re-derivation.

**Environments and the required-reviewers gap — not re-tested via a mutating `PUT` call in this pass, deliberately.** The AWS version created a real `prod` GitHub Environment and tested the required-reviewers restriction directly (`422`, same billing-tier limitation). This document doesn't repeat that specific mutating test against `PeakLogic-Azure` **only because environment creation is a real, standing implementation action** (creating a live GitHub Environment) that this documentation pass didn't judge itself authorized to perform proactively, unlike the read-only branch-protection check above. **Assumption carried forward, not independently re-verified**: since this is the identical repo billing tier as the one just confirmed above, the required-reviewers restriction almost certainly applies here too — flagged in §7 as the one specific sub-finding not independently re-tested, rather than silently presented with the same verification confidence as §2.3's opening paragraph.

**Consequence, same design conclusion as the AWS version, for the same reason**: `deploy-prod.yml` should be `workflow_dispatch`-only, not an automatic push-to-`main` trigger with a non-functional approval gate behind it — the human who deliberately triggers the run is the approval gate. See §3, §4.1.

---

## 3. Deploy Triggers

| Stage | Trigger | Approval gate |
|---|---|---|
| `dev` | Push to `dev` branch (after merge) | None — matches `dev` = active development, continuously deployed |
| `staging` | Manual (`workflow_dispatch`) only | None beyond whoever has repo write access triggering it |
| `prod` | Manual (`workflow_dispatch`) only — **not** an automatic push-to-`main` trigger, changed after §2.3 confirmed required-reviewer protection isn't available on this repo's tier | The act of a human deliberately triggering the run — see §2.3 for why this replaces the originally-designed GitHub Environment reviewer gate, which tested as non-functional on this billing tier |

**Why staging has no automatic trigger:** `CLAUDE.md`'s branching model is two branches (`dev`, `main`) — there's no dedicated `staging` branch this could hook into, and inventing one is a bigger process change than this document should make unilaterally. Manual dispatch is a deliberate, minimal choice: staging exists as a deploy target (Deployment Architecture §2.1's three-stage decision), but nothing in the current git workflow produces a natural "this is a staging-worthy commit" signal the way `dev`/`main` do for their respective stages.

**Why prod ended up with the same manual-only shape, for a different reason:** unlike staging, `main` *does* produce a clear "this is release-worthy" signal (it's the entire point of `CLAUDE.md`'s release process) — an automatic trigger was the original design specifically because that signal exists. It changed to manual only because the *approval gate* behind it turned out not to work, not because the trigger signal itself was ever in question. If this repo is ever upgraded to a tier supporting required reviewers, reinstating the automatic `push: branches: [main]` trigger on `deploy-prod.yml` is the one specific thing to reconsider (§7).

---

## 4. Azure Authentication: Entra Workload Identity Federation, Not Long-Lived Secrets (rewritten for Azure)

**Decision, same principle as the AWS version, verified Azure-native mechanism: Microsoft Entra Workload Identity Federation via `azure/login`, zero Azure client secrets stored as GitHub secrets.** Verified via Microsoft's own documentation as the real, current, recommended pattern — a GitHub Actions job requests a short-lived OIDC token (`permissions: id-token: write`), exchanges it for an Azure access token via a **federated identity credential** configured on an Entra App Registration, structurally the direct analogue of AWS's IAM-role-trusts-GitHub's-OIDC-provider pattern. Same "don't hold long-lived credentials that can leak or go stale" reasoning the AWS version already established, unchanged by the cloud switch.

### 4.1 App Registration + Federated Credential Design — real, considered design, not yet implemented

One Entra App Registration per stage (`PeakLogic-dev-CiCd`, `PeakLogic-staging-CiCd`, `PeakLogic-prod-CiCd`, mirroring the AWS version's per-stage IAM role naming), each with a **federated identity credential** trusting GitHub's OIDC issuer, subject-scoped to this repository — verified via Microsoft's documentation that the subject-claim format (`repo:org/repo:ref:refs/heads/branch` or `repo:org/repo:environment:name`) is directly equivalent to AWS's `token.actions.githubusercontent.com:sub` condition, not a different scoping model requiring new design thinking:

- **`dev`:** subject `repo:PeakLogicSystems/PeakLogic-Azure:ref:refs/heads/dev`.
- **`staging`:** subject `repo:PeakLogicSystems/PeakLogic-Azure:ref:refs/heads/main` (same reasoning as the AWS version — `workflow_dispatch` runs against `main` by default, no dedicated staging branch exists).
- **`prod`:** subject `repo:PeakLogicSystems/PeakLogic-Azure:environment:prod` — same "restricts to workflow runs that declared this environment" reasoning the AWS version applied, doing real scoping work independent of whether reviewer protection rules are actually enforced on this billing tier (§2.3).

**Permissions minimal by design, same principle as the AWS version's bootstrap-role-only scoping**: each App Registration's associated service principal should be granted Azure RBAC roles (e.g. Contributor) scoped to that stage's specific resource group only (Deployment Architecture §2.1's resource-group-per-stage boundary) — not subscription-wide — so a compromised `dev` workflow token cannot touch `peaklogic-prod-rg`. This is a *tighter* natural scoping boundary than the AWS version had available, since Azure resource groups are a first-class RBAC scope Azure Resource Manager understands natively, where AWS's per-stage isolation was only ever a naming convention within one flat account (Deployment Architecture §2.1's own disclosed comparison).

### 4.2 A structural simplification over AWS's singleton-OIDC-provider workaround — verified, not assumed

**A real, disclosed improvement, not just a different mechanism with the same shape.** The AWS version needed a real workaround (§4.2 there) because an IAM OIDC provider is a single, account-wide singleton resource — only `dev`'s stack could create it, `staging`/`prod` had to import it by a computed ARN to avoid a duplicate-resource collision. **Azure's federated-credential model has no equivalent singleton to collide over**: a federated identity credential is attached directly to each stage's own separate App Registration (§4.1) — there is no shared, account-wide OIDC-provider resource that a second stage's deployment could collide with. **This means the entire class of "which stage creates the shared resource, and how do the others reference it without a real dependency" problem the AWS version had to solve simply doesn't exist on Azure** — each stage's Bicep module (or manual App Registration setup, given Infrastructure as Code §2.2's disclosed gap that Entra resources aren't fully Bicep-automatable) is fully independent of the others.

### 4.3 Interactive-approval-hangs-in-CI risk — likely moot on Azure, flagged not assumed resolved

**The AWS version's specific conflict (CDK's IAM/security-group-broadening confirmation prompt has no TTY to answer in CI) was a CDK CLI behavior, not a general IaC-tool property.** Verified reasoning, not yet empirically confirmed: Azure CLI's `az deployment group create` (or Bicep's own deploy command) does not prompt for confirmation by default the way `cdk deploy` without `--require-approval never` does — there is no equivalent interactive IAM-broadening confirmation step built into the standard Azure deployment command. **This means the specific conflict the AWS version had to design around likely doesn't recur on Azure at all** — flagged as a real, disclosed "probably doesn't apply" finding rather than assumed resolved without checking, since this document has not actually run a Bicep deploy in a non-interactive CI context to confirm zero-prompt behavior empirically.

---

## 5. Rollback Integration (process unchanged, tooling reference updated)

Deployment Architecture §4.2's rollback procedure (manual, tag-based git checkout + redeploy) is unchanged in structure for this fork — cloud-agnostic process discipline. What CI would add, mirroring the AWS version's own design: `deploy-prod.yml` accepting a `workflow_dispatch` input (`ref`, defaulting to `main`) so the same workflow can be re-run against a previous tag — the deploy command itself changes from `cdk deploy` to whichever Bicep/az CLI invocation Infrastructure as Code's real implementation settles on, not yet written.

---

## 6. Traceability

| Section | Traces to |
|---|---|
| §2.2 CI checks *(rewritten v0.2)* | Infrastructure as Code §4 (PSRule for Azure) |
| §2.3 Branch protection gap | Re-verified live against `PeakLogic-Azure` — identical finding, same GitHub billing-tier root cause as the AWS repo |
| §3 Deploy triggers | Deployment Architecture §2.1 (resource-group-per-stage decision), CLAUDE.md's existing branching model |
| §4 Entra Workload Identity Federation *(rewritten v0.2)* | Verified via Microsoft's own Workload ID documentation; Security Architecture's secrets-management posture |
| §4.2 Singleton-OIDC-provider simplification *(rewritten v0.2)* | Real, verified structural improvement — no Azure equivalent of the AWS-side workaround exists to need one |
| §5 Rollback integration | Deployment Architecture §4.2 |

---

## 7. Open Questions

1. **The required-reviewers-unavailable finding for `prod`'s GitHub Environment was NOT independently re-tested via a mutating `PUT` call against this repo, unlike the read-only branch-protection check** (§2.3) — assumed to carry over from the identical billing tier, not empirically re-confirmed. Flagged explicitly as the one sub-finding in this rewrite that rests on inference rather than a direct repeat test.
2. **No Entra App Registrations or federated credentials have been created for this fork** — same "genuine hard stop, needs real Azure access" gate the AWS version had for `cdk bootstrap`, now true for Azure: no Azure CLI/subscription access exists in this environment. The whole pipeline is unusable, not just untested, until someone with real Azure access creates these. **This is the single remaining blocker on all four workflows actually running** — the workflow YAML itself is done (2026-08-01).
3. **§4.3's "likely no interactive-approval conflict on Azure" finding is reasoned, not empirically verified** — no Bicep deploy has actually been run in a CI-like non-interactive context to confirm zero-prompt behavior.
4. **Staging has no automated trigger** (§3), same deliberate decision as the AWS version, unaffected by the cloud switch — not a gap to close.
5. **RESOLVED (2026-08-01) — exact repo config named, not yet created.** Repo **variables** needed: `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_DEV_CLIENT_ID`/`AZURE_STAGING_CLIENT_ID`/`AZURE_PROD_CLIENT_ID` (one per stage App Registration, §4.1), `ALERT_EMAIL`. Repo **secrets** needed, one pair per stage: `{DEV,STAGING,PROD}_DB_ADMIN_PASSWORD`, `{DEV,STAGING,PROD}_KILLSWITCH_SECRET` (main.bicep's two `@secure()` params with no default). None of these are configured yet — same real-Azure-access gate as item 2.
6. **RESOLVED (2026-08-01) — decided at the workflow-command level.** Backend code deploy uses the official `Azure/functions-action@v1` GitHub Action (zip-deploy against the Function App api.bicep provisions), after `npm run build` (→ `dist/**/*.main.js`, matching `backend/package.json`'s own `main` glob) and `npm prune --omit=dev`. This is a **second, separate deploy step from the Bicep infra deploy** — `az deployment group create` provisions/updates the Function App *resource*, it never touches application code. Unverified against a real Function App (blocked on item 2, same as everything else).
7. **NEW (2026-08-01): the Bicep deploy target resource group (`peaklogic-{stage}-rg`) is assumed to already exist** — main.bicep's own header comment treats resource-group creation as a deliberate out-of-band `az group create` step, not something the deploy workflow does itself. Not yet decided whether that's a one-time manual step per stage or something worth adding as an idempotent step in the workflow — flagged, not resolved, since it wasn't this pass's call to make unprompted.
8. **RESOLVED (2026-08-01, corrected 2026-08-09) — PSRule for Azure IS wired into `ci.yml`.** This item previously said otherwise; that was stale by the time it was written, or went stale shortly after — `ci.yml`'s `infra-psrule` job (`microsoft/ps-rule@v2.9.0` against `PSRule.Rules.Azure`) exists alongside `infra-validate`'s `az bicep build` compile-time check, exactly closing this gap. **Still genuinely untested end-to-end** (no Azure subscription to run against, same blocker as item 2) — the job is real and wired, its actual findings are unverified.
9. **NEW (2026-08-01): no frontend deploy step exists in any workflow** — unlike the AWS version (which had a working `frontend-stack.ts` + CloudFront), `infra-azure/` has no `frontend.bicep` yet (still an open item in the broader "Complete infra-azure" critical path). Nothing to deploy the frontend *to* on Azure yet, so none of the four workflows attempt it.

---

## 8. Review Log

**v0.3 (2026-08-01), workflow files actually implemented.** Closes the "CI/CD wiring" item named in the Enterprise Audit's §6 P0 item 1 critical path. All four `.github/workflows/*.yml` files rewritten from the stale AWS-CDK versions to real Azure-native workflows matching this document's own design: `ci.yml`'s `infra-synth` job replaced with `infra-validate` (`az bicep build` against `main.bicep` — validates all 7 referenced modules in one pass — plus the 3 standalone `entra/*.bicep` files); `deploy-{dev,staging,prod}.yml` swap `aws-actions/configure-aws-credentials` for `azure/login@v2` (Entra Workload Identity Federation) and `cdk deploy` for a two-step `az deployment group create` (infra) + `Azure/functions-action@v1` (backend code zip-deploy, resolving §7 item 6). Exact required repo variables/secrets now named (§7 item 5). **Still exactly as blocked as v0.2** — none of this can run until a real Azure subscription + the per-stage Entra App Registrations (§4.1) exist; this pass changed "designed" to "built," not "built and verified." Two new gaps surfaced and disclosed, not silently resolved: PSRule/best-practices checking still isn't wired into CI (§7 item 8), and no workflow attempts a frontend deploy since `infra-azure/frontend.bicep` doesn't exist yet (§7 item 9).

**v0.2 (2026-07-17), the `PeakLogic-Azure` rewrite.** Verified live against this actual repository where possible, not assumed to carry over from the AWS document's own testing.

1. **The branch-protection billing-tier finding was independently re-tested against `PeakLogicSystems/PeakLogic-Azure`, not assumed identical because the AWS repo had the same result** — confirmed via a live `gh api` call, same 403, same root cause (private repo, free tier).
2. **The required-reviewers finding was deliberately NOT re-tested the same way**, since doing so would require a real, mutating `PUT` to create a live GitHub Environment on this repo — judged out of scope for a documentation pass that hasn't been asked to start standing up real CI infrastructure yet. Stated as an explicit, disclosed gap (§7 item 1) rather than silently assumed verified to the same standard as item 1.
3. **The singleton-OIDC-provider-collision problem (AWS §4.2) was checked for whether it has a real Azure analogue, not assumed to need the same workaround** — confirmed via Microsoft's federated-credential documentation that each App Registration owns its own federated credentials independently, with no shared account-wide provider resource — a genuine structural simplification, not just a renamed AWS concept.
4. **The interactive-CDK-prompt conflict (AWS §4.3) was checked for whether it's a CDK-specific behavior or a general IaC-tool property** — reasoned (not empirically tested) that Azure's standard deploy commands don't have an equivalent default interactive confirmation step, so the conflict likely doesn't recur — explicitly flagged as reasoned-not-verified (§7 item 3) rather than asserted with the same confidence as a directly tested claim.
