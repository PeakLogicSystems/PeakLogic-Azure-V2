# Threat Model

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v1.1 (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1 — AWS-native — until v1.1 is approved)
**Depends on:** [Security Architecture](security-architecture.md) (Draft v2.0, pending), [Multi-Tenant Architecture](multi-tenant-architecture.md) (Draft v1.4, pending), [Device & Command Security Architecture](device-command-security-architecture.md) (Draft v2.0, pending), [CI/CD Pipeline](cicd-pipeline.md) (Draft v0.2, pending)

**Last updated:** 2026-07-17
**Fork note (v1.1):** the first amendment specific to the `PeakLogic-Azure` fork — `azure-restructuring-plan.md` item 19 flagged this 🔵 amendment: AWS-specific findings (Lambda async-invocation retry behavior, IMDS-style metadata endpoints) need real, researched Azure equivalents. See Revision History.

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

**Fixed:** `sanitizeMetrics()` added to `rules.ts` (same pure, testable-extraction pattern as `evaluateRules`) — drops any metric whose value isn't a real finite number before it reaches the SQL insert or rule evaluation; `handler.ts` logs what was dropped and returns early if nothing usable remains. Deliberately does **not** range-check plausibility per metric — that needs real, domain-sourced bounds this document doesn't have authority to invent, and wasn't required to close the actual bug. **This mechanism carries forward to Azure unchanged (added v1.1)** — `sanitizeMetrics()`/`rules.ts` are pure application logic with zero AWS-specific dependency, verified by inspection (no IoT Core/Lambda API calls anywhere in that function), so this fix ports directly once the Azure ingest handler exists. **Not fixed, and not part of this change:** the missing DLQ/`onFailure` destination on `IngestFn` — a separate, smaller reliability gap.

**Azure equivalent of the async-invocation/retry finding, verified via real research, not assumed identical (added v1.1).** IoT Hub → Azure Functions (Event Hub/IoT Hub trigger) has a **materially different reliability story than AWS's, not just a renamed one**: Azure Functions' Event Hub-triggered bindings support a real, configurable retry policy (max retry count + backoff, v5.x+ of the Event Hubs extension) — closer to a first-class feature than AWS's default-2-retries-with-no-configuration-hook behavior. **But verified via Microsoft's own architecture guidance: Azure Functions has *no native dead-letter-queue support for Event Hub/IoT Hub triggers at all*** — implementing a DLQ pattern requires hand-written custom logic to detect a poison message and route it to separate storage, a structurally different (and in one sense, more exposed) gap than AWS's "DLQ exists as a checkbox nobody checked" finding. **This means whoever implements the Azure ingest function must design DLQ handling from scratch as a real, first-class piece of work, not "remember to flip a config flag" the way the AWS version's residual gap (§7 item 1) was** — flagged here as a materially different Azure-specific risk shape, not a copy of the AWS finding with new proper nouns.

### 4.2 API Gateway / Lambda — SSRF via ticket webhooks (found and fixed 2026-07-11)

**This is the headline finding of this document — already fixed, not just identified.** `POST /v1/tickets` accepted an arbitrary `webhookUrl` from the request body and called `fetch()` on it with zero validation. Any authenticated `operator`-or-higher user — not a privileged account — could make the VPC-attached Lambda send an outbound request to any destination they chose: internal network reconnaissance, or using the Lambda's AWS egress IP as an abuse relay against a third party. The identical unguarded pattern existed in the ingest handler's tenant-settings-sourced auto-webhook too (not yet API-reachable, but the same code, closed before it becomes live).

**Why this fell through every prior review:** Security Architecture's IAM/CORS/TLS passes and Multi-Tenant Architecture's RLS passes both looked at *inbound* trust boundaries — who can reach this system and what tenant-scoped data they can touch. Nobody had specifically reviewed *outbound* requests the backend itself makes on a caller's behalf. That's precisely the blind spot STRIDE's systematic per-surface pass is supposed to catch, and did.

**Fixed:** `backend/shared/webhook.ts` — a single, tested `postWebhook()` both call sites now share, rejecting anything but `https://` resolving to a public (non-private, non-loopback, non-link-local, non-reserved) address. Explicitly does **not** claim to be a complete DNS-rebinding-proof solution — judged disproportionate to fully close at MVP scale. 29 tests, including a live DNS lookup and confirmation that the entire `169.254.0.0/16` link-local range is rejected.

