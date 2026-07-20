# Enterprise Audit — PeakLogic Platform

**Product:** PeakView Hub / PeakView 360
**Status:** Point-in-time audit, 2026-07-19 — findings frozen as of commit `30f4d1d`; remediation tracked in §6/§7, not by editing findings in place
**Auditor scope:** senior-architect-level review across strategy, codebase, device plane, security/compliance, and UX
**Audit depth (honest disclosure):** spot-verified, not line-by-line. Security-critical paths were read end-to-end as of the audit date (`backend/shared/db.ts`, `backend/shared/auth.ts`, `backend/ingest/handler.ts`, route samples, both infra trees); `frontend/` internals, `windows-hub/` internals, and the full 25+ document set were assessed from targeted checks and prior session-verified state. Findings marked ✅ were verified directly against code; findings marked 📄 come from the project's own documents/registers.

**Decision recorded at review (2026-07-19): PeakLogic commits to the Azure infrastructure track.** The split-brain finding in §1 is therefore resolved by *completing* `infra-azure`, not by reverting the backend port. The AWS-native `PeakLogic-AWS` repo remains the untouched fallback, per the fork's original charter.

---

## 1. Strategy & Product Alignment

**Headline risk: a split-brain cloud posture — resolved by decision (above), still open in execution.**

| Layer | Verified state at audit |
|---|---|
| `backend/shared/`, `backend/api/`, `backend/ingest/` | ✅ Already Azure-native (Entra JWT validation, Key Vault + managed identity, Event Hub trigger) |
| `infra/` | ✅ Still 11 AWS CDK stacks (api, auth, iot, data, network, cicd, monitoring, budget, domain, frontend, marketing) |
| `infra-azure/` | ✅ `main.bicep` + only two modules (`data.bicep`, `network.bicep`) — no Functions hosting, no API front door, no Entra registration automation, no IoT Hub/DPS, no monitoring, no CI/CD |
| Frontend / partner portal | ✅ 100% mock data (8 pages); portal is a login screen only |
| Marketing | ✅ Repo `marketing/index.html` is a "Coming Soon" splash; the real site exists only as the prototype artifact |

Consequence: **nothing can deploy anywhere today** — the backend outgrew the AWS infra, and the Azure infra it needs is ~20% built. This is the critical path.

