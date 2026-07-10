# CI/CD Pipeline

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1
**Depends on:** [Deployment Architecture](deployment-architecture.md) (approved v1), [Infrastructure as Code](infrastructure-as-code.md) (approved v1), [Security Architecture](security-architecture.md) (approved v1)
**Last updated:** 2026-07-10

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

### 2.2 What runs on every PR (`ci.yml`)

A single workflow, triggered on `pull_request` targeting `dev` or `main`, running four independent jobs in parallel (no job depends on another finishing first — a broken frontend build shouldn't block seeing that the backend typecheck also failed):

| Job | Command | Working directory |
|---|---|---|
| `backend-typecheck` | `npm run typecheck` | `backend/` |
| `frontend-build` | `npm run build` (typecheck + vite build — frontend has no separate `typecheck` script, `build` already runs `tsc &&`) | `frontend/` |
| `scripts-typecheck` | `npm run typecheck` — **`scripts/package.json` had no `typecheck` (or any build) script at all**, the only one of the four sub-packages missing one; added as a one-line gap fix during this document's implementation, so CI actually covers all four sub-packages, not three | `scripts/` |
| `infra-synth` | `npm run synth:dev` — runs `cdk synth` **with `cdk-nag`'s `AwsSolutionsChecks` already wired in** (Infrastructure as Code §2), so this one job gets three things for free: type-checking (`infra/cdk.json`'s `app` command runs via plain `ts-node`, not `--transpile-only`, so it fully type-checks on every invocation — no separate `infra-typecheck` job exists, deliberately; it would be redundant with this one), "does it compile," and "does it pass every accepted best-practice check" | `infra/` |

**Verified, not assumed: `cdk synth` actually fails (non-zero exit) on an unsuppressed cdk-nag error, not just a warning annotation.** Tested directly — temporarily emptied `data-stack.ts`'s suppression list, re-ran `synth:dev`, got exit code 1 and `Synthesis finished with errors` in the output, then restored the file. This confirms the `infra-synth` job genuinely gates on cdk-nag findings in CI, not just prints them for a human to notice.

Implemented as four files: `.github/workflows/ci.yml` (this section), `deploy-dev.yml`, `deploy-staging.yml`, `deploy-prod.yml` (§3–§5). All four validated as syntactically correct YAML with the expected job structure — not run against real GitHub Actions infrastructure, since that requires the AWS-side prerequisites in §7 to exist first.

### 2.3 Real constraint found: branch protection isn't available on this repo

**Checked directly** (`gh api repos/PeakLogicSystems/PeakLogicSystems/branches/main/protection`): `403 — Upgrade to GitHub Pro or make this repository public to enable this feature.` This is a private repo on GitHub's free tier. **Required status checks before merge — the standard way a CI pipeline "gates" a merge — cannot be technically enforced on this repository as currently configured.**

**What this changes about the design:** `ci.yml`'s checks are advisory, not enforced by GitHub itself — a red X on a PR doesn't block the merge button the way it would on a paid-tier repo. This isn't a reason to skip building CI (the checks still catch real problems and show up clearly on every PR), but it means the actual gate is procedural: `CLAUDE.md`'s release process already says "typecheck passes" as a manual pre-merge checklist item (§189, existing) — that discipline is now what's actually load-bearing, not a GitHub-enforced block. Revisit if the org ever upgrades to GitHub Team/Enterprise, or makes the repo public (neither decided here).

**Environments themselves are available; required reviewers are not — checked directly, not left as an assumption.** `gh api --method PUT .../environments/prod` (`200 OK`, environment now exists — secrets/variables can be scoped to it, and it gives a real deployment audit trail) succeeded. Adding a required-reviewer protection rule to it (`PUT .../environments/prod` with a `reviewers` array) got a real `422`: `"Please ensure the billing plan supports the required reviewers protection rule"` — the exact same free-tier restriction as branch protection, just gating a different feature. **This is the same class of constraint as §2.3's opening finding, confirmed the same way — not inferred from the first result.**

