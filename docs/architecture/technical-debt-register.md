# Technical Debt Register

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1.0
**Depends on:** All 23 previously approved/drafted artifacts (#1–23) — synthesizes every disclosed-but-unfixed gap in already-shipped code or already-approved documentation into one trackable inventory
**Last updated:** 2026-07-12

---

## 1. Introduction

### 1.1 Purpose

The last artifact in the sequence, and the only one whose job is bookkeeping rather than design. MVP Roadmap (#22) tracks what's blocking the first real deploy. Enterprise Roadmap (#23) tracks strategic capability that needs a "should we build this, and when" decision. Neither is the right home for the third kind of thing this project has accumulated a lot of: **known, already-disclosed imperfections in code or docs that already exist** — a shortcut taken under time pressure, an assumption never verified against a real system, a decision that fell through the crack between two documents that each assumed the other covered it. None of these need a strategic decision. They need someone to do the fix, sometime, and this register exists so "sometime" doesn't quietly become "never" by nobody remembering the item exists.

**A reassuring fact worth stating plainly:** every *live, exploitable* bug found during this project's architecture-first review process — the telemetry cross-tenant RLS gap, the ticket-webhook SSRF, the table-owner RLS bypass, the `unclaimed_lookup` leak, the fail-open role default — was fixed the same session it was found, not added to this register. What's below is different in kind: real gaps, but ones already judged low-severity, already-scheduled, or genuinely dependent on something outside this project's control (a real AWS account, a real audit engagement, a real customer request).

### 1.2 Scope

**In scope:** every item disclosed across the 23 prior artifacts (and a direct codebase/`CLAUDE.md` scan) that is a known imperfection in already-existing work, not itemized elsewhere as MVP-blocking (MVP Roadmap §5) or as a strategic future initiative (Enterprise Roadmap §3). Compiled via two passes: Enterprise Roadmap §6's own explicit hand-off list (14 items, reproduced in §3 below with the rest), plus a dedicated second research pass across every remaining `.md` file and a direct codebase grep for the items neither prior document had already claimed.

**Out of scope:** MVP Roadmap's own §5 items (AWS deploy blocker, frontend mock-data wiring, channel-partner-portal implementation, AUTH-1/RP-2.1 remaining scope) — those already have an owner document and repeating them here would just be duplicate tracking, not additional information. Enterprise Roadmap's 12 strategic initiatives (§3.1–§3.12 there) — those need a business decision, not a ticket. See §4 for a complete list of what's deliberately not repeated here and why.

---

## 2. How to Read This Register

Each item has:
- **ID** — `TD-#`, referenced elsewhere in this document and usable as a real ticket ID if this register is ever migrated into an issue tracker (see §6 item 1).
- **Category** — which of the five groups in §3 it belongs to.
- **Severity** — not a live-exploit severity scale (none of these are live exploits, per §1.1). Instead: **Medium** = a real gap with plausible, if not urgent, consequences if left unaddressed; **Low** = genuinely minor, cosmetic, or already has a low-cost mitigating factor.
- **Source** — the exact document/section or file where the gap was disclosed.
- **Status** — `Open` (no fix scheduled), `Scheduled` (a specific future point already named, e.g. tied to another initiative), or `Blocked` (can't be fixed until something else happens first, e.g. a real AWS deploy).

---

## 3. Register

### 3.1 Security & Hardening

| ID | Item | Severity | Source | Status |
|---|---|---|---|---|
| TD-1 | No AWS WAF attached to API Gateway | Medium | Security Architecture §3.3; re-decided Threat Model §6 with an explicit enterprise-questionnaire trigger | Blocked — tied to Enterprise Roadmap §3.2/§3.12 trigger |
| TD-2 | SSRF fix (`postWebhook()`) validates at check-time, not connection-time — DNS rebinding not fully closed | Medium | Threat Model §4.2/§7 item 2 | Open — judged disproportionate to fully close at current scale |
| TD-3 | MFA is pool-wide (`Mfa.REQUIRED`), not per-role — `operator` can't be exempted without a custom Cognito Lambda trigger | Low | Security Architecture §2.2 | Open — revisit only if real `operator`-level friction surfaces |
| TD-4 | No admin-facing session-revocation ("force logout") tooling — Cognito supports it at the API level, nothing exposes it | Medium | Security Architecture §6/§8 item 2 | Open |
| TD-5 | CloudWatch Logs retention (2 weeks) may be too short for real incident investigation | Low | Security Architecture §8 item 1 | Open — needs a storage-cost tradeoff decision |
| TD-6 | `device_claim` RLS policy has a disclosed error-based oracle (distinguishes "exists, unclaimed" from "doesn't exist" for an attacker who already has a guessed device UUID) | Low | Multi-Tenant Architecture §2.5.3 (Revision History, third audit pass) | Open — requires an already-guessed 122-bit UUID, judged not worth further hardening at current scale |
| TD-7 | No non-owning application DB role — `FORCE ROW LEVEL SECURITY` is correct today but not structurally tamper-proof against a compromised app credential with schema privileges | Medium | Multi-Tenant Architecture §6 item 6 | Blocked — tied to Enterprise Roadmap §3.2 (SOC 2 Type II) trigger |
| TD-8 | RLS coverage across the whole codebase is not provably complete — three independent audit passes each caught something the last missed; a fourth might too | Medium | Multi-Tenant Architecture §6 item 10 | Open — will only be provable via real integration tests against a real database |
| TD-9 | Per-device X.509 certificate rotation policy has no owner — Device & Command Security Architecture explicitly deferred it to Security Architecture, which never picked it up | Medium | Device & Command Security Architecture §7 item 2 (handoff never fulfilled — verified: `security-architecture.md` has zero mentions of certificate rotation) | Open — orphaned between two documents, needs a real owner assigned |
| TD-10 | CloudFront distribution allows TLS 1.0 (`AwsSolutions-CFR4` suppressed) — blocked on owning `app.peaklogic.io`'s real DNS for a custom ACM certificate | Low | `infra/lib/frontend-stack.ts`; Infrastructure as Code §2.2/§6 item 2 | Blocked — needs real domain ownership, itself blocked on MVP Roadmap Blocker #1 |
| TD-11 | Known moderate-severity dev-dependency CVE: esbuild/Vite dev-server CORS (GHSA-67mh-4wv8-2f99) — production unaffected | Low | `CHANGELOG.md` [Unreleased]/Security; Test Strategy §9 item 2 | Scheduled — fix requires Vite v5→v8 (breaking) + vitest v2→v4+ in the same pass, targeted for v1.1.0 |
| TD-12 | GitHub branch protection and required-reviewer merge gates are not technically enforceable on this repository's current billing tier — CI checks are advisory only, and the originally-designed prod-deploy approval gate tested as non-functional (`422`) | Medium | CI/CD Pipeline §2.3/§3/§7 item 1 | Blocked — needs a paid GitHub tier; current mitigation is procedural discipline plus manual `workflow_dispatch` |

### 3.2 Reliability & Operational Verification

| ID | Item | Severity | Source | Status |
|---|---|---|---|---|
| TD-13 | `IngestFn` has no DLQ/`onFailure` destination — a malformed telemetry value is retried twice by Lambda's default async behavior with no dedicated forensic trail | Low | Threat Model §4.1 residual finding | Open |
| TD-14 | No per-tenant resource quota/rate limit beyond platform-wide API Gateway throttling — one high-volume or malicious tenant could exhaust it for everyone | Medium | Multi-Tenant Architecture §4/§6; also a Threat Model §4.5 DoS finding | Blocked — revisit before onboarding a tenant with a meaningfully different usage profile |
| TD-15 | No cross-region backup replication — single-region posture consistent with cost-conscious MVP scope, deferred until a contractual SLA requires it | Low | Deployment Architecture §3.2 | Blocked — becomes a real prerequisite once Enterprise Roadmap §3.12 (SLA tier) is picked up |
| TD-16 | `node-pg-migrate`'s exact SQL-migration file convention and programmatic API have never been checked against the actually-installed package version | Medium | `scripts/migrate.ts`; Database Schema §4.2 | Blocked — verify before the first real migration run, independent of the general AWS-deploy blocker |
| TD-17 | RDS secret-rotation Lambda's real-world reachability (VPC egress to both RDS and Secrets Manager) and rotation-strategy correctness against this schema are unconfirmed | Medium | Infrastructure as Code §6 item 1 | Blocked — MVP Roadmap Blocker #1 (needs a real `dev`-stage deploy) |
| TD-18 | RLS integration test fixture SQL has only ever been checked by reading, never by running — real (if low) risk of a typo surfacing only on first execution; neither CI's `postgres:16` service container nor the local Docker Compose path has ever run once | Medium | Test Strategy §4.4/§9 items 1 and 5 | Blocked — no Docker available in this environment; needs either a real CI run or local Docker |
| TD-19 | First `dev`-stage `cdk deploy` risks failing outright on a GitHub OIDC provider collision if one already exists in the target AWS account for an unrelated reason — unverifiable without real AWS access | Low | CI/CD Pipeline §4.2/§7 item 3 | Blocked — MVP Roadmap Blocker #1 |
| TD-20 | RDS free-storage CloudWatch alarm threshold (2 GiB) is an unmodeled placeholder proportional to current instance sizing, not a calculated value | Low | `infra/lib/monitoring-stack.ts` | Open — revisit if storage sizing changes materially |
| TD-21 | Stated RPO/RTO targets (RTO ≤ 4 hours) have never actually been drilled via a real point-in-time restore | Medium | Deployment Architecture §3.2 | Blocked — needs a real deploy to drill against |
| TD-22 | Incident-response plan has no breach-notification legal review behind its stated timelines | Medium | SOC 2 Control Mapping §11 item 2 | Open — pre-Type-I-engagement prerequisite |

### 3.3 Compliance & Process

| ID | Item | Severity | Source | Status |
|---|---|---|---|---|
| TD-23 | SOC 2 CC1 organizational-control gaps (formal code of conduct, background-check policy, documented org chart) have no owner or timeline | Medium | SOC 2 Control Mapping §9/§11 item 3 | Open — needs the named compliance owner (the user, per SOC 2 Control Mapping §8) to schedule these |
| TD-24 | Vendor/subprocessor list has no scheduled periodic re-review cadence — currently "re-check when something changes," weaker evidence for an auditor than a dated cadence | Low | SOC 2 Control Mapping §11 item 4 | Open — consider a quarterly cadence |
| TD-25 | Total chlorine metric (part of SN-4's original PRD wording) remains unimplemented in the `pool_chemistry` adapter, despite pH/free chlorine/TDS being resolved | Low | SRS §9/§13 (Open Issue #1 follow-up); `backend/ingest/rules.ts` | Open — a disclosed partial gap in otherwise-resolved sensing logic, easy to mistake as fully closed if this register didn't call it out separately |
| TD-26 | CI/CD Pipeline (#17) — real, working pipeline code exists and is described as complete, but the governing document itself was never formally moved to Approved status | Low | `docs/architecture/README.md`; `cicd-pipeline.md` header | Open — the only non-Approved artifact among #1–23; worth closing the loop even though the underlying code isn't blocked by it |

### 3.4 Product & Design Gaps

| ID | Item | Severity | Source | Status |
|---|---|---|---|---|
| TD-27 | No UI trigger designed for the external AI dispatch agent — UX Wireframes §2.14 deliberately has no "Generate route" button, but that leaves the actual triggering mechanism (on a schedule? on demand?) undesigned | Low | UX Wireframes §3 item 5 | Open — part of MVP Roadmap §5 item 4's implementation scope, not itemized there at this granularity |
| TD-28 | Redrawing a territory can silently strand an unconfirmed route built against the old boundary — flagged in both UX Wireframes and API Specification, resolved in neither | Low | UX Wireframes §3 item 6; API Specification §7 item 7 | Open |
| TD-29 | Partner-portal login has no designed fallback when `channel_partners.branding` is null | Low | UX Wireframes §3 item 3 | Open |
| TD-30 | Live territory-preview-while-drawing UX is undecided; would need a new server-side "preview containment" capability if pursued | Low | UX Wireframes §3 item 4 | Open — explicitly "not assumed necessary" |
| TD-31 | Alert-detail copy ("rate-of-change flag") is placeholder engineering language, not real product writing | Low | UX Wireframes §3 item 1 | Open |
| TD-32 | MCP transport (stdio vs. HTTP/SSE) is unsettled — now applies to the territory/technician tools too, not just the original three | Medium | API Specification §7 item 3 | Blocked — part of MVP Roadmap §5 item 4's MCP-server work |
| TD-33 | Site Detail's cross-role screen-reuse behavior (adaptive-by-role vs. role-agnostic data contract) isn't an explicit requirement anywhere | Low | Information Architecture §5 item 2 | Open |

### 3.5 Code Quality & Documentation Governance

| ID | Item | Severity | Source | Status |
|---|---|---|---|---|
| TD-34 | API request/response casing outliers (`tickets.ts`/`devices.ts`) and camelCase query-param names inconsistent with the snake_case decision | Low | API Specification §7 item 4 | Open |
| TD-35 | `sites.list`/`assets.list`/`devices.list` are unbounded — no `LIMIT`/`OFFSET` despite §2.2's pagination decision | Low | API Specification §7 item 4 | Open |
| TD-36 | `POST /v1/partner/users` is not atomic across Cognito and the database — a partial failure can leave the two systems out of sync, no compensating transaction/cleanup logic exists | Medium | API Specification §7 item 6 | Open — proportionate to note, not yet to fix, at current design-partner-tenant scale |
| TD-37 | `backend/shared/types.ts` is stale against the current schema — `Site.type` still lists an old 4-value enum, `Tenant` is missing `channel_partner_id` entirely | Low | API Specification §7 item 4 | Open |
| TD-38 | No route-handler-level tests exist for the 17 channel-partner endpoints (input validation, state-transition checks like "confirmed routes are immutable") | Low | `project-peaklogic-channel-partner-portal` memory | Open — consistent with existing precedent, none of the 24 original tenant endpoints have route-handler tests either |
| TD-39 | Cognito Plus tier (advanced threat protection / adaptive auth) deferred purely on cost, not re-evaluated since | Low | Infrastructure as Code §2.2/§6 item 4 | Blocked — tied to Enterprise Roadmap trigger conditions generally |
| TD-40 | SRS §5.2 cites Threat Model as artifact "#17" — stale; Threat Model is actually #19 | Low | Security Architecture §1 (intro note); source error in SRS §5.2 | Open — trivial, included for completeness |
| TD-41 | `withStaffSession()`/`withStaffActingOnTenant()` (`backend/shared/db.ts`, added v1.2.0/PRD-SRS v1.6) have no integration-test coverage against a real Postgres — the channel-partner equivalent (`withChannelPartner()`) has that coverage in `db.integration.test.ts`, the staff-side functions are the same load-bearing shape but weren't added to that suite in the same pass | Medium | Security Architecture §2.5; SysAdmin Guide §5.7 | Open — same "verify, don't just re-read" bar as everything else in this register, not yet met for this one |
| TD-42 | Internal Administration Console (`/v1/admin/*`) has no dedicated frontend UI — every endpoint is real and callable, but a PeakLogic staff member has to call the API directly (e.g. via Postman) rather than through a built console screen | Low | API Specification §4.7; SysAdmin Guide §8.3 | Open — deferred this pass in favor of the tenant-side Settings/theme/drill-down frontend, which end users are actively using |

---

## 4. What's Deliberately Not Repeated Here

- **MVP Roadmap §5's own items** (AWS deploy blocker and its sub-steps, frontend mock-data wiring, the channel-partner-portal implementation item, AUTH-1/RP-2.1 remaining scope, device decommission cert revocation — TD-9's *cousin*, but distinct: TD-9 is about rotation *policy* for active devices, MVP Roadmap's item is about revocation on decommission) — that document already owns sequencing them toward a first demo.
- **Enterprise Roadmap's 12 strategic initiatives** (§3.1–§3.12 there) — actuation, SOC 2 Type II/ISO 27001/HIPAA as a certification *program* (as opposed to TD-23/TD-24's specific prerequisite gaps, which are genuinely register-shaped), multi-account AWS, the adapter marketplace, MCP-client behavior, ML models, electrical load conditioning, full channel-partner tenant management, next verticals, native mobile, portfolio ROI reporting, and the enterprise SLA tier (as opposed to TD-15/TD-21, which are the specific technical prerequisites an SLA tier would need).
- **Live, exploitable bugs found this session** — all were fixed immediately, not registered here (§1.1).

---

## 5. Severity Summary

| Severity | Count | Notes |
|---|---|---|
| Medium | 16 | Real gaps with plausible consequences — TD-1, 2, 4, 7, 8, 9, 12, 14, 16, 17, 18, 21, 22, 23, 32, 36 |
| Low | 24 | Genuinely minor, cosmetic, or already low-cost-mitigated |

No item in this register is rated above Medium — consistent with §1.1's framing that everything genuinely urgent was fixed live during this project's review process, not deferred to a register.

---

## 6. Open Questions

1. **A static markdown register doesn't support status updates well over time.** Once real engineering capacity exists (post-deploy, post-MVP), this document's own format may become the wrong tool — SOC 2 Control Mapping's change-management evidence (`CLAUDE.md`'s git discipline) implies a real issue tracker (GitHub Issues, Linear) would be a better long-term home for individually-closable items than a document requiring a manual edit + commit per status change. Not resolved here — a real tooling decision, not an architecture one.
2. **Severity ratings here are this document's own first-pass judgment**, not independently reviewed against a security or product stakeholder's priorities. Worth revisiting once real customer feedback or a real security review (the same trigger several Enterprise Roadmap initiatives share) provides an external signal.
3. **TD-9 (certificate rotation) and TD-32 (MCP transport) are the two items in this register closest to actually blocking near-term work** (actuation and the channel-partner MCP server respectively, both real near-term interests) — worth flagging for earlier attention than their Medium severity alone might suggest, since severity here measures consequence-if-never-fixed, not urgency-relative-to-current-priorities.

---

## 7. Traceability

| ID range | Primary source(s) |
|---|---|
| TD-1–TD-12 | Security Architecture §2.2/§3.3/§6/§8, Threat Model §4.1/§4.2/§4.5/§6/§7, Multi-Tenant Architecture §2.5.3/§6, Device & Command Security Architecture §7, Infrastructure as Code §2.2/§6, CHANGELOG.md, CI/CD Pipeline §2.3/§3/§7 |
| TD-13–TD-22 | Threat Model §4.1, Multi-Tenant Architecture §4/§6, Deployment Architecture §3.2, Database Schema §4.2, Infrastructure as Code §6, Test Strategy §4.4/§9, CI/CD Pipeline §4.2/§7, SOC 2 Control Mapping §11 |
| TD-23–TD-26 | SOC 2 Control Mapping §9/§11, SRS §9/§13, README.md, CI/CD Pipeline header |
| TD-27–TD-33 | UX Wireframes §3, API Specification §7, Information Architecture §5 |
| TD-34–TD-40 | API Specification §7, `project-peaklogic-channel-partner-portal` memory, Infrastructure as Code §2.2/§6, Security Architecture §1, SRS §5.2 |

---

## 8. Review Log

**v0.1, reviewed 2026-07-12.** Compiled in two passes: (1) reproducing Enterprise Roadmap §6's own explicit 14-item hand-off list, already reviewed once during that document's approval; (2) a dedicated Explore-agent research pass across every remaining `.md` file, the codebase (`TODO`/`FIXME` grep across `backend/`, `infra/`, `frontend/src`, `scripts/`), and `CLAUDE.md`, explicitly instructed to exclude anything already covered by MVP Roadmap §5 or Enterprise Roadmap §6.

1. **Spot-checked, not blindly trusted**: re-verified TD-9 (certificate rotation orphaned between two docs) by grepping `security-architecture.md` directly for "rotation"/"X.509"/"certificate" — confirmed zero matches, meaning the handoff Device & Command Security Architecture §7 item 2 pointed to genuinely never happened, not just under-cited.
2. **Re-verified directly**: TD-10's exact CDK-nag suppression text against `infra/lib/frontend-stack.ts` — the reported quote matched the live code exactly, including the specific reasoning about `app.peaklogic.io` DNS ownership.
3. **Re-verified directly**: TD-25's total-chlorine gap against the live `srs.md` text — confirmed it's stated in three separate places (SN-4.1's row, §9's open-issue resolution note, §13's revision history), consistently described as "disclosed... not a silent omission" each time, not an inconsistent or exaggerated claim.
4. **Confirmed the research pass correctly excluded already-fixed items**: two infra-code `TODO`s the docs originally flagged (API Gateway CORS `ALL_ORIGINS`, DB `rejectUnauthorized: false`) were checked directly in `infra/lib/api-stack.ts`/`backend/shared/db.ts` by the research pass and found already fixed in code — correctly left out of this register rather than re-reported as still-open.
5. **A judgment call, disclosed not hidden**: severity ratings (Medium/Low only, no item above Medium) and the Status field's Open/Scheduled/Blocked values are this document's own first-pass classification, not independently reviewed — flagged explicitly in §6 item 2 rather than presented as an objective, externally-validated triage.

**Approved v1.0, 2026-07-12** — user-approved without requested changes. Bumped out of `v0.x` draft numbering into `v1.0`, the same convention MVP Roadmap and Enterprise Roadmap followed. This completes the full 24-artifact architecture-first sequence for the first time in this project's history.

---

## Revision History

**v1.1 (2026-07-12)** — added TD-41/TD-42, both real gaps disclosed rather than silently skipped while implementing the Internal Administration Console + Settings & Preferences feature (PRD/SRS v1.6): no integration-test coverage yet for the new `withStaffSession()`/`withStaffActingOnTenant()` functions against a real Postgres, and no dedicated frontend UI yet for the admin console. A minimal amendment (two rows added, no re-triage of existing items) rather than a full re-approval pass — this document's own job is bookkeeping, and these are exactly the kind of items it exists to catch.

**v0.1 (2026-07-12)** — initial draft. Inventories 40 known technical-debt items across 5 categories (Security & Hardening, Reliability & Operational Verification, Compliance & Process, Product & Design Gaps, Code Quality & Documentation Governance), synthesized from Enterprise Roadmap §6's explicit hand-off plus a dedicated second research pass across every remaining artifact and the codebase. This is the last artifact in the 24-item sequenced architecture list.
