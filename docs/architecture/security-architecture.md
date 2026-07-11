# Security Architecture

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1.1 (amended — see Revision History, end of document)
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.5), [SRS](srs.md) (approved v1.5), [Compliance & Certification Roadmap](compliance-certification-roadmap.md) (approved v1), [Device & Command Security Architecture](device-command-security-architecture.md) (approved v1), [Domain Model](domain-model.md) (approved v1.1), [Database Schema](database-schema.md) (approved v1.1)
**Last updated:** 2026-07-11

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

Cognito User Pool (`infra/lib/auth-stack.ts`): admin-invited only (no self-signup), email sign-in, a 12-character password policy with upper/digit/symbol requirements, PKCE flow for the SPA client (no client secret — correct for a public client), 1-hour access/ID token validity, 30-day refresh token validity. `getAuth()` runs on every call and rejects unauthenticated requests — AUTH-1/AUTH-3's *authentication* half is solidly reconciled.

**Nuance worth stating precisely (see §2.3 for the concrete finding it produces):** AUTH-3 says a user's role "shall be enforced... on every API call," but `requireRole()` is only actually called from write handlers (`create`/`update`/`remove`) — every `list`/`getOne` read handler across every domain (`sites`, `assets`, `devices`, `alerts`, `tickets`, `telemetry`) has no role check at all. This happens to be harmless today only because the two roles that exist in practice (`admin`, `operator`) are both meant to have full read access — there's no third, lower-trust role actually gating anything, so "no restriction" and "restricted to admin+operator" produce the same behavior by coincidence, not by design. It's a **default-allow** pattern on reads (anyone authenticated gets full read access unless a handler explicitly opts into a restriction), not default-deny — which matters the moment a role exists that shouldn't have full read access. It already does — see §2.3.

### 2.2 MFA enforcement — undecided in Compliance Roadmap, decided here

**The gap (from Compliance & Certification Roadmap §4):** MFA is present (`mfa: cognito.Mfa.OPTIONAL`, TOTP only) but enforcement was explicitly left as "needs an explicit decision — not yet made."

**Decision, implemented (commit `2948cc3`, 2026-07-09): pool-wide `Mfa.REQUIRED`, not per-role.** Per-role enforcement (e.g., required for `admin`, optional for `operator`) is possible but not natively supported by CDK's `cognito.Mfa` setting — it would require a custom Cognito Lambda trigger (PreAuthentication) checking group membership, real additional complexity for a platform still validating its product thesis with a small number of design-partner tenants (PRD §8). Given the `admin` role already gates the most consequential actions in the system (device decommission today; command issuance in Device & Command Security Architecture §4.1's future design), and MVP tenant counts are small enough that requiring MFA platform-wide isn't an onboarding burden at scale, pool-wide `REQUIRED` gets the real security benefit without the custom-trigger complexity. Revisit per-role granularity only if a genuine `operator`-level friction complaint surfaces. Verified via `cdk synth`: `MfaConfiguration` is `"ON"` in the synthesized Auth stack template.

**Note on how this slipped through:** this document's own §7 Open Questions originally tracked only the §2.3/§3.2/§4.2 fixes as "not yet implemented," omitting this one — the decision was made in prose but never added to the tracked follow-up list, so it went unshipped for several days after approval. Caught only when the user asked to review what had actually landed versus what the doc decided.

### 2.3 Real gap found: an orphaned RBAC group grants full read access, not "nothing"

**The gap:** `auth-stack.ts` provisions three Cognito groups — `admin`, `operator`, **and `service_partner`**. No route anywhere in `backend/` calls `requireRole()` with `'service_partner'` — grep across the entire backend returns zero matches, confirming it's not deliberately wired to a restricted slice of functionality. **The first draft of this document stated a user in that group would "get a 403 on every single endpoint" — checked against §2.1's finding and confirmed wrong.** Because every read handler (`list`/`getOne` on sites, assets, devices, alerts, tickets, telemetry) has no role check at all, a `service_partner`-group user would authenticate successfully and get **full read access to every tenant's sites, assets, devices, alerts, tickets, and telemetry** — the same read access as `admin`/`operator`. They'd only be blocked on the write endpoints (`create`/`update`/`remove`), which do enumerate roles explicitly. This is a materially worse finding than "does nothing": it's a live, unused account class that — the moment anyone is ever placed in it — gets broad tenant data access nobody decided to grant.

