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

## 4. Blocker #2 (Resolved 2026-07-11): Both Beachhead Verticals Were Missing Core Sensing Logic

**Originally found by checking directly against `backend/ingest/rules.ts`, not assumed from the SRS's own summary of this gap.** SRS §3.1's open issue said "pool-chemistry and gas-sensor alert thresholds are placeholders pending real verified safety-standard citations" — that undersold the actual state at the time: there were no placeholder thresholds for either. `RULES_BY_CATEGORY` had exactly six categories (`pump`, `hvac`, `pool_system`, `refrigeration`, `leak_sensor`, `energy_meter`) — no `gas_sensor` category existed at all, and `pool_system` had only flow-rate and temperature rules — no pH, chlorine, or dissolved-solids metrics — despite water chemistry being one of the two things Vision Document §3 names as this platform's actual differentiator.

**Fixed, not by inventing numbers:** added a new `pool_chemistry` adapter (SRS SN-4.1) with real, cited thresholds — pH and free chlorine sourced from CDC's Model Aquatic Health Code, 5th Ed. (Dec 2024) via `WebSearch`; TDS sourced from pool-industry consensus guidance (explicitly cited as industry-standard, not CDC, since CDC publishes no TDS figure) — and a new `gas_sensor` adapter (SRS SN-5.1), a binary leak-detected signal identical in structure to the existing `leak_sensor` adapter, requiring no concentration threshold at MVP. 17 new tests added to `backend/ingest/rules.test.ts` (57 total passing, typecheck clean). This resolves SRS Open Issue #1 for both adapters — no longer placeholders.

**Superseded by a larger scope decision the same day:** a real business conversation (channel-partner sales motion — pool-service companies like Pinch-A-Penny) surfaced that pool-chemistry sensing is actually one piece of a bigger white-labeled channel-partner portal (branded partner login, technician territory management, AI-assisted daily dispatch) — which directly reverses SRS CH-3.1's standing "no self-service partner portal... shall exist at MVP." That reversal was handled as its own formal PRD/SRS amendment — **PRD v1.5 and SRS v1.5, approved 2026-07-11** — see `prd.md`/`srs.md` Revision History and `project-peaklogic-channel-partner-portal` memory for the full scope, the three locked architecture decisions (operational-dispatch-only partner access, Mapbox for territory drawing, MCP-server-plus-external-agent for AI dispatch), and the sequenced roadmap of downstream artifact amendments still needed (Domain Model, Database Schema, Security Architecture, Multi-Tenant Architecture, API Specification, User Personas/UX Wireframes) before implementation begins.

---

## 5. Remaining Work, Sequenced

| Order | Item | Why here | Blocking a demo? |
|---|---|---|---|
| 1 | §3 — AWS account, bootstrap, first real deploy | Everything downstream needs a real running system to test against | **Yes** — nothing else can be verified end-to-end without it |
| 2 | ~~§4 — Real pool-chemistry and gas-sensor rules~~ **Resolved 2026-07-11** | Both confirmed beachhead verticals' core differentiator is now built (`pool_chemistry`/`gas_sensor` adapters, CDC-cited thresholds) | Was **Yes** — now closed |
| 3 | Frontend wired to the real API | Checked directly, corrected on review: only `DeviceOnboard.tsx` imports the real API client (`frontend/src/lib/api.ts`) — the other 5 main pages (Alerts, Assets, Devices, Sites, Tickets) each define their own hardcoded mock data inline (e.g. `Alerts.tsx`'s `const MOCK_ALERTS = [...]`) rather than importing a shared mock module or the real API client. Same substance, more precise: not one shared mock data source to swap out, five separate hardcoded arrays to replace. A demo of live device data needs this | **Yes** — a mock-data demo undercuts the entire "real sensor data" pitch |
| 4 | AUTH-1 (no-login screens) + RP-2.1 (Route View) — the two standing cross-artifact decisions | Real gaps (API Specification §5/§7), but tied to Field Service Partner and Channel Partner personas, not the Tenant Admin/Operator experience a first sales demo most likely centers on. **RP-2.1 specifically is now also the foundation of the in-progress channel-partner-portal/territory/AI-dispatch amendment (§4)** — no longer purely a "defer it" judgment call, since it's now load-bearing for active, confirmed business scope | **Probably not** for an initial Tenant Admin demo — but **yes** if the demo audience is the channel partner itself, which is now an active near-term scenario, not just a possibility (§7) |
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
| §4 Sensing-logic gap | Resolved — `backend/ingest/rules.ts`'s `pool_chemistry`/`gas_sensor` adapters, PRD SN-4/SN-5, SRS §3.2 |
| §4 Channel-partner-portal amendment | PRD §5.8 (CH-3/CH-3a) + §5.10 (TR-1–TR-3), SRS §3.8 (CH-3.1/CH-3a.1) + §3.12 (TR-1.1–TR-3.2) — both v1.5, reversing the prior "no portal" scope |
| §5 item 3 Frontend wiring | Test Strategy §6, `CLAUDE.md` |
| §5 item 4 AUTH-1/RP-2.1 | API Specification §5/§7, `project-peaklogic-pending-decisions` — RP-2.1 is now also the foundation for the channel-partner-portal amendment above |
| §5 items 5–8 | Device & Command Security Architecture §3.2, Threat Model §4.1, SOC 2 Control Mapping §4, API Specification §7 |

---

## 9. Review Log

Reviewed 2026-07-11. One real imprecision found and corrected; every other claim re-verified directly.

1. **§5 item 3 said the 5 mock-data pages "import mock data."** Checked the actual source and found each page defines its own hardcoded mock array inline (e.g. `Alerts.tsx`'s `const MOCK_ALERTS = [...]`) rather than importing from any shared module. Same underlying fact (not wired to the real API) but a more useful correction than it sounds: whoever picks up this work is replacing five separate hardcoded arrays, not swapping out one shared mock data source — a real difference in scope, not just phrasing.
2. **Re-verified, held up:** the Vision Document §3 "measure the real thing... pool chemical levels (pH, chlorine, dissolved solids)" citation; PRD's "CH-1 bumped from Should to Must" language (§4); the six `RULES_BY_CATEGORY` keys and the absence of a `gas_sensor` category or any pH/chlorine metric in `pool_system`, all re-grepped directly against `rules.ts` a second time.
