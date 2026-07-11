# MVP Roadmap

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1
**Depends on:** All 21 previously approved artifacts (#1–16, #18–21)
**Last updated:** 2026-07-11

---

## 1. Introduction

### 1.1 Purpose

Twenty-one artifacts in, this is the first document whose job is synthesis, not new analysis: pull together every "not yet implemented," "flagged not fixed," and "open item" scattered across the whole `docs/architecture/` tree into one sequenced path to an actual demo-able MVP — tied to the two confirmed, active beachhead verticals (PRD §8): pool servicing and QSR/gas-station-convenience.

### 1.2 Scope

In scope: an honest inventory of what's actually done vs. outstanding, sequenced by real dependency (not just artifact number), with the two most consequential findings this document surfaced flagged prominently (§4). Out of scope: Enterprise Roadmap territory (#23) — actuation, MCP-client behavior, multi-account AWS, ML-trained predictive models — all already explicitly deferred past MVP by PRD/SRS and not relitigated here.

---

## 2. What's Already Done

More than a first read of "21 docs, mostly Draft/Approved paperwork" would suggest — a large amount of *real, shipped, verified* work happened alongside the documentation itself this session:

- **Every real security/tenant-isolation bug found has been fixed**, not just documented: the telemetry table's missing RLS (Multi-Tenant Architecture), the fail-open role default and missing tenant-suspension check (Multi-Tenant Architecture), the ticket-webhook SSRF and telemetry-value validation gap (Threat Model) — all fixed, all with real regression tests.
- **A real test suite exists** where there was none (Test Strategy) — 48+ tests across unit, integration, and CDK-assertion layers.
- **A real CI/CD pipeline exists in code** (CI/CD Pipeline) — OIDC-federated deploy roles, four workflows — just not yet runnable (§3).
- **Real monitoring exists** where none did (SOC 2 Control Mapping §4) — 5 CloudWatch alarms per stage, an SNS topic.
- **Environment separation, secret rotation, and stage-conditional HA are all real and verified** (Deployment Architecture, Infrastructure as Code) via repeated `cdk synth` runs, not just designed on paper.
- **Compliance posture is real, not aspirational** — SOC 2 control mapping with actual evidence citations, a real incident response process, a named compliance owner.

---

## 3. Blocker #1: Nothing Has Ever Been Deployed

The single fact repeated across more prior artifacts than anything else in this project: no AWS account exists yet (confirmed directly with the user, 2026-07-10), so `cdk bootstrap` has never run, no stack has ever been deployed, and CI/CD Pipeline's four workflows are inert. **Every other item in this roadmap that involves "verify against a real system" is downstream of this one blocker.** Sequencing:

1. Create the AWS account (user action, outside this project's scope to do for them).
2. `cdk bootstrap` the account/region once (Infrastructure as Code §7, CI/CD Pipeline §7 — an operational prerequisite, not a code change).
3. Set the `AWS_ACCOUNT_ID` GitHub repo variable (CI/CD Pipeline §7 item 5).
4. First `dev`-stage deploy — the actual first real-world test of everything built this session. Recommend doing this manually (`npm run deploy:dev`) before trusting the CI/CD pipeline's own `deploy-dev.yml` with it, so a first-deploy problem is debugged directly, not through a second layer of pipeline abstraction.
5. Only after a working `dev` deploy: exercise the CI/CD pipeline itself, confirm the rollback procedure (Deployment Architecture §4.2) actually works, confirm GitHub Environment behavior for `prod` (CI/CD Pipeline §7 item 1).

---

## 4. Blocker #2 (New Finding): Both Beachhead Verticals Are Missing Core Sensing Logic

**Checked directly against `backend/ingest/rules.ts`, not assumed from the SRS's own summary of this gap.** SRS §3.1's open issue says "pool-chemistry and gas-sensor alert thresholds are placeholders pending real verified safety-standard citations" — that undersells the actual state. There are no placeholder thresholds for either. `RULES_BY_CATEGORY` has exactly six categories (`pump`, `hvac`, `pool_system`, `refrigeration`, `leak_sensor`, `energy_meter`) — **no `gas_sensor` category exists at all**, and **`pool_system` has only flow-rate and temperature rules — no pH, chlorine, or dissolved-solids metrics**, despite water chemistry being one of the two things Vision Document §3 names as this platform's actual differentiator ("measure the real thing... pool chemical levels... instead of a service company's periodic manual test strip").

**Why this matters more than a generic backlog item:** these are the two *confirmed, active* beachhead verticals (PRD §8) — pool servicing has a real, active channel-partner relationship with a pool-chemical supplier (Domain Model, CH-1 bumped to Must specifically because of this) — and neither vertical's core sensing differentiator is actually built. A demo to either prospect today would be missing the specific thing that makes this platform different from a generic temperature/flow monitor.

**Deliberately not fixed here, and not by inventing numbers:** real safety thresholds (safe pH/chlorine ranges, gas-detection limits) need real, verified sourcing — CDC/state health-department pool-chemistry standards, NFPA/OSHA gas-detection thresholds — the same category of "needs real domain authority, not an invented placeholder" caution this project has applied consistently (patent claims, HIPAA/SOC 2 legal conclusions). **This is the highest-priority, most concrete open item in this entire roadmap** — recommend sourcing real thresholds (via whatever channel-partner or industry-standard reference is available) before either vertical's demo, not after.

---

## 5. Remaining Work, Sequenced

| Order | Item | Why here | Blocking a demo? |
|---|---|---|---|
| 1 | §3 — AWS account, bootstrap, first real deploy | Everything downstream needs a real running system to test against | **Yes** — nothing else can be verified end-to-end without it |
| 2 | §4 — Real pool-chemistry and gas-sensor rules | Both confirmed beachhead verticals' core differentiator is unbuilt | **Yes**, for whichever vertical is demoed first |
| 3 | Frontend wired to the real API | Checked directly, corrected on review: only `DeviceOnboard.tsx` imports the real API client (`frontend/src/lib/api.ts`) — the other 5 main pages (Alerts, Assets, Devices, Sites, Tickets) each define their own hardcoded mock data inline (e.g. `Alerts.tsx`'s `const MOCK_ALERTS = [...]`) rather than importing a shared mock module or the real API client. Same substance, more precise: not one shared mock data source to swap out, five separate hardcoded arrays to replace. A demo of live device data needs this | **Yes** — a mock-data demo undercuts the entire "real sensor data" pitch |
| 4 | AUTH-1 (no-login screens) + RP-2.1 (Route View) — the two standing cross-artifact decisions | Real gaps (API Specification §5/§7), but tied to Field Service Partner and Channel Partner personas, not the Tenant Admin/Operator experience a first sales demo most likely centers on | **Probably not** for an initial demo — recommend deferring past the first prospect meetings unless the demo audience specifically includes a design-partner's field technician or the channel partner itself, a judgment call only the user can make (§7) |
| 5 | Device decommission doesn't revoke IoT cert (Device & Command Security Architecture §3.2) | Real, still-open security gap, but requires an actual decommissioned device to matter — low likelihood during early demos with a handful of design-partner devices | No |
| 6 | `IngestFn` has no DLQ (Threat Model §4.1's residual finding) | Real reliability gap, low probability event | No |
| 7 | CloudWatch alarm email notifications unconfigured (SOC 2 Control Mapping §4) | Cheap to close once a real deploy exists to point `-c alarmEmail=` at | No, but cheap — bundle with item 1 |
| 8 | API Specification §7's smaller reconciliation items (camelCase/snake_case outliers in `tickets.ts`/`devices.ts`, unbounded `sites.list`/`assets.list`/`devices.list`) | Real, but cosmetic/scale issues at design-partner-tenant volume | No |

---

## 6. Explicit Non-Goals (already decided elsewhere, not relitigated here)

Actuation/command issuance (Device & Command Security Architecture §5's pre-implementation gate), MCP-client behavior, ML-trained predictive models, multi-account AWS isolation, self-service billing (PRD §8), a fully DNS-rebinding-proof SSRF guard (Threat Model §4.2's disclosed residual risk) — all Enterprise Roadmap (#23) territory or explicitly out of MVP scope already, not new decisions this document is making.

---

## 7. Open Questions

1. **§5 item 4 (AUTH-1/RP-2.1 deferral) is a recommendation, not a decision this document has authority to make** — it depends on who's actually in the room for the first demos, which only the user knows.
2. **§4's real thresholds need a real source** — the user's active pool-chemical channel-partner relationship is the most obvious place to start (they presumably already know safe operating ranges), separate from a generic industry-standard citation.
3. **No target date exists anywhere in this roadmap, deliberately** — sequencing is by dependency, not by calendar, consistent with Deployment Architecture §5's own "not a target date, tied to when engineering capacity is available" framing.

---

## 8. Traceability

| Section | Traces to |
|---|---|
| §3 Deploy blocker | Deployment Architecture, Infrastructure as Code, CI/CD Pipeline — all repeat this same standing caveat |
| §4 Sensing-logic gap | New finding — Vision Document §3, PRD §8, SRS §3.1 (undersold as "placeholder," corrected here) |
| §5 item 3 Frontend wiring | Test Strategy §6, `CLAUDE.md` |
| §5 item 4 AUTH-1/RP-2.1 | API Specification §5/§7, `project-peaklogic-pending-decisions` |
| §5 items 5–8 | Device & Command Security Architecture §3.2, Threat Model §4.1, SOC 2 Control Mapping §4, API Specification §7 |

---

## 9. Review Log

Reviewed 2026-07-11. One real imprecision found and corrected; every other claim re-verified directly.

1. **§5 item 3 said the 5 mock-data pages "import mock data."** Checked the actual source and found each page defines its own hardcoded mock array inline (e.g. `Alerts.tsx`'s `const MOCK_ALERTS = [...]`) rather than importing from any shared module. Same underlying fact (not wired to the real API) but a more useful correction than it sounds: whoever picks up this work is replacing five separate hardcoded arrays, not swapping out one shared mock data source — a real difference in scope, not just phrasing.
2. **Re-verified, held up:** the Vision Document §3 "measure the real thing... pool chemical levels (pH, chlorine, dissolved solids)" citation; PRD's "CH-1 bumped from Should to Must" language (§4); the six `RULES_BY_CATEGORY` keys and the absence of a `gas_sensor` category or any pH/chlorine metric in `pool_system`, all re-grepped directly against `rules.ts` a second time.