**Why this happened:** the group was provisioned in v1.0.0, before the architecture-first governance (2026-07-04) and before User Personas/API Specification settled on how the Field Service Partner actually gets access — a **no-login, opaque-token** pattern (API Specification §5, `/v1/public/tickets/{ticketId}?token=...`), not a Cognito account at all. The group is a leftover from an earlier, different assumption about that persona, not a deliberate design.

**Recommendation, implemented (commit `3428f80`, 2026-07-09): removed the `service_partner` group.** API Specification §5's design doesn't need it (the Channel Partner's Attribution Report is also no-login, per the same section), and given the corrected finding above, leaving it costs more than "unused infrastructure" — it's a dormant path to unintended full tenant-data read access. If a genuine in-app, authenticated Service Partner experience is ever scheduled (a real product change, not implied by anything currently approved), re-provisioning the group at that time is trivial and should be paired with deliberate read scoping, not the default-allow pattern this closed.

### 2.4 Channel Partner Portal Authentication *(new — added v1.1, see Revision History)*

Database Schema §4.4 built the real cross-tenant RLS mechanism (`channel_partner_isolation`/`channel_partner_read` policies, keyed on `app.current_channel_partner_id`/`app.current_channel_partner_user_id`/`app.current_channel_partner_role`) but explicitly left the auth/API-layer wiring open — "the application code that actually sets [those session variables] per request... doesn't exist yet." This section resolves that, and ships the code, not just the design.

**Decision: a genuinely separate Cognito User Pool (`PartnerPool`), not a second set of groups in the tenant pool.** A `ChannelPartnerUser` is not a `User` (Domain Model §2.7) — no `tenant_id`, a different table entirely. Mixing a `custom:channel_partner_id` claim into the same JWT shape `getAuth()` already parses for tenant sessions would either require `getAuth()` to branch on which kind of identity it received (fragile, easy to get wrong) or a second claims contract living inside the same pool (confusing). A separate pool keeps the two identity spaces as clearly apart in infrastructure as they already are in the data model. Implemented in `infra/lib/auth-stack.ts` (`AuthStack.partnerPool`/`partnerPoolClient`), verified via `cdk synth`.

**Decision: no Cognito groups in the partner pool — role is resolved from `channel_partner_users.role` at request time, not from a Cognito claim.** This is a deliberate difference from the tenant pool's pattern (role from `cognito:groups`), not an inconsistency: `withChannelPartner()` (below) already has to query `channel_partner_users` to resolve `channel_partner_user_id`, which has no Cognito equivalent at all — so the "avoid an extra DB round-trip" rationale that justifies the tenant pool's groups-based approach doesn't apply here, the round-trip is already happening. Deriving role from the same query avoids a second, independently-driftable source of truth (a Cognito group and a DB column that could disagree) for no cost. `channel_partner_users.role` was already the authorization-relevant source of truth for territory/route scoping (Database Schema §4.4); this just makes it authoritative for role too.

**Same security baseline as the tenant pool, not a lighter one**: pool-wide `Mfa.REQUIRED` (§2.2's reasoning applies identically — no reason a second pool gets weaker protection), 12-character password policy, admin-invited only (`selfSignUpEnabled: false`) — mirrors Domain Model §4 decision 8's "provisioning is `partner_admin`-initiated" requirement structurally, not just by convention.

**`backend/shared/auth.ts` gains `getPartnerAuth()`**, mirroring `getAuth()`'s shape and fail-closed discipline (missing `sub` → 401; missing `custom:channel_partner_id` → 403) but returning only `{ sub, email, channelPartnerId }` — no role, no `channel_partner_user_id`, since those are resolved from the DB, not the token.

**`backend/shared/db.ts` gains `withChannelPartner()`**, mirroring `withTenant()`'s transaction-scoped-session-variable pattern:
```ts
export async function withChannelPartner<T>(
  auth: PartnerAuthContext,
  fn: (client: PoolClient, session: ChannelPartnerSession) => Promise<T>,
): Promise<T> {
  const client = await (await getPool()).connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.current_channel_partner_id = $1', [auth.channelPartnerId]);

    const { rows: [cpu] } = await client.query(
      'SELECT id, role FROM channel_partner_users WHERE cognito_sub = $1', [auth.sub],
    );
    if (!cpu) throw Object.assign(new Error('Channel partner user not found'), { statusCode: 403 });

    await client.query('SET LOCAL app.current_channel_partner_user_id = $1', [cpu.id]);
    await client.query('SET LOCAL app.current_channel_partner_role = $1', [cpu.role]);

    const result = await fn(client, { channelPartnerUserId: cpu.id, role: cpu.role });
    await client.query('COMMIT');
    return result;
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
```

**A real ordering bug caught while designing this, not found empirically after shipping it**: `app.current_channel_partner_id` must be set **before** the `channel_partner_users` lookup, not after — that table's own `channel_partner_isolation` policy (Database Schema §4.4) requires it to already be set, or the lookup silently returns zero rows (RLS-filtered, not an error) and this function would incorrectly reject a valid partner user as "not found." This is the same category of subtle RLS-bootstrapping issue as the `missing_ok` bug Database Schema's review pass found — caught here by tracing the actual evaluation order before writing the test, not discovered by a failing test after the fact.

**`requirePartnerRole()` added alongside `withChannelPartner()`, mirroring `requireRole()`** — RLS enforces cross-partner data isolation, not within-partner role authorization (a technician's session is already correctly territory-scoped by RLS, but nothing stops it from attempting to confirm a route, which TR-3.1 reserves for a `partner_admin`). Same reason `requireRole()` exists alongside `withTenant()` on the tenant side.

**Real gap found while designing this section, fixed rather than compounded**: `writeAuditLog()` (§5) was **designed** in the original v1 of this document but **never actually implemented** — no `backend/shared/audit.ts` file existed, confirmed by direct search, despite §5's own text claiming "real gap closed here." Building the channel-partner audit extension required the base function to exist first, so it's implemented now, for both scope dimensions `audit_log_entries` supports (Database Schema §4.4's `tenant`/`channel_partner` split) — see the updated §5 below.

**Verified, not assumed**: `cdk synth -c stage=dev` succeeds with the new `PartnerPool` construct; `npm run typecheck` passes in `backend/` with the new `auth.ts`/`db.ts`/`audit.ts` code; 8 new unit tests (`db.test.ts`, `audit.test.ts`) and 7 new integration tests (`db.integration.test.ts`, gated on `TEST_DATABASE_URL` per Test Strategy §4 — self-skips cleanly here, same disclosed limitation as every other DB-dependent test this project has, since no AWS account/Postgres instance exists yet) all pass or skip as expected. The integration tests specifically exercise: a `partner_admin` reading across every tenant attributed to their partner; a technician correctly restricted to sites within their assigned territory via a real `ST_Contains()` check (not just unit-tested logic); a technician correctly denied a site outside their territory; a tenant belonging to a *different* channel partner (or none) staying invisible even to a `partner_admin`; the bootstrapping-order fix itself; and that a normal tenant session's behavior is provably unaffected by any of this.

---

## 3. Network Security

### 3.1 VPC Segmentation (existing, reconciled)

`infra/lib/network-stack.ts`: Lambdas run in private (egress-only) subnets; RDS sits in a fully isolated subnet with no route to the internet, reachable only from the Lambda security group on port 5432. This is real, structural network isolation, not a security-group allow-list bolted onto a flatter topology — no gap found.

### 3.2 Real gap found: CORS is wide open in infrastructure code

**The gap:** `infra/lib/api-stack.ts`'s API Gateway `defaultCorsPreflightOptions` sets `allowOrigins: apigateway.Cors.ALL_ORIGINS` — with a comment already acknowledging it: `// tighten to your domain in prod`. Any origin can complete a CORS preflight against the API today. This doesn't bypass authentication (Cognito JWT is still required for any endpoint that returns data), but it's an unaddressed, self-flagged TODO sitting in infrastructure code on a platform that's explicitly pursuing SOC 2 — exactly the kind of thing a real security review would catch.

**Recommendation, implemented (commit `3428f80`, 2026-07-09):** `allowOrigins` now reuses the same two origins already treated as the source of truth for this app's valid front-ends — `auth-stack.ts`'s Cognito client `callbackUrls`/`logoutUrls` (`http://localhost:5173`, `https://app.peaklogic.io`) — via a new shared `infra/lib/allowed-origins.ts`, so the two configs can't independently drift apart the way they had.

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

**Recommendation, implemented (commit `3428f80`, 2026-07-09):** real certificate validation now enabled using AWS's published RDS CA bundle, downloaded from `truststore.pki.rds.amazonaws.com` and committed at `backend/shared/certs/rds-global-bundle.pem` (a `.gitignore` exception was needed — the file collided with the blanket `*.pem` secrets rule despite holding no private key material). `db.ts` loads it via `ssl: { ca: RDS_CA_BUNDLE, rejectUnauthorized: true }`; `api-stack.ts`'s bundling gained an `afterBundling` hook to copy the file alongside both Lambdas' bundled output, since esbuild only traces imports, not runtime `fs.readFileSync` targets. Closes the gap between what SRS §5.2/PRD §6 already claimed as "reconciled" and what the code actually did.

### 4.3 Secrets Management (existing, reconciled)

DB credentials are Secrets-Manager-generated at RDS creation (`rds.Credentials.fromGeneratedSecret`), never hardcoded, fetched at Lambda cold-start and cached for the life of the warm container (`db.ts`'s `getSecret()`), with `grantRead()`-scoped IAM access per function rather than a shared broad policy. No plaintext secret ever appears in Lambda environment variables — only the secret's ARN does (`DB_SECRET_ARN`). No gap found.

---

## 5. Audit Logging — implementing AUD-1/AUD-2

**The gap, previously flagged but not resolved:** Compliance & Certification Roadmap §4 already listed audit logging as "specified, not yet implemented," and Device & Command Security Architecture §7 item 6 restated it as a pre-implementation gate on command issuance specifically. Checking again while writing this document (2026-07-09) confirmed the gap was total, not partial: `audit_log_entries` (Database Schema §4.3) had its table and its append-only trigger, and AUD-1/AUD-2 (SRS §3.10) specify what must be logged — but no code anywhere in `backend/` wrote to it.

**Design decision (2026-07-09): a single `writeAuditLog()` helper in `backend/shared/audit.ts`, called explicitly at each state-changing handler** — not a generic Express-style middleware/interceptor that fires on every request. Reasoning: AUD-1 only requires logging *specific* state-changing administrative actions (device claim, tenant/user config change, channel-partner attribution change — its own examples), not every read or every write; a blanket interceptor would either over-log (every GET) or need its own exclusion list, which is more complexity than explicit call sites at the handful of routes that actually qualify. This mirrors `withTenant()`'s own pattern — a small shared helper, called explicitly where it applies, not injected globally.

**Correction, v1.1 (2026-07-11): the design above was never actually built.** This document's v1 text said "real gap closed here" and cited the design as the closure — but `backend/shared/audit.ts` never existed, confirmed by direct search while designing §2.4's channel-partner audit extension, which needed the base function to build on. **Implemented for real now**, not left as a second unshipped promise: `writeAuditLog()` exists, takes a discriminated-union `AuditEntry` (`scope: 'tenant'` or `scope: 'channel_partner'`, matching Database Schema §4.4's dual-scope `audit_log_entries` shape), and is covered by 4 unit tests (`audit.test.ts`) verifying the correct `INSERT` shape per scope, JSON serialization of `prior_value`/`new_value`, and that a null actor (system-triggered entry) is accepted on either scope.

**Call sites required at MVP** (derived from AUD-1's own examples plus what's already shipped): `devices.claim` (device claim — AUD-1's named example), `devices.remove` (decommission — arguably the same class of action as claim, and the more consequential of the two), the future `channel_partners` attribution-assignment path (CH-1.2 — internal-only today), and — **added v1.1** — the channel-partner-scoped equivalents: a `partner_admin` creating a technician's credential (Domain Model §4 decision 8's "provisioning is admin-initiated"), and route confirmation (TR-3.1). **Not required:** ordinary CRUD on sites/assets/tickets, or an AI-suggested route's *generation* (only its *confirmation* is an administrative action — the suggestion itself is closer to a computed value than an action someone took).

**Still not wired into any actual route handler** — `writeAuditLog()` exists and is tested in isolation, but no `devices.claim`/`devices.remove`/route-confirmation handler calls it yet. This is real, disclosed scope: this document specifies the mechanism and the call-site list; wiring each call site into its handler is Implementation-phase work (project memory), the same deferral this document already applied to itself once and is not repeating silently this time.

**Traces forward:** this closes Device & Command Security Architecture §5's audit-logging half of its pre-implementation gate — once call sites exist for device claim/decommission, adding a `issue_command` call site (per that document's §4.4) is a one-line addition to an already-working, already-tested mechanism, not new infrastructure.

---

## 6. Incident Response — technical skeleton (process ownership stays with #20)

Compliance & Certification Roadmap §4 flagged "no documented, tested incident response plan" as a real SOC 2 Security-criterion gap. The organizational plan itself (who's on call, communication/legal escalation, breach-notification timelines) belongs to SOC 2 Control Mapping & Evidence Plan (#20) — it's process and policy, not architecture. What *is* an architecture question, and is answered here, is: **when an incident happens, what can a responder actually do with the system as built?**

- **Revoke a compromised device:** today, nothing — this is exactly the §3.2 finding already raised in Device & Command Security Architecture ("decommission doesn't revoke the IoT cert"). That fix is a prerequisite for any credible device-incident response, not just a hygiene nit.
- **Revoke a compromised user session:** Cognito supports global sign-out / token revocation per user; not currently wired into any admin-facing tooling (no "force logout" action exists in the API or frontend). Flagged as a real gap (§7).
- **Investigate what happened:** `writeAuditLog()` exists now (§5), but with no call sites wired in yet, `audit_log_entries` won't actually have rows to investigate until that follow-up work lands — the mechanism shipped, the coverage didn't. CloudWatch Logs (already retained 2 weeks per Lambda, `logs.RetentionDays.TWO_WEEKS` in `api-stack.ts`) is the only currently-populated forensic source. Two weeks is short for a real investigation window — flagged as a decision to revisit (§7), not changed unilaterally here.

---

## 7. Traceability

| Section | Traces to |
|---|---|
| §2.2 MFA Enforcement | Compliance & Certification Roadmap §4 (open item) |
| §2.3 Orphaned RBAC group | New finding — no existing requirement covers this |
| §3.2 CORS gap | New finding — infra's own TODO comment |
| §4.2 TLS cert validation gap | New finding, in tension with SRS §5.2 / PRD §6's "reconciled" claim |
| §5 Audit Logging implementation | AUD-1, AUD-2 (SRS §3.10), Database Schema §4.3/§4.4, Device & Command Security Architecture §7 item 6 |
| §6 Incident Response skeleton | Compliance & Certification Roadmap §4 (open item) |
| §2.4 Channel Partner Portal Authentication *(added v1.1)* | Domain Model §2.7/§4 decision 8, Database Schema §4.4, PRD §5.10/SRS §3.12 (TR-1–TR-3) |

---

## 8. Open Questions

1. **CloudWatch Logs retention (2 weeks) may be too short for real incident investigation** — no decision made here on extending it; flagged for whoever owns the incident-response plan (#20) to weigh against storage cost.
2. **No "force logout" / session-revocation tooling exists** — Cognito supports it at the API level; nothing in `backend/`/frontend exposes it to an admin. Real gap, not yet scheduled.
3. ~~§2.3's `service_partner` group removal and §3.2's CORS fix and §4.2's TLS cert-validation fix are all recommended but not yet implemented~~ **Done (commit `3428f80`, 2026-07-09).** All three reconciled in code and verified via a real `cdk synth` — which also surfaced and fixed an unrelated pre-existing bug: `NodejsFunction` couldn't resolve its bundling root against entry files in the sibling `backend/` directory (`projectRoot`/`depsLockFilePath` now pinned explicitly in `api-stack.ts`, `esbuild` added as a `backend/` devDependency). The RDS CA bundle (`backend/shared/certs/rds-global-bundle.pem`) required a `.gitignore` exception, since it collided with the blanket `*.pem` secrets rule despite containing no private key material.
4. **§5's audit-logging call sites are MVP-scoped, not exhaustive.** As more admin-facing config/settings screens ship, each new state-changing administrative action needs an explicit `writeAuditLog()` call site added — this document doesn't attempt to enumerate every future one.
5. **§5's audit-logging call sites are not wired into any handler yet, added v1.1.** `writeAuditLog()` exists and is unit-tested, but `devices.claim`/`devices.remove`/the future channel-partner call sites don't call it. Real, disclosed follow-up work, not assumed done because the helper exists.
6. **The partner portal frontend doesn't exist yet, added v1.1.** `PartnerPool`'s client reuses the tenant SPA's `ALLOWED_ORIGINS` (§2.4) since there's no separate partner-portal URL to point at — revisit once that frontend is actually built (project memory, sequenced after API Specification).
7. **No API Gateway routes or Cognito authorizer exist yet for the partner pool, added v1.1.** This document resolves the identity/session mechanism (`getPartnerAuth()`, `withChannelPartner()`); wiring an authorizer to actual REST endpoints is API Specification's (#11) job, the next artifact in this amendment's sequence — there's nothing to attach an authorizer to until routes are defined.
8. **None of §2.4's new code has run against a real database or a real Cognito pool, added v1.1.** `cdk synth` succeeded and unit tests pass, but the integration tests exercising real RLS behavior (`db.integration.test.ts`) self-skip here (no `TEST_DATABASE_URL`) — same standing, disclosed limitation as every other DB-dependent test in this project (no AWS account exists yet, `mvp-roadmap.md` Blocker #1).

---

## 9. Review Log

Reviewed 2026-07-09. One substantive factual error found and fixed — worse than a citation nit, since it understated a real gap's severity.

1. **§2.3 was factually wrong about the orphaned `service_partner` group's actual impact.** The first draft claimed a user in that group would be blocked ("403 on every endpoint") because no `requireRole()` call lists it. Re-checking every route handler (`sites.ts`, `assets.ts`, `devices.ts`, `alerts.ts`, `tickets.ts`, `telemetry.ts`) shows `list`/`getOne` handlers never call `requireRole()` at all — role is only checked on writes. So a `service_partner`-group user would actually get full read access to every tenant-scoped resource, not a wall of 403s. Corrected §2.3, and added the general pattern this reveals (default-allow on reads, not default-deny) as an explicit nuance in §2.1 rather than letting §2.1 keep claiming AUTH-3 is fully "reconciled, no gap."
2. **Re-verified, held up:** the CORS `ALL_ORIGINS` finding (§3.2), the `rejectUnauthorized: false` TLS finding (§4.2), and the zero-call-sites audit-logging gap (§5) were all re-checked directly against the cited files during this pass and are accurate as originally written.

**v1.1, reviewed 2026-07-11.** One real discrepancy found in this document's own prior claims, not a new external finding — worse in kind than a citation nit, since it's this document contradicting itself.

3. **§5's original "real gap closed here" claim was false — the design was never implemented.** Direct search for `writeAuditLog`/`backend/shared/audit.ts` while designing §2.4's channel-partner audit extension found neither existed. The v1 text should have said "designed here," not "closed here." Fixed by actually implementing `writeAuditLog()` now (with real unit tests), and by rewording §5 to distinguish "the mechanism exists" from "call sites are wired in" — the former is now true, the latter still isn't (§8 item 5), and the rewrite makes sure that distinction survives instead of being flattened back into an overclaim a second time.
4. **Verified, not assumed:** `cdk synth -c stage=dev` succeeds with the new `PartnerPool` construct (checked directly, not inferred from the CDK code reading correctly); `backend/`'s full test suite (65 tests) and typecheck pass with the new `auth.ts`/`db.ts`/`audit.ts` additions; the integration test file (11 tests total, 7 new) loads and self-skips cleanly under `npm run test:integration` without `TEST_DATABASE_URL` set, confirming the new test code is structurally valid even though it can't run against a real Postgres in this environment.
5. **A real ordering bug caught while designing `withChannelPartner()`, not found by a failing test after the fact**: the first mental draft queried `channel_partner_users` before setting `app.current_channel_partner_id`, which would have silently returned zero rows (RLS-filtered) rather than erroring — incorrectly rejecting every valid partner user as "not found." Caught by tracing the RLS evaluation order against Database Schema §4.4's actual policy definitions before writing any code, and specifically regression-tested (`db.integration.test.ts`'s "bootstrapping-order fix" test).

---

## Revision History

**v1.1 (2026-07-11)** — forced by the PRD v1.5/SRS v1.5/Domain Model v1.1/Database Schema v1.1 amendment (channel-partner portal), per this document's own governing pattern (every prior artifact this session amends explicitly rather than silently diverging) — Database Schema §4.4 explicitly left the auth/API-layer mechanism open for this document to resolve.

- **§2.4 added**: a separate Cognito `PartnerPool` (`infra/lib/auth-stack.ts`), `getPartnerAuth()` (`backend/shared/auth.ts`), `withChannelPartner()` + `requirePartnerRole()` (`backend/shared/db.ts`) — real, tested code, not just a design narrative. Deliberately no Cognito groups in the new pool; role is resolved from `channel_partner_users.role` at request time instead, a documented divergence from the tenant pool's groups-based pattern, not an inconsistency.
- **§5 corrected, not just extended**: found that v1's "real gap closed here" claim for `writeAuditLog()` was false — the design existed, the code never did. Implemented for real now, extended to `audit_log_entries`' new dual-scope shape (Database Schema §4.4), with the call-site list extended for the two new channel-partner administrative actions (credential creation, route confirmation).
- **A real RLS-bootstrapping ordering bug caught and fixed during design** (§2.4, §9 item 5): `app.current_channel_partner_id` must be set before the `channel_partner_users` lookup, or that lookup is silently RLS-filtered to zero rows.
- **Verified via `cdk synth`, `npm run typecheck`, and the full backend test suite** (65 unit tests + 11 integration tests, the latter self-skipping cleanly without a real database) — not merely written and assumed correct.
- **Explicitly not resolved in this pass** (tracked in `project-peaklogic-channel-partner-portal` memory): no API Gateway routes or Cognito authorizer exist yet for the partner pool (nothing to attach one to until API Specification defines routes); `writeAuditLog()`'s new call sites aren't wired into any handler yet; none of this has run against a real database or Cognito pool (no AWS account exists yet).