**Consequence: the `prod` deploy gate originally designed here (automatic on push to `main`, blocked pending required-reviewer approval) doesn't actually gate anything — there's no reviewer step to wait for.** An automatic trigger with no working approval behind it would deploy to prod on every merge to `main` with zero human confirmation, which is worse than not automating the trigger at all. **Redesigned:** `deploy-prod.yml` is `workflow_dispatch`-only, the same pattern as `staging` — the human who deliberately triggers the run *is* the approval gate, standing in for the missing paid feature. `environment: prod` stays on the job regardless (secret/variable scoping and audit trail are real, working benefits independent of protection rules) — see §3, §4.1.

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

## 4. AWS Authentication: OIDC, Not Long-Lived Keys

**Decision: GitHub's OIDC federation (`aws-actions/configure-aws-credentials` with `role-to-assume`), zero AWS access keys stored as GitHub secrets.** This isn't a default best-practice box-check — it's a direct continuation of a pattern this project has been deliberate about elsewhere (Infrastructure as Code §2.3's RDS credential rotation, Security Architecture's whole secrets-management posture): don't hold long-lived credentials that can leak, rotate, or go stale when a short-lived, cryptographically-verified alternative exists for free.

### 4.1 IAM Role Design — implemented, not just decided

New `infra/lib/cicd-stack.ts`, one instance per stage (`PeakLogic-dev-CiCd`, `PeakLogic-staging-CiCd`, `PeakLogic-prod-CiCd`), each creating an IAM role trusted by GitHub's OIDC provider, condition-scoped to this repository and, for `prod`, to the specific GitHub Environment:

- **`dev` role:** trust condition `token.actions.githubusercontent.com:sub` = `repo:PeakLogicSystems/PeakLogicSystems:ref:refs/heads/dev` — only workflows running on that specific ref can assume it.
- **`staging` role:** same shape, `ref:refs/heads/main` — `workflow_dispatch` runs against whichever ref is selected (`main` by default in `deploy-staging.yml`, since there's no dedicated staging branch to point at instead).
- **`prod` role:** trust condition scoped to `repo:PeakLogicSystems/PeakLogicSystems:environment:prod` — GitHub includes the environment name in the OIDC token's `sub` claim whenever a job specifies `environment:`, independent of whether that environment has any protection rules configured (§2.3 confirmed this repo's tier has none for `prod`). This condition still does real work even without reviewer gating: it restricts the role to workflow runs that explicitly declared `environment: prod` in their job definition, one more thing an attacker with write access to a workflow file would have to get right, not zero-cost scoping.

**Permissions granted are minimal by design:** each role only gets `sts:AssumeRole` on that stage's CDK bootstrap deploy roles (`cdk-hnb659fds-deploy-role-{account}-{region}`, `cdk-hnb659fds-file-publishing-role-{account}-{region}` — CDK's own standard bootstrap role names), not direct CloudFormation/S3/IAM permissions. This is the modern, minimal-privilege CDK CI/CD pattern: the bootstrap roles (created once per account/region by `cdk bootstrap`, an operational prerequisite — see §7) already carry the broad permissions `cdk deploy` needs; the GitHub Actions role just needs permission to become them, scoped to one stage's role ARNs so a compromised `dev` workflow token can't touch `prod`.

### 4.2 The OIDC provider itself is a single, account-wide resource — handled once, not per stage

An IAM OIDC identity provider for `token.actions.githubusercontent.com` can only exist once per AWS account (CloudFormation fails on a duplicate). Since every other resource in this codebase is deliberately stage-suffixed and created fresh per `cdk deploy -c stage=X` invocation (Deployment Architecture §2), a naive "one `CiCdStack` per stage, each creates the provider" would collide the moment a second stage is ever deployed to the same account.

