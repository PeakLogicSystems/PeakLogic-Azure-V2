# Test Strategy

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1
**Depends on:** [CI/CD Pipeline](cicd-pipeline.md) (draft v0.1), [Multi-Tenant Architecture](multi-tenant-architecture.md) (approved v1), [Infrastructure as Code](infrastructure-as-code.md) (approved v1)
**Last updated:** 2026-07-11

---

## 1. Introduction

### 1.1 Purpose

`CLAUDE.md` states it plainly: "There are no test suites in this codebase." Confirmed directly (grepped for `*.test.ts`/`*.spec.ts`, checked every `package.json` for `jest`/`vitest`/`mocha`) — zero tests, zero test tooling, anywhere, before this document. Like CI/CD Pipeline (#17), this is a from-scratch design, not a reconciliation — and like that document, the real value came from actually building working examples, not just writing a strategy in prose. Three of the four real findings below were only discovered by trying to write a test and hitting a wall.

### 1.2 Scope

In scope: what gets tested at each layer of this stack (backend business logic, backend/RLS integration, CDK infrastructure), why, with working examples in each — not a target coverage percentage or an exhaustive test plan for every route. Frontend testing is explicitly addressed and explicitly deprioritized (§6), not silently ignored. CI/CD Pipeline (#17) owns *running* these tests (already wired up, §7); this document owns *what* exists and *why*.

Out of scope: a full test suite for every existing route/component — with zero coverage as the starting point, this document establishes the pattern and the highest-value first tests, not a complete backlog executed in one pass.

---

## 2. Test Pyramid for This Stack

Three real layers, weighted by where a bug is most likely and most expensive if missed, not by convention:

| Layer | What it catches | Priority |
|---|---|---|
| **Unit** (pure functions, no I/O) | Business-logic bugs — alert thresholds, safety-critical math | Highest — cheapest to write, fastest to run, and this project's own history (§3) shows this is exactly where a real bug already shipped |
| **Integration** (real Postgres) | Tenant-isolation/RLS bugs — the single most consequential bug class this project has actually shipped | Highest — see §4 for why a mock can't do this job |
| **CDK assertion** (`aws-cdk-lib/assertions`) | A deliberate architecture decision silently reverting | Medium — narrower blast radius than the above two, but cheap once the pattern exists |
| **Frontend component/E2E** | UI regressions | Deliberately deprioritized for now — §6 |

**One tool, not several: Vitest everywhere.** Backend, infra, and (when it starts) frontend all use the same test runner rather than Jest for backend + Vitest for frontend (a common but avoidable split) — one config shape, one CI dependency to reason about, and frontend already uses Vite for its build, so Vitest is a natural fit there specifically, not just a default.

---

## 3. Unit Tests: `backend/ingest/rules.ts`

### 3.1 Real gap found: the highest-value logic in the codebase wasn't testable at all

`RULES_BY_CATEGORY` (alert thresholds for pump pressure, refrigeration food-safety limits, leak detection) and the threshold-evaluation loop lived inline inside `handler.ts`'s DB-touching function, not exported. This is arguably the single most safety-critical piece of business logic in the entire product — it's *the* mechanism that decides whether a refrigeration unit trending into the FDA danger zone actually triggers an alert — and it could not be unit tested without mocking the entire `pg` Pool/Client, which would test the mock, not the real threshold math.

**Fixed:** extracted into `backend/ingest/rules.ts` — `RULES_BY_CATEGORY` and a new pure `evaluateRules(category, metrics, specs)` function, no I/O. `handler.ts` now imports and calls it, delegating only the DB reads/writes it actually needs to do. Verified behavior-preserving via `cdk synth` (bundle size moved by ~0.1kb, no errors) and `backend`'s typecheck.

### 3.2 13 real tests, verified meaningful

`rules.test.ts` covers: default vs. spec-relative thresholds, the FDA refrigeration cold-holding limit (4.4°C) and its danger-zone escalation, multiple severity tiers co-firing on a single reading (pump power can trip both `warning` and `critical` from one value), unknown categories, and metrics absent from a payload being skipped rather than misread as zero.

**Not assumed passing by construction — checked.** Deliberately broke the FDA threshold (`4.4` → `44`), re-ran the suite, confirmed exactly the 2 tests exercising that threshold failed, reverted. Same for the CDK assertion tests (§5) with the MFA decision. This is the standard this project has applied to every prior finding this session — a check that can't fail isn't a real check.

---

## 4. Integration Tests: Real Postgres, Not Mocks

### 4.1 The decision, and why it isn't a default

**Mocking `pg` for anything touching `withTenant()`/RLS would validate nothing.** A mock returns whatever the test tells it to — it cannot enforce a `CREATE POLICY ... USING (tenant_id = current_setting(...))` rule, because that enforcement lives in Postgres itself, not in application code. This isn't a hypothetical concern: the `telemetry` table shipped to production *without* RLS at all (Multi-Tenant Architecture §2.2) — a bug that a mocked test suite would have sailed past with 100% green, since the mock would have happily returned exactly the rows the test asked it to return, RLS or no RLS.

**Decision: `db.integration.test.ts` exercises the real, unmodified `withTenant()` function against a real, disposable Postgres 16** (matching `data-stack.ts`'s `PostgresEngineVersion.VER_16`) — not a reimplementation of its logic, not a mock. GitHub Actions service containers (§7), not Testcontainers — this repo has no existing Docker-in-Docker setup, and a service container is the simpler, more idiomatic fit for one ephemeral Postgres per CI job.

### 4.2 Four tests, two of them explicit regression tests

- Tenant A cannot read tenant B's telemetry by `device_id` — the exact shape of the bug Multi-Tenant Architecture §2.2 found and fixed.
- Tenant A can read its own telemetry (the positive case — a test suite that only ever asserts "access denied" would pass even if RLS blocked everyone, including legitimate access).
- A suspended tenant is rejected before the wrapped operation runs — regression test for Multi-Tenant Architecture §3.2's suspension-enforcement fix.
- An unknown tenant ID is rejected with a distinct error.

Schema setup mirrors `docs/data-model.sql`'s real `tenants`/`devices`/`telemetry` table definitions (columns, constraints, RLS policies) exactly, scoped to just these three tables — not a full migration-runner integration (`scripts/migrate.ts` is separate, its own artifact, and itself not yet run against a real database per Infrastructure as Code's standing caveat).

### 4.3 Real gap found while writing this: `db.ts` couldn't be imported outside a bundled Lambda at all

Writing this test meant importing `db.ts` directly from source for the first time ever — and it threw `ENOENT` immediately. `db.ts` loads its RDS CA bundle via `fs.readFileSync(path.join(__dirname, 'rds-global-bundle.pem'))` — a flat path that only resolves correctly *after* `api-stack.ts`'s `afterBundling` hook copies the cert to the Lambda bundle's output root. Running unbundled TypeScript (Vitest, `ts-node`, any future local script) has `__dirname` pointing at the real source directory, where the committed file actually lives one level down, at `certs/rds-global-bundle.pem`.

**Fixed:** both sides now agree on a `certs/` subdirectory — `db.ts` reads from `path.join(__dirname, 'certs', 'rds-global-bundle.pem')`, and the bundling hook copies into a matching `certs/` subfolder of the output instead of flattening it. This wasn't a one-line fix once corrected, either — getting the bundling hook itself right took two more real failures, both found by actually running `cdk synth` on this Windows machine rather than assumed correct:

1. `mkdir -p "$dir" && cp ...` isn't portable — CDK's `commandHooks` execute through the OS's *native* shell (`cmd.exe` on Windows, not Git Bash), and `cmd.exe`'s own `mkdir` doesn't understand `-p` as a flag at all.
2. A `node -e` one-liner using `JSON.stringify`'d (double-quoted) path literals then broke too — `cmd.exe` doesn't support nested double quotes the way a POSIX shell does, so the inner quotes terminated the outer `-e "..."` argument early.

Fixed with single-quoted JS string literals and forward-slash paths (Node's `fs`/`path` accept them on Windows too), avoiding the nested-quote collision entirely. Re-verified via `cdk synth`: the cert lands in `certs/` in both Lambda bundles, zero cdk-nag regressions.

### 4.4 What's verified vs. what isn't

**Verified:** the test file loads without error and skips cleanly (not an error) when `TEST_DATABASE_URL` is unset — checked directly. The unit tests (§3) and CDK assertion tests (§5) were both run for real and confirmed to catch deliberately-introduced regressions.

**Not verified: the four integration tests have never actually been run against a real Postgres.** No Docker is available in the environment this document was written in (checked: `docker --version` → command not found). The schema setup SQL was checked carefully against `docs/data-model.sql` by reading, not by running — real, if lower, risk of a typo surfacing only the first time this actually executes (in CI, via the new `postgres:16` service container in `ci.yml`, or locally via `docker-compose.test.yml`). Flagged explicitly, the same way every AWS-dependent piece of work this session has been flagged as "written, not run" — not claimed as more verified than it is.

---

## 5. CDK Assertion Tests

### 5.1 What this catches that `cdk synth` + cdk-nag don't

`infra-synth` (CI/CD Pipeline, already wired up) already gates on "does it compile" and "does it pass every accepted best-practice check" (cdk-nag). Neither catches a **deliberate decision silently reverting to a default that isn't itself a best-practice violation** — e.g., someone changes `mfa: cognito.Mfa.REQUIRED` back to `OPTIONAL`. `OPTIONAL` isn't a cdk-nag finding (it's a valid, common configuration cdk-nag doesn't flag), so nothing before this document would have caught that regression.

### 5.2 Four tests, verified meaningful the same way as §3.2

`stage-conditional-settings.test.ts`: MFA is `REQUIRED` (Security Architecture §2.2), and the four stage-conditional HA settings (Deployment Architecture §3.1) actually differ between `dev` and `prod` in the synthesized template — Multi-AZ, deletion protection, instance size, NAT gateway count. Deliberately reverted the MFA setting, confirmed the test failed, reverted back — same discipline as §3.2.

**One real authoring bug found while writing these, fixed:** reusing a single `cdk.App` across two stacks, calling `Template.fromStack()` on the first before constructing the second, throws `ConstructTreeModifiedAfterSynth` — `Template.fromStack()` synthesizes and locks the whole app's construct tree, not just the one stack being asserted on. Each stage now gets its own fresh `App` instance, the same pattern already used elsewhere in the file.

---

## 6. Frontend Testing — deliberately deprioritized, not ignored

No component or E2E tests exist for `frontend/`, and none are added in this document. Reasoning, not an oversight: the frontend currently runs entirely on mock data (`VITE_PREVIEW=true`, per `CLAUDE.md`) and isn't wired to the real API yet — testing against mock data that doesn't reflect real backend behavior has limited value, and the real backend integration work itself isn't done. Revisit once the frontend is actually wired to live endpoints; at that point, component tests for anything rendering real tenant-scoped data become genuinely valuable rather than testing fixtures against themselves.

---

## 7. CI Integration

Already implemented, not just planned — `ci.yml` gained three jobs alongside the four CI/CD Pipeline already had: `backend-unit-tests` (fast, no DB), `backend-integration-tests` (a `postgres:16` service container, `TEST_DATABASE_URL` pointed at it), `infra-tests`. All three validated as syntactically correct YAML; not run against real GitHub Actions infrastructure, for the same reason nothing else in this project has been — see CI/CD Pipeline §7 for the standing AWS-account prerequisites this still needs regardless of testing.

---

## 8. Traceability

| Section | Traces to |
|---|---|
| §3.1 rules.ts extraction | New finding — already fixed |
| §4.1–4.2 RLS integration tests | Multi-Tenant Architecture §2.2, §3.2 (the two bugs these regression-test) |
| §4.3 db.ts cert path bug | New finding — already fixed, three sequential sub-issues |
| §5.2 App-reuse bug | New finding — already fixed |
| §6 Frontend deprioritization | `CLAUDE.md` (`VITE_PREVIEW`, mock-data state) |
| §7 CI integration | CI/CD Pipeline §2.2 |

---

## 9. Open Questions

1. **The four RLS integration tests have never been run against a real Postgres** (§4.4) — the single biggest piece of unverified work in this document. First real signal comes from either a local `docker-compose.test.yml` run or the first PR that triggers `ci.yml`'s `backend-integration-tests` job.
2. **`npm install`ing `vitest` pulled in the same already-tracked esbuild/Vite dev-server vulnerability** (`GHSA-67mh-4wv8-2f99`, `CHANGELOG.md`'s `[Unreleased]` section, scheduled for v1.1.0 alongside the frontend's own Vite v5→v8 upgrade) — not a new issue, but worth bumping `vitest` to v4+ in the same pass as that upgrade, since `npm audit` confirms v4 resolves it and v2 doesn't.
3. **No coverage target is set, deliberately** — with zero tests as the starting point, a percentage target this early would be more theater than signal. Revisit once the highest-value gaps (this document's three layers) have real coverage and the next question becomes "what's still missing," not "hit a number."
4. **Frontend testing (§6) has no scheduled trigger to revisit it** — tied loosely to "frontend gets wired to the real API," which isn't a dated commitment.
5. **The `docker-compose.test.yml`/local integration-test workflow has never been run locally either** — same root cause as item 1, no Docker available in this environment.

---

## 10. Review Log

Not yet reviewed — draft v0.1.