**Verified for Azure, not assumed to still apply just because the fix predates the fork (added v1.1): this mitigation is fully cloud-agnostic and, more specifically, still directly relevant to Azure's real metadata-credential risk.** Checked via real research, not assumed: **Azure's own Instance Metadata Service (IMDS) lives at the identical address, `169.254.169.254`** — the same well-known link-local address AWS uses, not a different one requiring a separate carve-out. Azure IMDS issues managed-identity OAuth tokens to any unauthenticated process that asks (the only defense being a required `Metadata: true` header, a weak control an SSRF-capable attacker can trivially set) — meaning the exact same class of credential-theft-via-SSRF risk this finding fixed on AWS is equally real, arguably more exposed (Azure's minimal header-only gate vs. AWS IMDSv2's session-token requirement), on whatever Azure compute eventually hosts this backend. **`postWebhook()`'s whole-CIDR `169.254.0.0/16` block (not a curated per-service address list) already covers this without any code change** — the exact design choice that made this fix future-proof against not yet knowing which specific compute service would host the backend now pays off concretely: no rewrite needed when this function is ported to run inside an Azure Function.

**Already covered, cited not repeated:** RLS/tenant isolation (Multi-Tenant Architecture), auth/role enforcement (Security Architecture, Multi-Tenant Architecture §2.3's fail-closed fix), IAM least-privilege (Infrastructure as Code §2.2), no privilege-escalation endpoint exists (checked directly for this document — grepped every route for anything that writes a role/group claim; none exists, role changes are Cognito-console-only, outside the API surface entirely).

### 4.3 CI/CD Pipeline (new surface since #17) — design principle carries over, not yet re-verified for Azure

**The AWS version's isolation principle (a plain `pull_request`-triggered workflow never gets `id-token: write`, so a PR alone can never obtain a cloud credential) is a GitHub Actions permission-model fact, not an AWS-specific one — it applies identically to Entra Workload Identity Federation's `id-token: write` requirement (CI/CD Pipeline §4).** **Not yet re-verified for this fork, added v1.1**: unlike the AWS finding (confirmed by reading real, already-implemented workflow files), no Azure `ci.yml`/`deploy-*.yml` workflows exist yet for this fork to check (CI/CD Pipeline §7) — this section states the design principle that must hold, not a re-confirmed fact, honestly distinguishing "the rule is right" from "the rule was checked against real code," the same distinction this document already draws carefully elsewhere in its own history.

### 4.4 Frontend / CloudFront

Deliberately not deep-reviewed here — Test Strategy §6 already established the frontend runs entirely on mock data, not wired to the real API. A frontend security review (XSS, CSRF against real authenticated endpoints, stored-data handling) is genuinely premature against fixtures that don't reflect real backend behavior; revisit when Test Strategy's own trigger for frontend testing fires (frontend wired to live endpoints).

### 4.5 Denial of Service — shared throttling across tenants

**Already identified, reframed with STRIDE's own vocabulary, not a new finding — unchanged in substance for Azure, added v1.1.** Multi-Tenant Architecture §4 already flagged unbounded resource-sharing as a performance concern; the same fact is a real DoS security finding regardless of cloud — whatever platform-wide throttling Infrastructure as Code (#16) configures on Azure Functions/API layer (Security Architecture §3.4's own "mechanism TBD" for this fork) will be subscription/resource-group-wide, not per-tenant, unless deliberately designed otherwise. Same accepted-for-now MVP posture, same forward pointer to Deployment Architecture (#15).

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

## 6. WAF — decision and reasoning both carry over unchanged, added v1.1

Security Architecture §3.3 (rewritten for Azure — Azure Front Door/Application Gateway WAF, named but not adopted) points here, same as the AWS version's Security Architecture §3.3/cdk-nag citations. **Decision unchanged: still not adopting a WAF, same explicit trigger condition, not an open-ended "revisit later."** The reasoning is entirely product/risk-level, not cloud-specific — identity-provider auth gates every data route regardless of which identity provider, rate limiting is already planned (mechanism TBD, Security Architecture §3.4), and this document's own SSRF finding was an application-logic bug no WAF signature would have caught, true on either cloud. Same concrete trigger to revisit: a specific enterprise security ask, or an observed abuse pattern.

---

## 7. Open Questions

1. ~~§4.1's telemetry value validation~~ **Fixed (commit `ea394ad`, 2026-07-11).** Residual, not fixed here: `IngestFn` still has no DLQ/`onFailure` destination configured — a smaller, separate reliability gap this finding surfaced but didn't require touching to close the actual bug. Worth bundling into whatever eventually addresses Lambda operational hygiene more broadly.
2. **§4.2's SSRF fix has a disclosed, deliberate gap (DNS rebinding)** — accepted residual risk at current scale, not a hidden one; revisit if this system ever handles a threat model where a sophisticated, resourced attacker with API access specifically is a real concern (e.g., ahead of a SOC 2 Type II engagement or an enterprise deal explicitly probing for it).
3. **§6's WAF trigger condition is qualitative, not a metric threshold** — unchanged reasoning; whatever Azure forensic sources (Azure Monitor/Log Analytics, Compliance & Certification Roadmap §4) exist, nothing actively watches them for this specific purpose either.
4. **New, added v1.1: the Azure IoT Hub/Functions DLQ gap (§4.1) is a real, un-scoped piece of implementation work, not a config flag to remember.** Unlike the AWS residual (flip on an already-supported `onFailure` destination), Azure Functions has no native Event Hub/IoT Hub DLQ mechanism at all — whoever implements the Azure ingest function needs to design custom poison-message handling from scratch. Not solved here; flagged as materially more work than its AWS counterpart implied.
5. **New, added v1.1: none of §4.3's CI/CD isolation claim has been re-verified against real Azure workflow files**, since none exist yet — the design principle is stated with confidence, its implementation is not.

---

## 8. Review Log

Reviewed 2026-07-11. Two real technical inaccuracies found and corrected via actual web research (`WebSearch`), not just re-reading — both were specific, checkable AWS-behavior claims this document made confidently and got wrong in the first draft.

1. **§4.2 misidentified which address Lambda uses for credentials.** First draft claimed `169.254.170.2` was "Lambda's own credential-vending address" — that's actually the **ECS/Fargate** task-metadata credential endpoint. Lambda has a separate metadata endpoint at `169.254.100.1:9001` for AZ discovery (not credentials, and already token-protected against SSRF per AWS's own docs) — Lambda's real IAM credentials come via environment variables, not an IMDS-style HTTP fetch at all, which was this document's actual (correct) higher-level point. **The fix itself was never wrong** — blocking the entire `169.254.0.0/16` range catches all three addresses (EC2 IMDS, ECS metadata, Lambda's AZ endpoint) regardless of which service uses which — only the prose explaining *why* was inaccurate. Corrected in the doc, `webhook.test.ts`'s comment, and memory.
2. **§4.1 got IoT Rule → Lambda failure handling backwards.** First draft claimed "IoT topic rules don't retry Lambda-action failures by default; they log to the already-configured `errorLogGroup`." Checked against AWS's own documentation: IoT Rule → Lambda is asynchronous, and the rule considers itself successful the moment Lambda returns a 202 — `errorAction` never fires for a failure *inside* the function, only for a failure in the invoke call itself. Separately confirmed by grepping `api-stack.ts`: no DLQ/`onFailure` destination is configured for `IngestFn`, so Lambda's own default async-retry policy (up to 2 automatic retries) applies instead, each attempt logging to the Lambda's *own* CloudWatch log group (a real trail, just not the one first claimed) before the event is finally dropped uncaught. Corrected — the actual failure mode is worse than originally stated (up to 3 wasted invocations, not 1), not better.
3. **Re-verified, held up:** the no-privilege-escalation-endpoint claim (re-grepped `backend/api/`) and the CI/CD credential-isolation claim (re-checked every workflow's `permissions:` block and trigger).

**Update 2026-07-11 (later same day):** §4.1's telemetry validation finding fixed (commit `ea394ad`) — `sanitizeMetrics()` in `rules.ts`, 6 new tests, verified meaningful the same way as §4.2's fix. §5/§7 updated to match.

---

## Revision History

**v1.1 (2026-07-17)** — the first amendment specific to the `PeakLogic-Azure` fork, per `azure-restructuring-plan.md` item 19: a 🔵 amendment, verifying real Azure equivalents rather than assuming they carry over unchanged.

- **§4.1 amended**: `sanitizeMetrics()`/`rules.ts` confirmed as pure, cloud-agnostic application logic that ports unchanged. **A real, materially different Azure finding, not a renamed AWS one**: Azure Functions has no native DLQ support for Event Hub/IoT Hub triggers at all (verified via Microsoft's own architecture guidance) — a structurally bigger gap than the AWS version's "flip an existing config flag" residual, flagged as real unscoped implementation work.
- **§4.2 amended**: verified via real research that Azure's own Instance Metadata Service lives at the identical `169.254.169.254` address AWS uses, with an arguably weaker default protection (header-only, vs. AWS IMDSv2's session token) — confirming the existing SSRF fix's whole-CIDR `169.254.0.0/16` block already covers Azure's real credential-theft risk with zero code changes needed, a direct payoff of that fix's original design choice not to enumerate specific per-service addresses.
- **§4.3, §4.5, §6 amended**: design principles/decisions restated as cloud-agnostic, with honest disclosure that §4.3's specific claim (no `id-token: write` on PR-triggered workflows) hasn't been re-verified against real Azure CI/CD code, since none exists yet (CI/CD Pipeline §7).
- **§7 gained 2 new items (4–5)**: the Azure DLQ gap's real scope, and the CI/CD claim's unverified status for this fork.
- **What did NOT change**: the WAF decision (§6) and the DoS/shared-throttling framing (§4.5) are product/risk-level judgments, unaffected by the cloud switch — re-read against this rewrite's new findings and confirmed neither needed re-deciding.