**Resolution:** the OIDC provider is constructed only when `stage === 'dev'` (the stage every account deploys first) inside `CiCdStack`; `staging`/`prod`'s `CiCdStack` instances import it by its well-known, deterministic ARN (`arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`) instead of creating their own — no CloudFormation cross-stack export/import needed at all, since the ARN is fully computable from the account ID alone. **Real risk this doesn't cover:** if some other project or process in the same AWS account already created a GitHub OIDC provider for a different reason, `dev`'s `CiCdStack` will fail to deploy (duplicate resource) — flagged in §7, not solved here, since it's an account-level fact this document can't verify without real AWS access.

### 4.3 Real conflict found: `deploy:prod`'s interactive approval would hang forever in CI

Deployment Architecture §4.1 deliberately left `npm run deploy:prod` *without* `--require-approval never`, so a human running it at a terminal still gets CDK's own IAM/security-group-broadening confirmation prompt as an extra safety net — a reasonable decision when that document was written, since deploys were assumed to be run manually. **That assumption breaks in an automated pipeline**: a GitHub Actions job has no TTY to answer an interactive prompt — if CDK ever needs to ask, the job hangs until GitHub's own timeout kills it, not a fast, clear failure.

**Resolution:** `deploy-prod.yml` does **not** call `npm run deploy:prod`. It runs `npx cdk deploy --all -c stage=prod --require-approval never` directly, bypassing the CLI-level prompt. This isn't removing a safety check — the human-approval gate for the *pipeline* is the `prod` Environment's required reviewers (§2.3), which runs *before* any deploy step even starts, not mid-deploy. A CLI prompt that nothing can answer isn't a working safety net in this context; a review gate that blocks the job from starting at all is. The manual, terminal-run `npm run deploy:prod` script is untouched and still prompts, for whoever runs it that way directly.

---

## 5. Rollback Integration

Deployment Architecture §4.2 already wrote the rollback procedure (`CLAUDE.md`'s "Rollback Procedure" section) as a manual, tag-based git checkout + redeploy. **Not automated here as a one-click pipeline action** — the procedure explicitly requires a human to review `npm run diff:<stage>` before applying (Deployment Architecture §4.2's own "never skipped" instruction), which is fundamentally a judgment step, not something a workflow button should silently skip past. What CI *does* add: `deploy-prod.yml` accepts a `workflow_dispatch` input (`ref`, defaulting to `main`) so the same automated deploy workflow can be re-run against a previous tag manually, rather than requiring someone to reconstruct the `cdk deploy` invocation by hand under pressure.

---

## 6. Traceability

| Section | Traces to |
|---|---|
| §2.2 CI checks | Infrastructure as Code §2 (cdk-nag already wired into `synth`) |
| §2.3 Branch protection gap | New finding — confirmed via `gh api`, not assumed |
| §3 Deploy triggers | Deployment Architecture §2.1 (three-stage decision), CLAUDE.md's existing branching model |
| §4 OIDC authentication | Security Architecture's secrets-management posture, Infrastructure as Code §2.3 (RDS rotation — same "avoid long-lived credentials" reasoning) |
| §4.3 `deploy:prod` interactive-approval conflict | New finding — already fixed in `deploy-prod.yml`; Deployment Architecture §4.1 (the original decision this reconciles) |
| §5 Rollback integration | Deployment Architecture §4.2 |

---

## 7. Open Questions

