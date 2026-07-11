# Threat Model

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1
**Depends on:** [Security Architecture](security-architecture.md) (approved v1), [Multi-Tenant Architecture](multi-tenant-architecture.md) (approved v1), [Device & Command Security Architecture](device-command-security-architecture.md) (approved v1), [CI/CD Pipeline](cicd-pipeline.md) (draft v0.1)

**Last updated:** 2026-07-11

---

## 1. Introduction

### 1.1 Purpose

Security Architecture §3.3 and Infrastructure as Code's `CFR2`/`APIG3` cdk-nag suppressions both deferred the WAF decision here explicitly — "revisit alongside Threat Model (#19)." This document finally makes that call (§6), and does the broader job those citations imply: a systematic pass across every trust boundary in the system, not just the pieces individual prior artifacts happened to touch while solving something else.

### 1.2 Scope & Methodology

STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) applied per attack surface (§3), not a from-scratch enumeration — most surfaces already have real analysis scattered across Security Architecture, Multi-Tenant Architecture, and Device & Command Security Architecture. This document's job is to **check those are actually complete, cross-reference them in one place, and find what none of them were specifically looking for.** One of the four real findings below (§4.2) is exactly that: a vulnerability that fell in the gap between "Security Architecture reviewed IAM/CORS/TLS" and "Multi-Tenant Architecture reviewed RLS" — nobody had reviewed *outbound* requests the backend itself makes.

Out of scope: a formal attack-tree with likelihood/impact scoring matrices — disproportionate for current scale; a prioritized, honestly-labeled findings list (§5) serves the same purpose without the theater.

---

## 2. Trust Boundaries & Threat Actors

