# MVP Roadmap

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1.0
**Depends on:** All 20 previously approved artifacts (#1–16, #18–21) *(corrected 2026-07-11 — #1–16 is 16 artifacts, #18–21 is 4, totaling 20, not 21 as an earlier draft miscounted; see §9)*; nine of them (#2 PRD, #3 SRS, #4 Domain Model, #6 User Personas, #8 UX Wireframes, #10 Database Schema, #11 API Specification, #13 Security Architecture, #14 Multi-Tenant Architecture) have since been amended past their original approval by the channel-partner-portal sequence — see §4a
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
- **A real test suite exists** where there was none (Test Strategy) — 95 tests across unit, integration, and CDK-assertion layers *(re-counted 2026-07-11: 65 backend unit + 5 infra CDK-assertion, all passing when actually run; 25 backend integration self-skip without `TEST_DATABASE_URL`, per Test Strategy §4 — see §9 Review Log)*.
- **A real CI/CD pipeline exists in code** (CI/CD Pipeline) — OIDC-federated deploy roles, four workflows — just not yet runnable (§3).
- **Real monitoring exists** where none did (SOC 2 Control Mapping §4) — 5 CloudWatch alarms per stage, an SNS topic.
- **Environment separation, secret rotation, and stage-conditional HA are all real and verified** (Deployment Architecture, Infrastructure as Code) via repeated `cdk synth` runs, not just designed on paper.
- **Compliance posture is real, not aspirational** — SOC 2 control mapping with actual evidence citations, a real incident response process, a named compliance owner.
- **The channel-partner-portal amendment sequence is fully drafted, reviewed, and approved (see §4a)** — nine architecture docs amended, real backend code shipped alongside them: a second Cognito pool (`PartnerPool`), `withChannelPartner()`/`requirePartnerRole()`, `writeAuditLog()`, 17 new `/v1/partner/*` API endpoints across 4 route handler files, real cross-tenant/territory-scoped RLS (verified via `cdk synth` and re-audited across three full passes), and `FORCE ROW LEVEL SECURITY` applied project-wide after discovering RLS had never actually been enforced against the app's own DB role. None of it has been implemented in the frontend or run against a real database yet (§4a, §5).

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

**Fixed, not by inventing numbers:** added a new `pool_chemistry` adapter (SRS SN-4.1) with real, cited thresholds — pH and free chlorine sourced from CDC's Model Aquatic Health Code, 5th Ed. (Dec 2024) via `WebSearch`; TDS sourced from pool-industry consensus guidance (explicitly cited as industry-standard, not CDC, since CDC publishes no TDS figure) — and a new `gas_sensor` adapter (SRS SN-5.1), a binary leak-detected signal identical in structure to the existing `leak_sensor` adapter, requiring no concentration threshold at MVP. 17 new tests added to `backend/ingest/rules.test.ts` (57 total passing at the time, typecheck clean — more tests have shipped alongside later work in this session since; see §2's current total). This resolves SRS Open Issue #1 for both adapters — no longer placeholders.

**Superseded by a larger scope decision the same day:** a real business conversation (channel-partner sales motion — pool-service companies like Pinch-A-Penny) surfaced that pool-chemistry sensing is actually one piece of a bigger white-labeled channel-partner portal (branded partner login, technician territory management, AI-assisted daily dispatch) — which directly reverses SRS CH-3.1's standing "no self-service partner portal... shall exist at MVP." That reversal was handled as its own formal PRD/SRS amendment — **PRD v1.5 and SRS v1.5, approved 2026-07-11.** See §4a for how that amendment sequence concluded.

---

## 4a. The Channel-Partner-Portal Amendment Sequence Is Now Fully Closed (updated 2026-07-11)

At the time §4 above was first written, six downstream artifact amendments were still queued as future work. **All six are now drafted, reviewed, and approved, same day:**