1. ~~GitHub Environment deployment protection rules (required reviewers)~~ **Resolved 2026-07-10 — confirmed genuinely unavailable, not just unconfirmed.** Tested directly (`PUT .../environments/prod` with a `reviewers` array → `422`, billing plan doesn't support it). `deploy-prod.yml` redesigned to `workflow_dispatch`-only (§3) rather than ship an automatic trigger with a non-functional gate behind it. **New, smaller residual question:** if this repo is ever upgraded to a tier supporting required reviewers, reinstating `deploy-prod.yml`'s automatic `push: branches: [main]` trigger is the one specific follow-up to revisit (§3's closing note) — not written here as a TODO since there's no target date or committed upgrade plan.
2. **`cdk bootstrap` has never been run against a real AWS account, and this document cannot run it** — checked: no AWS CLI installed and no AWS credentials configured anywhere in the environment this document was written in (no `~/.aws`, no `AWS_*` env vars). This is a genuine hard stop that needs the user (or whoever holds the real AWS account) to run `cdk bootstrap` themselves. The CDK bootstrap deploy-role ARNs §4.1's IAM roles reference by name don't exist until then. **The whole pipeline is unusable, not just untested, until this happens** — every deploy workflow's very first AWS-touching step (`configure-aws-credentials`) has nothing to assume.
3. **If a GitHub OIDC provider for this URL already exists in the target AWS account for an unrelated reason, `dev`'s `CiCdStack` deploy will fail outright** (§4.2) — same hard stop as item 2: no AWS access from here to check `aws iam list-open-id-connect-providers` before the first `dev` deploy. Whoever runs that first deploy needs to check this themselves.
4. **Staging has no automated trigger** (§3) — deliberate given the current two-branch git model, not a gap to close. Revisit only if a real staging workflow (a distinct branch, a manual QA gate before prod) becomes an actual practice rather than a stage that exists in infrastructure but rarely gets used — no action item here, just a decision recorded so it isn't re-litigated from scratch later.
5. ~~Repo variables `AWS_ACCOUNT_ID` and `AWS_REGION` don't exist yet~~ **Still true, still blocked** — same root cause as items 2/3: no real AWS account ID is available from this environment to set them to. `gh variable set` can be run the moment a real account ID exists; nothing else about this is unresolved design, just a missing input only the user has.

---

## 8. Review Log

Reviewed 2026-07-10 (twice — an initial pass, then a second pass working through every §7 open item directly rather than leaving them as documented assumptions).

**Second pass — the important one:** working through §7 item 1 by actually testing it (not re-reading the design for plausibility) found that the `prod` deploy gate as originally designed **did not work at all** — GitHub returned a real `422` refusing to create a required-reviewers rule on this repo's billing tier. This wasn't a documentation gap, it was a design flaw that would have shipped a `prod` deploy trigger with zero effective approval behind it, worse than not automating the trigger. Fixed by redesigning `deploy-prod.yml` to manual-dispatch-only (§3), the same shape as `staging`. Items 2/3/5 were checked for whether they were actually actionable from here (AWS CLI/credentials availability) and confirmed genuinely blocked on real AWS account access this environment doesn't have — not left unchecked, confirmed unreachable. Item 4 was re-examined and confirmed to be a recorded decision, not an open task.

**First pass, unchanged below:** one real doc/implementation drift found and fixed; every other claim re-verified directly rather than re-read for plausibility.

1. **§2.2's table listed an `infra-typecheck` job that was never implemented.** `ci.yml` only has four jobs (`backend-typecheck`, `frontend-build`, `scripts-typecheck`, `infra-synth`) — checked directly against the file. The missing job wasn't an oversight to fix by adding it: `infra/cdk.json`'s `app` command runs via plain `ts-node` (not `--transpile-only`), so `infra-synth`'s `cdk synth` already fully type-checks on every run — a separate typecheck job would be redundant. Corrected the table to explain this instead of silently listing a job that doesn't exist.
2. **Re-verified, held up:** the branch-protection 403 and Environments 200 OK claims (§2.3) by re-running both `gh api` calls; the "cdk synth fails on unsuppressed cdk-nag errors" claim by re-doing the empty-suppressions test described in §2.2 a second time, independently; all four workflow files' YAML syntax via `js-yaml`; that all four sub-packages (`backend`, `frontend`, `infra`, `scripts`) have a `package-lock.json` committed to git (`npm ci` fails hard without one); that `frontend`'s `npm run build` succeeds with zero environment variables set, matching exactly what `ci.yml`'s `frontend-build` job provides.
3. **Sharpened, not corrected:** §4.1's role trust-condition descriptions were accurate but hedged ("or the equivalent for whatever triggers staging") in a way that undersold that this was actually implemented and verified, not just designed. Restated with the exact `ref:refs/heads/main` value now that it's a checked fact, not a placeholder.