| Actor | Capability |
|---|---|
| **Unauthenticated internet** | Can reach API Gateway's public endpoint and CloudFront; blocked by Cognito on every data route (AUTH-1) |
| **Authenticated tenant user (`operator`)** | Valid JWT, one tenant's data via RLS. The actor for §4.2's SSRF finding — a meaningfully low bar, not a privileged account |
| **Authenticated tenant user (`admin`)** | Same as above plus device decommission, tenant-scoped writes `operator` can't do |
| **A legitimate but compromised/cloned device** | Valid X.509 cert, scoped to its own MQTT topics only (Device & Command Security Architecture §2) |
| **PeakLogic operator/insider** | AWS console/CLI access — assumed trusted; out of scope (insider threat programs are a SOC 2 Control Mapping (#20) concern, not an architecture one) |
| **CI/CD pipeline** | A new actor since CI/CD Pipeline (#17) — a GitHub Actions workflow run, potentially triggered by a PR from within the org |

---

## 3. Attack Surface Inventory

Device → IoT Core → ingest Lambda; human/MCP client → API Gateway → API Lambda → Postgres; browser → CloudFront/S3; GitHub → OIDC → AWS (new, #17); ticket/alert → external webhook (new attack surface this document found wasn't reviewed as one — §4.2).

---

## 4. STRIDE Findings by Surface

### 4.1 Device → Cloud (IoT Core, ingest Lambda)

**Already covered, cited not repeated:** device identity/authentication (mutual TLS, per-device scoped policy) — Device & Command Security Architecture §2. Decommissioned devices retaining live certs — same document §3.2, recommended fix not yet implemented (still open, tracked there, not duplicated here).

**Finding: no validation on telemetry values themselves — fixed (commit `ea394ad`) — and the actual failure path was worse than first assumed, corrected after checking AWS's own documented behavior rather than guessing.** `handler.ts` read `metrics: Record<string, number>` straight from the IoT Core event with no runtime check — the TypeScript type was a compile-time hint only. A malformed value (`null`, a non-numeric string, or a number wildly outside physical plausibility — not literal `NaN`/`Infinity`, which can't survive a JSON round-trip and so can't actually arrive via an MQTT/JSON payload) reached `evaluateRules()` and the `telemetry` INSERT unchecked, which would fail at the SQL layer (a clean Postgres type/constraint error).

What happened next was *not* what a first guess suggested. IoT Rule → Lambda is an **asynchronous** invocation — the rule considers itself successful the moment Lambda returns a 202 (accepted), regardless of what the function does afterward, so the IoT-rule-level `errorAction` (`errorLogGroup`, already configured) **never fires for a failure inside the handler** — it only catches failures in the invoke call itself (e.g., a permissions error), not an uncaught exception in the code. Separately, checked directly: `IngestFn` (`api-stack.ts`) has **no dead-letter queue or `onFailure` destination configured** — grepped for `deadLetter`/`onFailure`/`maxEventAge`, none exist. That meant AWS Lambda's own default asynchronous-invocation retry policy applied (up to 2 automatic retries), each attempt failing identically against the same bad value and each one logging its exception to the Lambda's *own* CloudWatch log group (`ingestLogGroup` — a real forensic trail, just not the one this document first assumed), and then the event was silently dropped with nothing to catch the final failure. **Severity was always low, not urgent** — the actor is a legitimate-but-compromised or malfunctioning device (X.509-authenticated, narrowly-scoped per Device & Command Security Architecture §2), not an open internet vector; worst case was a dropped data point (confirmed: after up to 3 wasted invocations, not 1), never a tenant-isolation or data-integrity breach — but low severity isn't zero cost, and the fix was cheap.

**Fixed:** `sanitizeMetrics()` added to `rules.ts` (same pure, testable-extraction pattern as `evaluateRules`) — drops any metric whose value isn't a real finite number before it reaches the SQL insert or rule evaluation; `handler.ts` logs what was dropped and returns early if nothing usable remains. Deliberately does **not** range-check plausibility per metric (e.g. "is 500 psi impossible for this specific sensor") — that needs real, domain-sourced bounds this document doesn't have authority to invent, and wasn't required to close the actual bug. 6 new tests, verified meaningful the same way as everything else in this project: deliberately loosened the finite-number check, confirmed the right test failed, reverted. **Not fixed, and not part of this change:** the missing DLQ/`onFailure` destination on `IngestFn` — a separate, smaller reliability gap this finding surfaced but didn't require touching to close the actual bug (§7).

### 4.2 API Gateway / Lambda — SSRF via ticket webhooks (found and fixed 2026-07-11)

**This is the headline finding of this document — already fixed, not just identified.** `POST /v1/tickets` accepted an arbitrary `webhookUrl` from the request body and called `fetch()` on it with zero validation. Any authenticated `operator`-or-higher user — not a privileged account — could make the VPC-attached Lambda send an outbound request to any destination they chose: internal network reconnaissance, or using the Lambda's AWS egress IP as an abuse relay against a third party. The identical unguarded pattern existed in the ingest handler's tenant-settings-sourced auto-webhook too (not yet API-reachable, but the same code, closed before it becomes live).

**Why this fell through every prior review:** Security Architecture's IAM/CORS/TLS passes and Multi-Tenant Architecture's RLS passes both looked at *inbound* trust boundaries — who can reach this system and what tenant-scoped data they can touch. Nobody had specifically reviewed *outbound* requests the backend itself makes on a caller's behalf. That's precisely the blind spot STRIDE's systematic per-surface pass is supposed to catch, and did.

**Fixed:** `backend/shared/webhook.ts` — a single, tested `postWebhook()` both call sites now share, rejecting anything but `https://` resolving to a public (non-private, non-loopback, non-link-local, non-reserved) address. Explicitly does **not** claim to be a complete DNS-rebinding-proof solution (validates at check time, not TCP-connection time) — judged disproportionate to fully close at MVP scale, documented as accepted residual risk rather than silently incomplete. 29 tests, including a live DNS lookup and confirmation that the entire `169.254.0.0/16` link-local range is rejected — the block that matters here, since it's a whole-CIDR rule rather than a curated address list: it covers the classic EC2 IMDS address (`169.254.169.254`), ECS/Fargate's task-metadata credential endpoint (`169.254.170.2`), and Lambda's own AZ-metadata endpoint (`169.254.100.1`, a different address in the same range, not used for credentials and already token-protected against SSRF per AWS's own docs) without needing to know which specific address applies to which compute service.

**Already covered, cited not repeated:** RLS/tenant isolation (Multi-Tenant Architecture), auth/role enforcement (Security Architecture, Multi-Tenant Architecture §2.3's fail-closed fix), IAM least-privilege (Infrastructure as Code §2.2), no privilege-escalation endpoint exists (checked directly for this document — grepped every route for anything that writes a role/group claim; none exists, role changes are Cognito-console-only, outside the API surface entirely).

### 4.3 CI/CD Pipeline (new surface since #17) — already correctly isolated, verified not assumed

**Checked directly, not assumed:** `ci.yml` (triggered by `pull_request`, the only workflow a PR can cause to run) has no `permissions: id-token: write` block — it gets GitHub's default token permissions, no path to an AWS credential regardless of what a PR's own workflow-file changes might attempt. Only the three deploy workflows have that permission, and none of them trigger on `pull_request` — `deploy-dev.yml`/`deploy-staging.yml`/`deploy-prod.yml` all require `push` to a protected branch or `workflow_dispatch`, actions a PR alone can't cause. **This is already the correct design, not a gap** — confirmed by reading the actual permission blocks, not inferred from intent.

### 4.4 Frontend / CloudFront

Deliberately not deep-reviewed here — Test Strategy §6 already established the frontend runs entirely on mock data, not wired to the real API. A frontend security review (XSS, CSRF against real authenticated endpoints, stored-data handling) is genuinely premature against fixtures that don't reflect real backend behavior; revisit when Test Strategy's own trigger for frontend testing fires (frontend wired to live endpoints).

### 4.5 Denial of Service — shared throttling across tenants

**Already identified, reframed with STRIDE's own vocabulary, not a new finding.** Multi-Tenant Architecture §4 already flagged unbounded resource-sharing as a performance concern ("noisy neighbor"); the same fact is also a real Denial-of-Service *security* finding: API Gateway throttling (200 burst/100 rate, Security Architecture §3.4) is account-wide, not per-tenant, so one malicious or compromised tenant's credentials could deliberately exhaust it and deny service to every other tenant. No new fix here — same accepted-for-now MVP posture, same forward pointer to Deployment Architecture (#15) before onboarding a tenant with a meaningfully different usage/threat profile.

---

## 5. Findings Summary

| Finding | Status | Severity |
|---|---|---|
| Ticket webhook SSRF (§4.2) | **Fixed** (commit `11d6dba`) | High — live, low-privilege-actor-exploitable |
| Telemetry value validation (§4.1) | **Fixed** (commit `ea394ad`) | Low — narrow actor set, availability/data-quality impact only |
| Decommissioned device cert not revoked | Already tracked (Device & Command Security Architecture §3.2) | — |
| Cross-tenant DoS via shared throttling (§4.5) | Already tracked (Multi-Tenant Architecture §4) | — |
| CI/CD credential isolation | Verified already correct | — |

---

## 6. WAF — decided, not deferred a third time

Security Architecture §3.3 and Infrastructure as Code's cdk-nag suppressions both pointed here. **Decision: still not adopting a WAF, with an explicit trigger condition this time instead of an open-ended "revisit later."** Reasoning unchanged in substance — Cognito auth gates every data route, API Gateway throttling is already in place, and this document's own SSRF finding was an application-logic bug a WAF's signature/pattern matching would not have caught (SSRF via a legitimate-shaped POST body isn't a SQLi/XSS pattern). **Concrete trigger to revisit, not "someday":** a specific enterprise security questionnaire or contractual requirement asking for one, or an actual observed abuse pattern (credential stuffing, scraping, bot traffic) that WAF-class filtering specifically addresses and nothing already in place does.

---

## 7. Open Questions

1. ~~§4.1's telemetry value validation~~ **Fixed (commit `ea394ad`, 2026-07-11).** Residual, not fixed here: `IngestFn` still has no DLQ/`onFailure` destination configured — a smaller, separate reliability gap this finding surfaced but didn't require touching to close the actual bug. Worth bundling into whatever eventually addresses Lambda operational hygiene more broadly.
2. **§4.2's SSRF fix has a disclosed, deliberate gap (DNS rebinding)** — accepted residual risk at current scale, not a hidden one; revisit if this system ever handles a threat model where a sophisticated, resourced attacker with API access specifically is a real concern (e.g., ahead of a SOC 2 Type II engagement or an enterprise deal explicitly probing for it).
3. **§6's WAF trigger condition is qualitative, not a metric threshold** — "a specific ask or an observed pattern" is a judgment call for whoever's watching for it, not an automated alert. No monitoring is wired up to detect the "observed abuse pattern" half of that trigger — Security Architecture §6's forensic sources (CloudWatch, VPC Flow Logs, API access logs) exist, but nothing actively watches them for this specific purpose.

---

## 8. Review Log

Reviewed 2026-07-11. Two real technical inaccuracies found and corrected via actual web research (`WebSearch`), not just re-reading — both were specific, checkable AWS-behavior claims this document made confidently and got wrong in the first draft.

1. **§4.2 misidentified which address Lambda uses for credentials.** First draft claimed `169.254.170.2` was "Lambda's own credential-vending address" — that's actually the **ECS/Fargate** task-metadata credential endpoint. Lambda has a separate metadata endpoint at `169.254.100.1:9001` for AZ discovery (not credentials, and already token-protected against SSRF per AWS's own docs) — Lambda's real IAM credentials come via environment variables, not an IMDS-style HTTP fetch at all, which was this document's actual (correct) higher-level point. **The fix itself was never wrong** — blocking the entire `169.254.0.0/16` range catches all three addresses (EC2 IMDS, ECS metadata, Lambda's AZ endpoint) regardless of which service uses which — only the prose explaining *why* was inaccurate. Corrected in the doc, `webhook.test.ts`'s comment, and memory.
2. **§4.1 got IoT Rule → Lambda failure handling backwards.** First draft claimed "IoT topic rules don't retry Lambda-action failures by default; they log to the already-configured `errorLogGroup`." Checked against AWS's own documentation: IoT Rule → Lambda is asynchronous, and the rule considers itself successful the moment Lambda returns a 202 — `errorAction` never fires for a failure *inside* the function, only for a failure in the invoke call itself. Separately confirmed by grepping `api-stack.ts`: no DLQ/`onFailure` destination is configured for `IngestFn`, so Lambda's own default async-retry policy (up to 2 automatic retries) applies instead, each attempt logging to the Lambda's *own* CloudWatch log group (a real trail, just not the one first claimed) before the event is finally dropped uncaught. Corrected — the actual failure mode is worse than originally stated (up to 3 wasted invocations, not 1), not better.
3. **Re-verified, held up:** the no-privilege-escalation-endpoint claim (re-grepped `backend/api/`) and the CI/CD credential-isolation claim (re-checked every workflow's `permissions:` block and trigger).

**Update 2026-07-11 (later same day):** §4.1's telemetry validation finding fixed (commit `ea394ad`) — `sanitizeMetrics()` in `rules.ts`, 6 new tests, verified meaningful the same way as §4.2's fix. §5/§7 updated to match.