| Artifact | Result |
|---|---|
| Domain Model | v1.1 — new §2.7: `ChannelPartnerUser` (real, admin-provisioned login — the user explicitly rejected an initial no-login design), `Territory` (map-drawn boundary, PostGIS), `RouteAssignment`/`RouteStop` (a stored, confirmable snapshot) |
| Database Schema | v1.1 — 4 new tables, real cross-tenant RLS (not left as a documented gap — the user explicitly asked for the gaps to be fixed before marking it resolved), dual-scope audit logging |
| Security Architecture | v1.1 — separate `PartnerPool` Cognito pool, `withChannelPartner()`/`requirePartnerRole()`, `writeAuditLog()` implemented for the first time (previously claimed done in v1 but never actually existed) |
| Multi-Tenant Architecture | v1.1 — **the most severe finding in this project's history**: `FORCE ROW LEVEL SECURITY` had never been applied anywhere, meaning every RLS policy in the whole schema (not just the new ones) would have been silently bypassed by the app's own table-owning DB role on first real deploy. Found and fixed across three full audit passes, each catching something the previous one missed. See `project-peaklogic-overview` memory for the full account |
| API Specification | v1.1 — 17 new `/v1/partner/*` endpoints, 4 new route handler files, real code shipped and typechecked |
| User Personas + UX Wireframes | v1.2 / v1.3 — new Channel Partner Portal Dispatcher persona, 5 new wireframed screens; a real correctness bug also caught and fixed here (a persona-uniqueness review found §2.2 had been illustrated with a pool-service company, which structurally is a Channel Partner under the now-settled domain model, not a Tenant) |

**What this means for the MVP roadmap specifically: the docs-first design phase for this feature is done. Nothing about it is still "pending a decision."** What remains is real implementation — listed as its own item in §5, not folded into the resolved Blocker #2, since it's now a much larger scope than "add sensing rules":

- No MCP server exists in code anywhere — API Specification §4.6 defines the tool contract, but TR-3.1's whole AI-dispatch feature depends on a server that hasn't been built.
- `frontend/package.json` has no Mapbox dependency — the Territory Map Editor (UX Wireframes §2.12) can't be built without it.
- Branding is still hardcoded Tailwind-compiled classes + inline SVG hex literals — no theme provider exists to drive the white-label requirement (UX Wireframes §2.11) from `channel_partners.branding` dynamically.
- No partner login flow, daily-route views, or technician-management UI exist in the frontend at all — the backend (17 endpoints) has nothing to call it yet.
- `writeAuditLog()` exists but has zero call sites — not wired into credential creation or route confirmation despite being designed for exactly that.

---

## 5. Remaining Work, Sequenced

