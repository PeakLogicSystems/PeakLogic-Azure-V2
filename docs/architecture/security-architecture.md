# Security Architecture

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.4), [SRS](srs.md) (approved v1.4), [Compliance & Certification Roadmap](compliance-certification-roadmap.md) (approved v1), [Device & Command Security Architecture](device-command-security-architecture.md) (approved v1)
**Last updated:** 2026-07-09

---

## 1. Introduction

### 1.1 Purpose

SRS §5.2 states a security baseline (TLS in transit, encryption at rest, server-enforced RBAC) and explicitly defers "detailed threat modeling and control selection" to this document. Separately, Compliance & Certification Roadmap §4's readiness-gap table flagged several concrete, unresolved items against the Security + Availability + Confidentiality SOC 2 scope it recommended — this document is where the technical ones (MFA enforcement, audit logging implementation) actually get decided, not just re-listed. It also picks up the one explicit carve-out from Device & Command Security Architecture §1.2: "general application security controls not specific to devices/commands."

**Note on SRS §5.2's citation:** that section points to "Security Architecture (#13) and Threat Model (#17)" — Threat Model is actually **#19** per `docs/architecture/README.md`'s authoritative artifact table (the SRS was written before the final list settled). Noted here rather than treated as a reason to reopen SRS — it's a stale label, not a requirement error, and doesn't change what either document is responsible for.

### 1.2 Scope

In scope: identity & access management (Cognito RBAC, MFA enforcement), network security (VPC segmentation, CORS), data protection (encryption at rest/in transit, including a real gap found in the DB connection's TLS config), secrets management, and audit logging **implementation** (AUD-1/AUD-2 are specified and schema-ready but have zero call sites in `backend/` today — closing that gap is this document's job, not a future one).

Out of scope, deliberately: device/command-specific controls (→ Device & Command Security Architecture, #12, already approved), tenant-isolation architecture (→ Multi-Tenant Architecture, #14 — RLS/`withTenant()` are referenced here as an existing control, not redesigned), formal attack-tree/threat-level analysis (→ Threat Model, #19), and organizational/paperwork items from the Compliance Roadmap's gap table that aren't technical controls — incident response *process* ownership, vendor/subprocessor management, change-management evidence, and named compliance owner all stay with SOC 2 Control Mapping & Evidence Plan (#20). This document does include a technical incident-response **skeleton** (§6), since "what does the system let a responder actually do" is an architecture question even though the surrounding process isn't.

---

## 2. Identity & Access Management

### 2.1 Authentication & RBAC (existing, reconciled)

Cognito User Pool (`infra/lib/auth-stack.ts`): admin-invited only (no self-signup), email sign-in, a 12-character password policy with upper/digit/symbol requirements, PKCE flow for the SPA client (no client secret — correct for a public client), 1-hour access/ID token validity, 30-day refresh token validity. `getAuth()`/`requireRole()` (`backend/shared/auth.ts`) enforce role server-side on every call (AUTH-3) — reconciled, no gap.

### 2.2 MFA enforcement — undecided in Compliance Roadmap, decided here

**The gap (from Compliance & Certification Roadmap §4):** MFA is present (`mfa: cognito.Mfa.OPTIONAL`, TOTP only) but enforcement was explicitly left as "needs an explicit decision — not yet made."

**Decision: pool-wide `Mfa.REQUIRED`, not per-role.** Per-role enforcement (e.g., required for `admin`, optional for `operator`) is possible but not natively supported by CDK's `cognito.Mfa` setting — it would require a custom Cognito Lambda trigger (PreAuthentication) checking group membership, real additional complexity for a platform still validating its product thesis with a small number of design-partner tenants (PRD §8). Given the `admin` role already gates the most consequential actions in the system (device decommission today; command issuance in Device & Command Security Architecture §4.1's future design), and MVP tenant counts are small enough that requiring MFA platform-wide isn't an onboarding burden at scale, pool-wide `REQUIRED` gets the real security benefit without the custom-trigger complexity. Revisit per-role granularity only if a genuine `operator`-level friction complaint surfaces.

### 2.3 Real gap found: an orphaned RBAC group

**The gap:** `auth-stack.ts` provisions three Cognito groups — `admin`, `operator`, **and `service_partner`**. But no route anywhere in `backend/` calls `requireRole()` with `'service_partner'` — grep across the entire backend returns zero matches. A user placed in that group today would authenticate successfully and then get a 403 on every single existing endpoint, since every `requireRole()` call lists only `'admin'`/`'operator'`.

**Why this happened:** the group was provisioned in v1.0.0, before the architecture-first governance (2026-07-04) and before User Personas/API Specification settled on how the Field Service Partner actually gets access — a **no-login, opaque-token** pattern (API Specification §5, `/v1/public/tickets/{ticketId}?token=...`), not a Cognito account at all. The group is a leftover from an earlier, different assumption about that persona, not a deliberate design.