**Messaging vs. capability:**
- Two of the eight marketed segments imply regulatory regimes the Compliance & Certification Roadmap does not yet address: **Assisted Living & Healthcare** (HIPAA-adjacent buyer expectations even with no PHI) and **Water Treatment & Municipal Wastewater** (EPA/state reporting). Guardrail: no compliance-adjacent claims for these segments until the roadmap covers them. *(Recorded in `business-development-and-strategy.md` §5's spirit; add explicitly on next edit.)*
- **Residential pricing (Free/Home/Home Plus) prices a product surface that does not exist.** A homeowner has no identity in the three-surface model, and homeowner access is precisely the unresolved AUTH-1 no-login conflict. Recommendation: gate the residential tab behind a waitlist or the AUTH-1 decision.
- PRD §8's confirmed MVP beachheads are pool servicing + QSR; sales/demo materials should lead with those two, with the 8-segment story as the umbrella.

## 2. Codebase & Architecture

### Genuinely enterprise-grade already (credit where due)
- ✅ **Tenant isolation layer** (`backend/shared/db.ts`): transaction-scoped `SET LOCAL`, **FORCE ROW LEVEL SECURITY** (closes the table-owner silent-bypass), tenant/partner suspension checks, documented RLS-evaluation-order reasoning, act-as assignment verification *before* tenant context is set. Stronger than most shipping SaaS.
- ✅ **Auth layer** (`backend/shared/auth.ts`): fails closed on every path, pins RS256, per-surface issuer/audience validation, and correctly resolves Entra's pairwise `sub` vs. stable `oid` (lines 141–156) — a trap that silently orphans users across client apps.
- ✅ **Ingest** (`backend/ingest/handler.ts`): `sanitizeMetrics()` before SQL, unknown/unclaimed-device drops, `app.ingest_context` as a SELECT-only carve-out that ends the moment tenant is resolved.
- ✅ **54 tests across 5 files**, including real-Postgres RLS integration tests. (`CLAUDE.md` still claims "There are no test suites" — stale; fix on next `CLAUDE.md` edit.)

### Findings (with fixes)

| # | Finding | Evidence | Fix |
|---|---|---|---|
| 2.1 | **Audit logging covers ~10% of mutations.** `writeAuditLog()` has exactly 4 call sites, all in `admin-tenant-actions.ts`. Partner credential creation, route confirmation, team management, alert acks, ticket updates, device claims — none audited. | ✅ grep, audit date | Make audit emission **structural**: a router-layer wrapper on every mutating route (actor/target/action), so a new route cannot skip it. Also the stated prerequisite for the command channel. |
| 2.2 | **No schema validation at the API boundary.** No zod/joi/ajv anywhere; `parseBody<T>()` is a cast; validation is hand-rolled per field (`settings.ts:43–46`). | ✅ | zod schemas per route module, parsed at dispatch, 400 with field errors. ~1–2 days now; far more after pilot data exists. |
| 2.3 | **`role: roles[0]` is nondeterministic** if a user holds 2+ App Roles (`auth.ts:155`, `getStaffAuth` same). | ✅ | Reject multi-role tokens or resolve by explicit precedence order. |
| 2.4 | **Ingest reliability holes:** (a) no dead-letter path — Event Hub retries then drops poison messages (disclosed at `handler.ts:44–53`); (b) **no idempotency** — Event Hubs is at-least-once; a redelivered batch double-inserts telemetry and can double-fire alerts → tickets → CMMS dispatch. | ✅ (a) disclosed; (b) new finding | (a) poison-message table written before rethrow; (b) unique index `(device_id, ts, metric)` + `ON CONFLICT DO NOTHING`. |
| 2.5 | **No rate limiting / WAF on the Azure track.** AWS API Gateway's default throttling disappears with it; raw Azure Functions provide none. | ✅ (absent from `infra-azure/`) | API Management (consumption) or Front Door in front of Functions — also the WAF and future per-partner quota point. Own Bicep module. |
| 2.6 | **No platform self-monitoring.** `monitoring-stack.ts` is AWS-only; no App Insights/Log Analytics/alert rules in `infra-azure`. For this product, "ingest silently stopped" is the worst incident and nothing would detect it. | ✅ | App Insights + alert rules (ingest rate → zero, DLQ depth, Function error rate) wired to a real on-call address **in the first Azure deploy**, not after. |

## 3. Device Control & Management

- **Identity/provisioning:** per-device X.509, outbound-only MQTT — right model, ports to IoT Hub/DPS. DPS enrollment-group design exists 📄 (artifact #27); `scripts/provision-devices.ts` still AWS — port alongside the IoT Bicep module.
- 🔴 **Silence detection does not exist** — the plane's worst gap. 📄 artifact #27 + ✅ no code path turns *absence* of telemetry into an alert; the Super-Console's "silent" state is demo fiction. A dead freezer sensor is indistinguishable from a healthy freezer. Fix: timer-triggered function comparing `last_seen` to per-category reporting interval (data already exists in policies/`CAT_CONFIG`), emitting `device_silent` through the existing alert pipeline. **P0 for any pilot.**
- **Commands:** correctly gated behind two unresolved prerequisites (role-overlap decision + audit coverage — pending-decisions #3). Keep the gate; finding 2.1 is its prerequisite anyway. Safety-critical actuation stays local-first.
- **OTA/firmware:** FW-1..4 are spec + console demo only; distribution deliberately undecided (PRD §5.16). Decide metadata-only vs. distribution before any fleet beyond a handful of units.
- **Windows hub:** real WinUI app on real Core pipeline ✅📄, but watchdog/kiosk provisioning and MSIX update path unbuilt — required before unattended customer installs.

## 4. Security, Compliance & Multi-Tenant Isolation

**Strong:** the isolation layer (§2); three separated identity surfaces; Key Vault + managed identity, no stored secrets (`db.ts:62–76`); the Azure port **deliberately did not carry TD-43's plaintext-credential bypass** (`db.ts:95–106`).

| # | Finding | Fix / gate |
|---|---|---|
| 4.1 | 🔴 TD-43 plaintext dev credential still live in the AWS `infra/` tree in this repo | Standing hard gate remains; with the Azure commitment, the AWS tree should eventually be pruned or clearly marked non-deployable |
| 4.2 | Entra claim names (`extension_tenantId`, `extension_channelPartnerId`) are documented-convention guesses, flagged in code (`auth.ts:114–120`) | First Azure deploy includes a claims-mapping verification step; failure mode is fail-closed (safe but total) |
| 4.3 | MFA / conditional access / single-tenant app registration are deploy-time Entra settings no code can enforce (`auth.ts:224–231`) | Deployment security checklist item, verified at Phase-1 acceptance |
| 4.4 | Retention (90d raw / 2y rollup / 7y alerts) defined in PRD §6 only — no partitioning or TTL jobs | Implement before pilot data accumulates; also the storage-cost control |
| 4.5 | SOC 2 roadmap exists; controls not operational | Keep all SOC 2 language off public surfaces until engaged (existing guardrail); audit-trail + RLS + Key Vault are a genuine head start |
| 4.6 | No pen test; no dependency scanning in CI/CD | Add `npm audit`/CodeQL to the ported pipeline; pen test at Phase 7 |

## 5. Website, UX & Enterprise Look-and-Feel

Prototype is in good shape (grounded claims, consistent 8 segments, unified iconography). Launch blockers:

1. **Trust-page vacuum** — no Privacy Policy, Terms, or Security page; municipal/enterprise buyers check before engaging.
2. **Placeholder content that cannot ship** — unverified Owner quote; fictional team ("Team shown for demonstration"). Replace or remove at cutover.
3. **Deployable site is still the splash page** — port the prototype into `marketing/` (already CSP-self-contained) before DNS cutover.
4. **Accessibility unaudited** — `--faint`-on-white and pill contrast likely fail WCAG AA; run axe/Lighthouse, keyboard-nav pass.
5. **Residential pricing** — see §1.

## 6. Critical Gaps — Prioritized

**P0 — blocks any safe pilot**
1. Complete `infra-azure` (Functions hosting, APIM/Front Door, IoT Hub + DPS, Entra registration automation, App Insights, CI/CD) — *the* critical path, per the Azure commitment.
2. Device-silence detection (§3).
3. Ingest hardening: poison-message DLQ + idempotent inserts (§2.4).
4. Platform self-monitoring with real alerting (§2.6).
5. First real deploy + Entra claims verification (§4.2) + first rollback drill.

**P1 — blocks a credible pilot**
6. Frontend wired to the real API (currently 100% mock; the product has never been seen end-to-end).
7. Structural audit-log coverage (§2.1).
8. zod validation boundary (§2.2).
9. Rate limiting/WAF via APIM (§2.5).
10. Outbound email infrastructure (already gated: PW-7/PW-8, SET-8).
11. Retention jobs (§4.4).
12. Marketing-site port + trust pages + placeholder purge (§5).

**P2 — scale/maturity**
13. OTA distribution decision · AUTH-1 no-login resolution · pen test · SOC 2 evidence automation · accessibility pass · Windows-hub watchdog + MSIX · multi-role token policy (§2.3).

## 7. Roadmap to Live

| Phase | Objective | Key tasks | Depends on | Acceptance criteria |
|---|---|---|---|---|
| **1. Azure Foundation** | One cloud, deployable | Finish `infra-azure` modules; Entra tenants + app registrations; claims verified; CI/CD ported; first `dev` deploy; **build the custom cost kill switch** (Azure has no native Budget Action equivalent — prior cost-findings memory) | Azure subscription + cost-model re-validation against the $0-until-live-data constraint | Pipeline deploy succeeds; real JWT round-trips `getAuth()`; rollback drill executed once |
| **2. Reliability Core** | Trustworthy ingest | Silence detection; DLQ + idempotency; App Insights alert rules; retention jobs | Phase 1 | Killed test device alerts within 2× reporting interval; replayed batch → zero duplicates; on-call fires when ingest stops |
| **3. Security Hardening** | Pilot-safe posture | Structural audit wrapper; zod boundary; APIM throttling/WAF; MFA/conditional-access checklist; dependency scanning | Phase 1 | Every mutating route emits an audit row (test-enforced); fuzzed bodies all 400; an act-as session is fully reconstructable from the audit trail |
| **4. Real Product Loop** | End-to-end truth | Frontend → real API; partner portal past login; Windows hub → IoT Hub; first real sensor provisioned | Phases 1–2 | A physical reading appears in the tenant UI and fires alert → ticket → CMMS webhook, unassisted |
| **5. Launch Surface** | Public credibility | Port site into `marketing/`; trust pages; placeholder purge; accessibility pass; DNS cutover | Phase 1 | Lighthouse a11y ≥ 90; zero unverifiable claims; legal pages live |
| **6. Pilot** | One real customer (pool/QSR beachhead) | Onboard via admin-console act-as; runbooks; weekly pool report if email infra landed | Phases 2–4 | 30 days live: zero silent outages; zero cross-tenant reads (audit-verified); one incident-response exercise executed |
| **7. Scale & Compliance** | Enterprise readiness | SOC 2 evidence automation; OTA decision; command channel (both gates resolved first); load test; DR restore drill | Pilot learnings | SOC 2 engaged; 10× pilot load passes; backup restore < 4h |

---

**Bottom line:** the isolation architecture and engineering discipline are unusually strong for this stage. The existential risks are *operational absences*, not code quality — nothing deploys, nothing self-monitors, silence isn't detected, and the audit trail covers a fraction of its mandate. Phases 1–2 carry all the mortal risk.