| Order | Item | Why here | Blocking a demo? |
|---|---|---|---|
| 1 | §3 — AWS account, bootstrap, first real deploy | Everything downstream needs a real running system to test against | **Yes** — nothing else can be verified end-to-end without it |
| 2 | ~~§4 — Real pool-chemistry and gas-sensor rules~~ **Resolved 2026-07-11** | Both confirmed beachhead verticals' core differentiator is now built (`pool_chemistry`/`gas_sensor` adapters, CDC-cited thresholds) | Was **Yes** — now closed |
| 3 | Frontend wired to the real API | Checked directly, corrected on review: only `DeviceOnboard.tsx` imports the real API client (`frontend/src/lib/api.ts`) — the other 5 main pages (Alerts, Assets, Devices, Sites, Tickets) each define their own hardcoded mock data inline (e.g. `Alerts.tsx`'s `const MOCK_ALERTS = [...]`) rather than importing a shared mock module or the real API client. Same substance, more precise: not one shared mock data source to swap out, five separate hardcoded arrays to replace. A demo of live device data needs this | **Yes** — a mock-data demo undercuts the entire "real sensor data" pitch |
| 4 | **Channel-partner-portal implementation** (§4a) — MCP server (doesn't exist in code at all), frontend Mapbox integration, branding theme refactor (hardcoded Tailwind/SVG → config-driven), partner login flow, territory editor, daily dispatch route UI, `writeAuditLog()` call-site wiring | The backend/data layer and every architecture doc are done and approved — this is the one item in this roadmap where design is fully finished and only implementation remains. Large scope (a second frontend auth surface, a new external dependency, an MCP server built from nothing), so sequenced after the core tenant-side demo (item 3), not before it | **Not** for an initial Tenant Admin demo — but **yes, and increasingly urgent**, if the demo audience is the channel partner itself (a real, active sales motion per `project-peaklogic-channel-partner-portal` memory, not a hypothetical) |
| 5 | AUTH-1 (no-login screens) + RP-2.1 (Route View, plain-tenant case) | Real gaps (API Specification §5/§7). **RP-2.1 is now resolved for the channel-partner-technician case** (item 4's scope, once implemented) — what remains open here is narrower: AUTH-1's opaque-token public routes (Field Service Partner ticket view, Channel Partner attribution report), and RP-2.1 for a technician employed directly by a Tenant rather than a Channel Partner (`project-peaklogic-pending-decisions` item 2) | **Probably not** for an initial Tenant Admin demo |
| 6 | Device decommission doesn't revoke IoT cert (Device & Command Security Architecture §3.2) | Real, still-open security gap, but requires an actual decommissioned device to matter — low likelihood during early demos with a handful of design-partner devices | No |
| 7 | `IngestFn` has no DLQ (Threat Model §4.1's residual finding) | Real reliability gap, low probability event | No |
| 8 | CloudWatch alarm email notifications unconfigured (SOC 2 Control Mapping §4) | Cheap to close once a real deploy exists to point `-c alarmEmail=` at | No, but cheap — bundle with item 1 |
| 9 | API Specification §7's smaller reconciliation items (camelCase/snake_case outliers in `tickets.ts`/`devices.ts`, unbounded `sites.list`/`assets.list`/`devices.list`) | Real, but cosmetic/scale issues at design-partner-tenant volume | No |

---

## 6. Explicit Non-Goals (already decided elsewhere, not relitigated here)

Actuation/command issuance (Device & Command Security Architecture §5's pre-implementation gate), MCP-*client* behavior (PeakLogic's AI layer calling out to an external MCP server — AI-4.1 forbids this specifically; note this is the opposite direction from §4a/§5 item 4's MCP *server*, which an external agent calls into — not a contradiction, see SRS's AI-4.1 clarification note), ML-trained predictive models, multi-account AWS isolation, self-service billing (PRD §8), a fully DNS-rebinding-proof SSRF guard (Threat Model §4.2's disclosed residual risk) — all Enterprise Roadmap (#23) territory or explicitly out of MVP scope already, not new decisions this document is making.

---

## 7. Open Questions

1. **§5's item ordering (item 4 before item 5, item 3 before item 4) is a recommendation, not a decision this document has authority to make** — it depends on who's actually in the room for the first demos, and how soon the channel-partner sales motion needs a working demo, both of which only the user knows.
2. ~~**§4's real thresholds need a real source**~~ **Resolved** — CDC Model Aquatic Health Code (pH/chlorine) and pool-industry consensus (TDS) citations were verified via `WebSearch` and shipped in Phase 0 (§4). The user's own active pool-chemical channel-partner relationship remains a good source for eventually refining these further, but that's a future enhancement, not a blocker to what's already shipped.
3. **No target date exists anywhere in this roadmap, deliberately** — sequencing is by dependency, not by calendar, consistent with Deployment Architecture §5's own "not a target date, tied to when engineering capacity is available" framing. This applies to §4a/§5 item 4 (channel-partner-portal implementation) too, despite it being described as "increasingly urgent" — urgency is about priority ordering, not a calendar commitment this document is making on the user's behalf.

---

## 8. Traceability

| Section | Traces to |
|---|---|
| §3 Deploy blocker | Deployment Architecture, Infrastructure as Code, CI/CD Pipeline — all repeat this same standing caveat |
| §4 Sensing-logic gap | Resolved — `backend/ingest/rules.ts`'s `pool_chemistry`/`gas_sensor` adapters, PRD SN-4/SN-5, SRS §3.2 |
| §4a Channel-partner-portal amendment sequence | PRD §5.8 (CH-3/CH-3a) + §5.10 (TR-1–TR-3), SRS §3.8 (CH-3.1/CH-3a.1) + §3.12 (TR-1.1–TR-3.2), Domain Model §2.7, Database Schema §4.4, Security Architecture §2.4, Multi-Tenant Architecture §2.5/§3.3, API Specification §4.5/§4.6, User Personas §2.7, UX Wireframes §2.11–2.15 — all approved 2026-07-11, reversing the prior "no portal" scope |
| §5 item 3 Frontend wiring | Test Strategy §6, `CLAUDE.md` |
| §5 item 4 Channel-partner-portal implementation | §4a above; `project-peaklogic-channel-partner-portal` memory's "Explicitly not started... step 7" |
| §5 item 5 AUTH-1/RP-2.1 (remaining scope) | API Specification §5/§7, `project-peaklogic-pending-decisions` items 1 and 2 |
| §5 items 6–9 | Device & Command Security Architecture §3.2, Threat Model §4.1, SOC 2 Control Mapping §4, API Specification §7 |

---

## 9. Review Log

**v0.1, reviewed 2026-07-11.** One real imprecision found and corrected; every other claim re-verified directly.

1. **§5 item 3 said the 5 mock-data pages "import mock data."** Checked the actual source and found each page defines its own hardcoded mock array inline (e.g. `Alerts.tsx`'s `const MOCK_ALERTS = [...]`) rather than importing from any shared module. Same underlying fact (not wired to the real API) but a more useful correction than it sounds: whoever picks up this work is replacing five separate hardcoded arrays, not swapping out one shared mock data source — a real difference in scope, not just phrasing.
2. **Re-verified, held up:** the Vision Document §3 "measure the real thing... pool chemical levels (pH, chlorine, dissolved solids)" citation; PRD's "CH-1 bumped from Should to Must" language (§4); the six `RULES_BY_CATEGORY` keys and the absence of a `gas_sensor` category or any pH/chlorine metric in `pool_system`, all re-grepped directly against `rules.ts` a second time.

**v0.2, reviewed 2026-07-11 — updated after the channel-partner-portal amendment sequence (§4a) closed.** Every new claim checked directly rather than assumed from memory of writing the underlying docs:

1. **`writeAuditLog()` "has zero call sites" (§4a, §5 item 4)** — grepped all of `backend/` for the symbol; it appears only in its own definition (`backend/shared/audit.ts`) and its own test file (`audit.test.ts`), confirmed nowhere else, including the new partner route handlers it was designed alongside.
2. **"No MCP server exists in code anywhere" (§4a, §5 item 4)** — searched the whole repo (excluding `node_modules`/`.git`) for any filename containing "mcp"; zero results.
3. **"`frontend/package.json` has no Mapbox dependency" (§4a)** — checked the file directly; no match for `mapbox` in any casing.
4. **The nine-artifact amended list (header, §4a)** — cross-checked against `docs/architecture/README.md`'s live status table rather than reconstructed from memory: PRD v1.5, SRS v1.5, Domain Model v1.1, User Personas v1.2, UX Wireframes v1.3, Database Schema v1.1, API Specification v1.1, Security Architecture v1.1, Multi-Tenant Architecture v1.1 — all nine confirmed Approved at those exact version numbers.
5. **AI-4.1's non-conflict framing (§6)** — re-read the actual SRS text (§3.7 area) rather than trusting this document's own earlier paraphrase; confirmed SRS already states the directionality distinction explicitly, cited precisely rather than re-explained differently.

**v0.2, requested review pass, 2026-07-11 — a genuine independent review, not a re-read.** Ran the actual test suites and re-derived the "17 endpoints" figure from the deployed contract rather than trusting either document's prose. Found two real, previously-uncaught problems, both fixed at the source rather than patched only in this document:

6. **§2's "48+ tests" and §4's "57 total passing" were both stale.** Ran `npx vitest run` (backend) and found 65 unit tests passing, plus a separate integration config (`vitest.integration.config.ts`) with 25 tests that self-skip without `TEST_DATABASE_URL` (Test Strategy §4's documented, expected behavior) — plus `npx vitest run` in `infra/` found 5 more CDK-assertion tests, all passing. Real current total: **95 tests, 70 of which actually execute (and pass) in this environment.** §2 and §4 corrected in place rather than left to quietly understate the real number.
7. **API Specification §3's "14 new endpoints" was wrong, and tracing why it was wrong surfaced a second, more consequential bug.** Recounting API Specification §3's own table gives 17, not 14 — a simple arithmetic miscount. But cross-checking that count against the actual deployed contract (`cdk synth`'s JSON output, not the CDK source read by eye) found a genuinely separate problem: `infra/lib/api-stack.ts`'s `addPartnerCrud()` helper had wired a real `DELETE /v1/partner/routes/{routeId}` method — Cognito-authenticated, bound to the Lambda — that `partner-router.ts` had no handler for at all, and that API Specification §4.5's own text says shouldn't exist (a confirmed route is immutable by design). Not a security hole (it would only ever 404), but a genuine infra/application-code mismatch — 18 methods deployed, 17 actually functional. **Fixed at the source**, not documented as a gap: added an opt-out flag to `addPartnerCrud()`, excluded `DELETE` for the `routes` resource, re-ran `cdk synth` and confirmed exactly 17 non-`OPTIONS` `/v1/partner/*` methods now exist. API Specification §3/§8/Revision History corrected to 17 and the fix disclosed there directly, since that's where the miscount originated; this document's own "14" references (§4a, §5 item 4) updated to match.
8. **This document's own header undercounted the number of previously-approved artifacts by one.** "#1–16, #18–21" is 16 + 4 = 20 artifacts, not the 21 the header claimed — simple addition, not re-derived from anything external. Corrected.

**Approved v1.0, 2026-07-11** — user-approved after the requested review pass above found and fixed two real bugs (one documentation, one live infra) rather than rubber-stamping the draft. Bumped out of the `v0.x` draft-numbering phase (mirroring this project's own SemVer convention: pre-1.0 is draft/beta, 1.0 is the first real release) into `v1.0` on approval, the same convention CI/CD Pipeline (#17) will follow whenever it clears its own AWS-account blocker.
