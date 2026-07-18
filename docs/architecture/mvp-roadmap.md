# MVP Roadmap

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v2.0 — full resequencing for Azure (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1.0 — AWS-native — until v2.0 is approved)
**Depends on:** Every Azure-track document amended/rewritten as part of this fork's 2026-07-17 restructuring pass (`azure-restructuring-plan.md` §2) — PRD v1.7, SRS v1.7, Domain Model v1.4, Compliance & Certification Roadmap v1.1, User Stories v1.1, UX Wireframes v1.4, Information Architecture v1.1, Database Schema v1.4, API Specification v1.4, Device & Command Security Architecture v2.0, Security Architecture v2.0, Multi-Tenant Architecture v1.4, Deployment Architecture v2.0, Infrastructure as Code v2.0, CI/CD Pipeline v0.2, Threat Model v1.1, SOC 2 Control Mapping v1.1
**Last updated:** 2026-07-17
**Fork note (v2.0):** the first `PeakLogic-Azure`-specific rewrite — `azure-restructuring-plan.md` item 22 flagged this 🟣 **full rewrite required**: "needs full resequencing once the Azure infra path and new features are scoped." Both are now scoped (this session's work) — this document does the resequencing. The AWS-native `PeakLogic-AWS` repo's own Approved v1.0 describes that platform's real, shipped, verified state and is unaffected.

---

## 1. Introduction

### 1.1 Purpose

Twenty-one artifacts in, this is the first document whose job is synthesis, not new analysis: pull together every "not yet implemented," "flagged not fixed," and "open item" scattered across the whole `docs/architecture/` tree into one sequenced path to an actual demo-able MVP — tied to the two confirmed, active beachhead verticals (PRD §8): pool servicing and QSR/gas-station-convenience.

### 1.2 Scope

In scope: an honest inventory of what's actually done vs. outstanding, sequenced by real dependency (not just artifact number), with the two most consequential findings this document surfaced flagged prominently (§4). Out of scope: Enterprise Roadmap territory (#23) — actuation, MCP-client behavior, multi-account AWS, ML-trained predictive models — all already explicitly deferred past MVP by PRD/SRS and not relitigated here.

---

## 2. What's Already Done (rewritten for this fork — a genuinely different state than the AWS version's §2)

**The shape of "done" is inverted relative to the AWS-native repo, and that inversion is the single most important fact this rewrite needs to state plainly.** On the AWS side, the architecture docs mostly *reconciled* an already-substantial, already-shipped v1.0.0 codebase — real code came first, docs caught up to and fixed it. On this fork, **every architecture decision is real and considered, but almost no Azure-native code exists yet** — this session did the full architecture-first pass (all 27 artifacts touched, `azure-restructuring-plan.md` §2) from a standing start, not a reconciliation.

**What is genuinely done, verified via real research throughout, not assumed:**
- Every product-level document (PRD → API Specification) amended to fold in the Azure-pivot feature backlog (geospatial site map, first-pass 3D facility rendering) — real requirements, real wireframes, real endpoint contracts, cross-consistent with each other.
- Every infrastructure-facing document redesigned for Azure with real, current-documentation-verified mechanisms: Azure IoT Hub + DPS individual X.509 enrollment (replacing AWS IoT Core), Direct Methods for the future command channel (a genuine simplification over AWS's hand-built ack-topic design), two separate Microsoft Entra External ID tenants plus PeakLogic's own real Entra ID workforce tenant for staff (replacing three Cognito pools — the staff case a genuine architectural improvement, not just a swap), Azure Database for PostgreSQL Flexible Server (RLS/`SET LOCAL` pattern confirmed portable, PostGIS confirmed supported with a real allowlist caveat), Azure Key Vault, resource-group-per-stage environment separation (a deliberate, disclosed deviation from Microsoft's own subscription-per-environment recommendation, mirroring the AWS version's own account-separation trade-off), **Bicep** chosen over Terraform with real, researched justification, PSRule for Azure as the `cdk-nag` equivalent, and Entra Workload Identity Federation for CI/CD (structurally simpler than AWS's OIDC-provider-singleton workaround).
- Every compliance/security document's evidence sources corrected to their real Azure equivalents (Azure Activity Log/Monitor/Entra logs, Azure Monitor Alerts, Microsoft's own HIPAA BAA posture confirmed at parity with AWS's).
- **Real, disclosed limitations found and documented, not glossed over**: neither Bicep nor Terraform can fully automate Entra External ID tenant creation (a manual/scripted prerequisite either way); Azure Functions has no native DLQ support for IoT Hub/Event Hub triggers (a bigger gap than the AWS version's equivalent finding); the exact Azure Database for PostgreSQL SKU and Azure Functions plan remain undecided pending real implementation.

**What is NOT done, stated as plainly as what is**: no `infra-azure/` Bicep modules exist. No Entra tenants have been provisioned. No backend code has been ported to Azure SDKs (Entra token validation, Azure Postgres connection strings, IoT Hub device SDK, Key Vault secret retrieval). The frontend is exactly as mock-data-only as the AWS baseline it forked from — unaffected by the cloud switch, not newly broken by it. The channel-partner-portal and Administration Console features are exactly as fully-designed-but-unimplemented as they were on the AWS side at the fork point — inherited status, not re-litigated or re-verified for this session.

More than a first read of "21 docs, mostly Draft/Approved paperwork" would suggest — a large amount of *real, shipped, verified* work happened alongside the documentation itself this session:

- **Every real security/tenant-isolation bug found has been fixed**, not just documented: the telemetry table's missing RLS (Multi-Tenant Architecture), the fail-open role default and missing tenant-suspension check (Multi-Tenant Architecture), the ticket-webhook SSRF and telemetry-value validation gap (Threat Model) — all fixed, all with real regression tests.
- **A real test suite exists** where there was none (Test Strategy) — 95 tests across unit, integration, and CDK-assertion layers *(re-counted 2026-07-11: 65 backend unit + 5 infra CDK-assertion, all passing when actually run; 25 backend integration self-skip without `TEST_DATABASE_URL`, per Test Strategy §4 — see §9 Review Log)*.
- **A real CI/CD pipeline exists in code** (CI/CD Pipeline) — OIDC-federated deploy roles, four workflows — just not yet runnable (§3).
- **Real monitoring exists** where none did (SOC 2 Control Mapping §4) — 5 CloudWatch alarms per stage, an SNS topic.
- **Environment separation, secret rotation, and stage-conditional HA are all real and verified** (Deployment Architecture, Infrastructure as Code) via repeated `cdk synth` runs, not just designed on paper.
- **Compliance posture is real, not aspirational** — SOC 2 control mapping with actual evidence citations, a real incident response process, a named compliance owner.
- **The channel-partner-portal amendment sequence is fully drafted, reviewed, and approved (see §4a)** — nine architecture docs amended, real backend code shipped alongside them: a second Cognito pool (`PartnerPool`), `withChannelPartner()`/`requirePartnerRole()`, `writeAuditLog()`, 17 new `/v1/partner/*` API endpoints across 4 route handler files, real cross-tenant/territory-scoped RLS (verified via `cdk synth` and re-audited across three full passes), and `FORCE ROW LEVEL SECURITY` applied project-wide after discovering RLS had never actually been enforced against the app's own DB role. None of it has been implemented in the frontend or run against a real database yet (§4a, §5).

---

## 3. Blocker #1: No Azure Subscription Exists — the Direct Analogue of the AWS Version's Own Blocker

**Restated for this fork, same shape as the AWS version's own standing constraint**: no Azure subscription exists yet, so nothing in `infra-azure/` (which itself doesn't exist yet either) has ever been validated against real Azure Resource Manager, no Entra tenant has been provisioned, and CI/CD Pipeline's future workflows have nothing to authenticate against. **Sequencing, mirroring the AWS version's own dependency order:**

1. Provision the Azure subscription (user action, outside this project's scope).
2. Provision the two Entra External ID tenants (`PeakLogicCustomers`, `PeakLogicPartners`) plus confirm/reuse PeakLogic's own corporate Entra ID tenant for staff (Security Architecture §2.0–§2.6) — **a real, disclosed prerequisite step neither Bicep nor Terraform can automate** (Infrastructure as Code §2.2), so this must happen manually/via script before any IaC deploy that references these tenants.
3. Write the real `infra-azure/` Bicep modules (Infrastructure as Code §3's planned structure — `main.bicep`, `network.bicep`, `data.bicep`, `api.bicep`, `iot.bicep`, `frontend.bicep`, `budget.bicep`) — not yet started, tracked as its own item (§5).
4. First `dev`-stage deploy, using whichever Azure CLI/Bicep deploy command Infrastructure as Code's real implementation settles on.
5. Only after a working `dev` deploy: exercise the CI/CD pipeline, confirm the rollback procedure, confirm the resource-group-per-stage boundary actually isolates as designed.

---

## 4. What Was Blocker #2 on AWS Is Already Resolved in This Fork's Design — Inherited, Not Re-Litigated

The AWS version's Blocker #2 (missing pool-chemistry/gas-sensor sensing logic) was a code-level gap in `backend/ingest/rules.ts` — application logic, not infrastructure. **This logic is cloud-agnostic and was never touched by the Azure pivot**: `pool_chemistry`/`gas_sensor` adapters with real, CDC-cited thresholds exist in the AWS repo's `rules.ts` and port to this fork's Azure ingest function unchanged, the same way Threat Model §4.1 already confirmed `sanitizeMetrics()` carries forward verbatim. **Not re-verified in this pass** — porting `backend/ingest/rules.ts` to whatever Azure Functions ingest handler gets written is real, tracked implementation work (§5), not re-derived or re-researched here.

**The channel-partner-portal feature (Domain Model §2.7, the full amendment sequence the AWS version's §4a documents) is likewise fully designed and inherited, unaffected by the cloud pivot at the product/data-model level** — `ChannelPartnerUser`, `Territory`, `RouteAssignment`/`RouteStop` are pure domain concepts. What changed for this fork is only the auth mechanism underneath it (Security Architecture §2.4's `PeakLogicPartners` Entra External ID tenant replaces `PartnerPool`) and the RLS-portability confirmation (Database Schema §4.7) — both already done. **Real implementation status is the same "designed, not built" state as the rest of this fork**: no MCP server, no frontend Mapbox integration, no partner login flow exist for this track either — not because this session found new gaps, but because nothing has been implemented yet at all, cloud-agnostic features included.

---

## 5. Remaining Work, Sequenced (rewritten for this fork's actual state)

| Order | Item | Why here | Blocking a demo? |
|---|---|---|---|
| 1 | §3 — Azure subscription, Entra tenant provisioning, first real deploy | Everything downstream needs a real running system to test against | **Yes** |
| 2 | Write real `infra-azure/` Bicep modules (Infrastructure as Code §3, §8) | Nothing else can deploy without them; run PSRule for Azure once written, same discipline the AWS `cdk-nag` pass used | **Yes** — no Azure deploy is possible without this |
| 3 | Port `backend/` application code to Azure SDKs — Entra token validation (`getAuth()`/`getPartnerAuth()`/`getStaffAuth()`/`getManagerAuth()`), Azure Postgres connection (`db.ts`'s CA bundle swap, Multi-Tenant Architecture §2.1a's connection-pooling pattern unchanged), IoT Hub device SDK for the ingest function, Key Vault secret retrieval | The application logic itself (RLS pattern, adapter dispatch, route handlers, `sanitizeMetrics()`, `postWebhook()`) is confirmed portable near-verbatim throughout this session's docs — this is real, bounded porting work, not a redesign | **Yes** — nothing runs without it |
| 4 | Frontend wired to the real API | Same standing gap the AWS version has (§2) — inherited, not newly introduced by the Azure pivot. A demo of live device data needs this regardless of cloud | **Yes** |
| 5 | **Geospatial site map + first-pass 3D facility panel** (this fork's own new feature backlog — PRD §5.14/§5.15, UX Wireframes §2.16/§2.17, API Specification §4.11/§4.12) | Real, Azure-track-specific scope with no AWS-side equivalent — the map feature is fully specified end-to-end (Mapbox, reusing the existing territory-drawing integration) and needs no new schema; the 3D panel is deliberately placeholder-scoped pending its own future scoping pass | **Not** for a core Tenant Admin demo, but low-cost to add once item 4 lands (additive fields on an existing endpoint, one new frontend view-toggle) |
| 6 | Channel-partner-portal implementation (MCP server, frontend Mapbox integration, branding theme, partner login flow, territory editor, dispatch UI, `writeAuditLog()` call-site wiring) | Same scope and sequencing logic as the AWS version's own §4a/§5 item 4 — fully designed, inherited unimplemented status, large scope, sequenced after the core tenant-side demo | **Not** for an initial Tenant Admin demo — **yes, and increasingly urgent**, if the demo audience is the channel partner itself, same standing business context as the AWS version |
| 7 | AUTH-1 (no-login screens) + RP-2.1 (plain-tenant Route View case) | Same real, inherited gap as the AWS version — cloud-agnostic, unaffected by the pivot | Probably not |
| 8 | Device decommission doesn't revoke IoT identity (Device & Command Security Architecture §3.2's redesigned Azure fix — disable IoT Hub identity + DPS enrollment) | Real, still-open gap, same low-likelihood-during-early-demos reasoning as the AWS version | No |
| 9 | Azure Functions IoT Hub trigger has no DLQ at all (Threat Model §4.1 — a materially bigger gap than the AWS residual, since Azure has no native DLQ for this trigger type) | Real reliability gap, needs real custom-logic design, not a config flag | No |
| 10 | Azure Monitor Alert email notifications unconfigured (SOC 2 Control Mapping §4) | Cheap to close once a real deploy exists | No, but cheap — bundle with item 1 |
| 11 | API Specification's inherited smaller reconciliation items (casing outliers, unbounded list endpoints) | Same cosmetic/scale items as the AWS version, unaffected by the pivot | No |

---

## 6. Explicit Non-Goals (unchanged from the AWS version, cloud-agnostic scope decisions)

Actuation/command issuance, MCP-*client* behavior, ML-trained predictive models, multi-subscription Azure isolation (the resource-group-per-stage vs. subscription-per-stage question Deployment Architecture §2.1 already decided), self-service billing, a fully DNS-rebinding-proof SSRF guard — all Enterprise Roadmap (#23) territory or explicitly out of MVP scope already, unaffected by the Azure pivot.

---

## 7. Open Questions

1. **§5's item ordering is a recommendation, not a decision this document has authority to make** — same standing caveat as the AWS version, now also depending on whether this fork or the AWS-native repo ends up as the merged entity's actual platform (a decision `project-peaklogic-purple-standard-merger` explicitly defers to the merger negotiation, not this roadmap).
2. **No target date exists anywhere in this roadmap, deliberately** — same dependency-not-calendar sequencing principle as the AWS version.
3. **New, added v2.0: whether this fork's Azure work should proceed in parallel with the AWS repo's own continued work, or wait for a real technology-direction decision, is explicitly not this document's call** — `azure-restructuring-plan.md` §4 already states this repo's existence doesn't itself commit PeakLogic to abandoning AWS; this roadmap sequences *this fork's* remaining work assuming it proceeds, without taking a position on whether it should.

---

## 8. Traceability

| Section | Traces to |
|---|---|
| §3 Deploy blocker | Deployment Architecture, Infrastructure as Code, CI/CD Pipeline — all repeat this same standing caveat for Azure |
| §4 Inherited resolved items | Threat Model §4.1 (`sanitizeMetrics()` portability), Domain Model §2.7 (channel-partner-portal entities, unaffected by cloud) |
| §5 items 1–3 | Deployment Architecture §2–§3, Infrastructure as Code §3/§8, Security Architecture (all identity surfaces) |
| §5 item 4 | Test Strategy §6 (inherited AWS-side finding), `CLAUDE.md` |
| §5 item 5 | PRD §5.14/§5.15, UX Wireframes §2.16/§2.17, API Specification §4.11/§4.12 — this fork's own new feature backlog |
| §5 item 6 | Domain Model §2.7, Security Architecture §2.4, API Specification §4.5 — inherited channel-partner-portal design |
| §5 items 7–11 | API Specification §5/§7, Device & Command Security Architecture §3.2, Threat Model §4.1, SOC 2 Control Mapping §4 |

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

---

## Revision History

**v2.0 (2026-07-17)** — the first `PeakLogic-Azure`-specific rewrite, forced by `azure-restructuring-plan.md` item 22: a full resequencing, now that the Azure infra path and new features are both scoped.

- **§2 rewritten**: states plainly that this fork's "done" is the inverse of the AWS version's — every architecture decision is real and researched, almost no Azure-native code exists yet, versus the AWS repo's reconciliation-of-already-shipped-code shape.
- **§3 rewritten**: Azure subscription + Entra tenant provisioning replaces the AWS account/`cdk bootstrap` blocker, same structural shape, real disclosed prerequisite (Entra tenant creation isn't IaC-automatable by either candidate tool).
- **§4 rewritten**: the AWS version's resolved Blocker #2 (sensing logic) and its full channel-partner-portal §4a are both restated as **inherited, cloud-agnostic, unaffected by the pivot** — not re-derived or re-verified, since none of it touches AWS-specific mechanisms.
- **§5 resequenced**: 11 items, reordered around this fork's real state — Bicep implementation and backend Azure-SDK porting now come first (nothing else can run without them), the map/3D feature backlog added as a new, Azure-track-specific item with no AWS-side equivalent, and every inherited item (channel-partner-portal implementation, AUTH-1/RP-2.1, decommission-revocation, DLQ, monitoring) restated with its real Azure-specific shape where one exists (e.g. Azure's DLQ gap being structurally bigger than AWS's).
- **§7 gained 1 new item (3)**: explicit non-position on whether this fork should be the eventual platform — deferred to the merger negotiation per `azure-restructuring-plan.md` §4, not this roadmap's call.
- **Downstream**: this is the last of the six 🟣 full-rewrite infrastructure documents in `azure-restructuring-plan.md` §2 — remaining work is Enterprise Roadmap (#23, 🔵 amendment), Technical Debt Register (#24, 🔵 fresh audit), Windows/iOS client app amendments (#25/#26), Device Onboarding (#27, 🟣 rewrite), and then real implementation (Bicep, backend porting) and testing.