**Recommendation: remove the `service_partner` group** as part of code reconciliation once this document is approved — it does nothing today, and API Specification §5's design doesn't need it (the Channel Partner's Attribution Report is also no-login, per the same section). If a genuine in-app, authenticated Service Partner experience is ever scheduled (a real product change, not implied by anything currently approved), re-provisioning the group at that time is trivial — keeping unused dead infrastructure around in the meantime isn't a security hole by itself, but it's exactly the kind of drift a SOC 2 access-review control is supposed to catch, so closing it now is cheap and correct.

---

## 3. Network Security

### 3.1 VPC Segmentation (existing, reconciled)

`infra/lib/network-stack.ts`: Lambdas run in private (egress-only) subnets; RDS sits in a fully isolated subnet with no route to the internet, reachable only from the Lambda security group on port 5432. This is real, structural network isolation, not a security-group allow-list bolted onto a flatter topology — no gap found.

### 3.2 Real gap found: CORS is wide open in infrastructure code

**The gap:** `infra/lib/api-stack.ts`'s API Gateway `defaultCorsPreflightOptions` sets `allowOrigins: apigateway.Cors.ALL_ORIGINS` — with a comment already acknowledging it: `// tighten to your domain in prod`. Any origin can complete a CORS preflight against the API today. This doesn't bypass authentication (Cognito JWT is still required for any endpoint that returns data), but it's an unaddressed, self-flagged TODO sitting in infrastructure code on a platform that's explicitly pursuing SOC 2 — exactly the kind of thing a real security review would catch.

**Recommendation:** restrict `allowOrigins` to the same two origins already treated as the source of truth for this app's valid front-ends — `auth-stack.ts`'s Cognito client `callbackUrls`/`logoutUrls` (`http://localhost:5173`, `https://app.peaklogic.io`). No new decision is required; this is applying a list the codebase already committed to in one place, to a second place that never got updated to match.

### 3.3 WAF — not present, not recommended yet

No AWS WAF is attached to the API Gateway today. At current design-partner-tenant scale (PRD §8), with Cognito auth on every data-touching route and the throttling in §3.4, a WAF's marginal benefit (mainly OWASP-pattern filtering and volumetric abuse protection) doesn't clearly justify its cost/complexity yet. Revisit alongside Threat Model (#19) once real attack-surface analysis exists, or sooner if a specific enterprise deal requires it.

### 3.4 Rate Limiting (existing, reconciled)

API Gateway throttling is already configured (`throttlingBurstLimit: 200`, `throttlingRateLimit: 100`, `api-stack.ts`) — a reasonable MVP-scale default, no gap.

---

## 4. Data Protection

### 4.1 Encryption at Rest / In Transit (existing, mostly reconciled)

RDS storage encryption (`storageEncrypted: true`) and CloudFront/S3 HTTPS enforcement are already in place, matching SRS §5.2's stated baseline. Device-to-cloud (MQTT/TLS) and client-server (HTTPS/TLS) transport encryption are also already correct per CC-1.1 and existing infra — no gap in either.

### 4.2 Real gap found: TLS certificate validation is disabled on the DB connection

**The gap:** `backend/shared/db.ts`'s `Pool` config sets `ssl: { rejectUnauthorized: false }`, with a comment: `// traffic stays in VPC; cert validation optional`. The connection is encrypted, but the Lambda never verifies it's actually talking to the real RDS endpoint and not something else on the network path — the "traffic stays in VPC" argument is about network-layer isolation (§3.1, which is real and correctly implemented), not about the TLS layer, and conflating the two means an encryption-in-transit control that looks complete on paper (SRS §5.2, PRD §6 both say "TLS in transit... reconciled") is weaker in practice than either document currently implies.

**Recommendation:** enable real certificate validation using AWS's published RDS CA bundle (`global-bundle.pem`), bundled into the Lambda deployment and referenced via `ssl: { ca: <bundle>, rejectUnauthorized: true }`. This is a small, mechanical fix — no architectural redesign, no new infrastructure — and closes a gap between what SRS §5.2/PRD §6 already claim as "reconciled" and what the code actually does. Recommended as code-reconciliation follow-up once this document is approved, the same pattern used for Database Schema's `audit_log_entries` fix.

### 4.3 Secrets Management (existing, reconciled)

DB credentials are Secrets-Manager-generated at RDS creation (`rds.Credentials.fromGeneratedSecret`), never hardcoded, fetched at Lambda cold-start and cached for the life of the warm container (`db.ts`'s `getSecret()`), with `grantRead()`-scoped IAM access per function rather than a shared broad policy. No plaintext secret ever appears in Lambda environment variables — only the secret's ARN does (`DB_SECRET_ARN`). No gap found.

---

## 5. Audit Logging — implementing AUD-1/AUD-2 (real gap closed here)

**The gap, previously flagged but not resolved:** Compliance & Certification Roadmap §4 already listed audit logging as "specified, not yet implemented," and Device & Command Security Architecture §7 item 6 restated it as a pre-implementation gate on command issuance specifically. Checking again while writing this document confirms the gap is total, not partial: `audit_log_entries` (Database Schema §4.3) has its table and its append-only trigger, and AUD-1/AUD-2 (SRS §3.10) specify what must be logged — but no code anywhere in `backend/` writes to it. This document is where "someone has to actually build this" stops being deferred.

**Decision: a single `writeAuditLog()` helper in `backend/shared/audit.ts`, called explicitly at each state-changing handler** — not a generic Express-style middleware/interceptor that fires on every request. Reasoning: AUD-1 only requires logging *specific* state-changing administrative actions (device claim, tenant/user config change, channel-partner attribution change — its own examples), not every read or every write; a blanket interceptor would either over-log (every GET) or need its own exclusion list, which is more complexity than explicit call sites at the handful of routes that actually qualify. This mirrors `withTenant()`'s own pattern — a small shared helper, called explicitly where it applies, not injected globally.

**Call sites required at MVP** (derived from AUD-1's own examples plus what's already shipped): `devices.claim` (device claim — AUD-1's named example), `devices.remove` (decommission — arguably the same class of action as claim, and the more consequential of the two), and the future `channel_partners` attribution-assignment path (CH-1.2 — internal-only today, so this call site activates whenever that internal tooling is actually built, not at MVP). **Not required:** ordinary CRUD on sites/assets/tickets — AUD-1's own wording is "state-changing *administrative* actions," and those are routine tenant-operational data, not administrative/security-relevant events.

**Traces forward:** this closes Device & Command Security Architecture §5's audit-logging half of its pre-implementation gate — once `writeAuditLog()` exists and covers device claim/decommission, adding a `issue_command` call site (per that document's §4.4) is a one-line addition to an already-working mechanism, not new infrastructure.

---

## 6. Incident Response — technical skeleton (process ownership stays with #20)

Compliance & Certification Roadmap §4 flagged "no documented, tested incident response plan" as a real SOC 2 Security-criterion gap. The organizational plan itself (who's on call, communication/legal escalation, breach-notification timelines) belongs to SOC 2 Control Mapping & Evidence Plan (#20) — it's process and policy, not architecture. What *is* an architecture question, and is answered here, is: **when an incident happens, what can a responder actually do with the system as built?**

- **Revoke a compromised device:** today, nothing — this is exactly the §3.2 finding already raised in Device & Command Security Architecture ("decommission doesn't revoke the IoT cert"). That fix is a prerequisite for any credible device-incident response, not just a hygiene nit.
- **Revoke a compromised user session:** Cognito supports global sign-out / token revocation per user; not currently wired into any admin-facing tooling (no "force logout" action exists in the API or frontend). Flagged as a real gap (§7).
- **Investigate what happened:** once §5's audit logging ships, `audit_log_entries` becomes the first place a responder looks for admin-action history; CloudWatch Logs (already retained 2 weeks per Lambda, `logs.RetentionDays.TWO_WEEKS` in `api-stack.ts`) is the only other existing forensic source. Two weeks is short for a real investigation window — flagged as a decision to revisit (§7), not changed unilaterally here.

---

## 7. Traceability

| Section | Traces to |
|---|---|
| §2.2 MFA Enforcement | Compliance & Certification Roadmap §4 (open item) |
| §2.3 Orphaned RBAC group | New finding — no existing requirement covers this |
| §3.2 CORS gap | New finding — infra's own TODO comment |
| §4.2 TLS cert validation gap | New finding, in tension with SRS §5.2 / PRD §6's "reconciled" claim |
| §5 Audit Logging implementation | AUD-1, AUD-2 (SRS §3.10), Database Schema §4.3, Device & Command Security Architecture §7 item 6 |
| §6 Incident Response skeleton | Compliance & Certification Roadmap §4 (open item) |

---

## 8. Open Questions

1. **CloudWatch Logs retention (2 weeks) may be too short for real incident investigation** — no decision made here on extending it; flagged for whoever owns the incident-response plan (#20) to weigh against storage cost.
2. **No "force logout" / session-revocation tooling exists** — Cognito supports it at the API level; nothing in `backend/`/frontend exposes it to an admin. Real gap, not yet scheduled.
3. **§2.3's `service_partner` group removal and §3.2's CORS fix and §4.2's TLS cert-validation fix are all recommended but not yet implemented** — code reconciliation follow-up once this document is approved, same pattern as prior artifacts.
4. **§5's audit-logging call sites are MVP-scoped, not exhaustive.** As more admin-facing config/settings screens ship, each new state-changing administrative action needs an explicit `writeAuditLog()` call site added — this document doesn't attempt to enumerate every future one.

---

## 9. Review Log

Not yet reviewed — draft v0.1.
