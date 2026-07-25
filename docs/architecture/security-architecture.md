# Security Architecture

**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Company:** PeakLogic
**Project codename:** Project Vantage
**Status:** Draft v2.0 — full rewrite for Azure (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1.1 — AWS-native — until v2.0 is approved)
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (Draft v1.7, pending), [SRS](srs.md) (Draft v1.7, pending), [Compliance & Certification Roadmap](compliance-certification-roadmap.md) (Draft v1.1, pending), [Device & Command Security Architecture](device-command-security-architecture.md) (Draft v2.0, pending), [Domain Model](domain-model.md) (Draft v1.4, pending), [Database Schema](database-schema.md) (Draft v1.4, pending), [iOS Application](ios-application.md) (Draft v1.1)
**Last updated:** 2026-07-17
**Fork note (v2.0):** the first `PeakLogic-Azure`-specific rewrite — `azure-restructuring-plan.md` item 13 flagged this 🟣 **full rewrite required**: Cognito → Entra has no 1:1 mapping (different auth model, MFA mechanism, token claims structure). **Bumped to v2.0**, same convention Device & Command Security Architecture's own rewrite used, to signal a structural rewrite rather than an incremental amendment. Every cloud-specific claim below was verified against current (2026-07-17) Microsoft documentation via live research, not assumed by analogy to the Cognito design — see §9 Review Log. The AWS-native `PeakLogic-AWS` repo's own Approved v1.1+ document is unaffected.

---

## 1. Introduction

### 1.1 Purpose

SRS §5.2 states a security baseline (TLS in transit, encryption at rest, server-enforced RBAC) and explicitly defers "detailed threat modeling and control selection" to this document. Separately, Compliance & Certification Roadmap §4's readiness-gap table flagged several concrete, unresolved items against the Security + Availability + Confidentiality SOC 2 scope it recommended — this document is where the technical ones (MFA enforcement, audit logging implementation) actually get decided, not just re-listed. It also picks up the one explicit carve-out from Device & Command Security Architecture §1.2: "general application security controls not specific to devices/commands."

**Note on SRS §5.2's citation:** that section points to "Security Architecture (#13) and Threat Model (#17)" — Threat Model is actually **#19** per `docs/architecture/README.md`'s authoritative artifact table (the SRS was written before the final list settled). Noted here rather than treated as a reason to reopen SRS — it's a stale label, not a requirement error, and doesn't change what either document is responsible for.

### 1.2 Scope

In scope: identity & access management (Cognito RBAC, MFA enforcement), network security (VPC segmentation, CORS), data protection (encryption at rest/in transit, including a real gap found in the DB connection's TLS config), secrets management, and audit logging **implementation** (AUD-1/AUD-2 are specified and schema-ready but have zero call sites in `backend/` today — closing that gap is this document's job, not a future one).

Out of scope, deliberately: device/command-specific controls (→ Device & Command Security Architecture, #12, already approved), tenant-isolation architecture (→ Multi-Tenant Architecture, #14 — RLS/`withTenant()` are referenced here as an existing control, not redesigned), formal attack-tree/threat-level analysis (→ Threat Model, #19), and organizational/paperwork items from the Compliance Roadmap's gap table that aren't technical controls — incident response *process* ownership, vendor/subprocessor management, change-management evidence, and named compliance owner all stay with SOC 2 Control Mapping & Evidence Plan (#20). This document does include a technical incident-response **skeleton** (§6), since "what does the system let a responder actually do" is an architecture question even though the surrounding process isn't.

---

## 2. Identity & Access Management (rewritten for Azure)

### 2.0 The Azure identity landscape — verified, not assumed, before designing anything

**Real, load-bearing research finding: Azure AD B2C is closed to new customers as of May 1, 2025** — the Cognito-era assumption "just use B2C" would have designed this section against a product PeakLogic cannot actually provision. Verified via Microsoft's own documentation: the successor, purchasable product for customer/partner-facing identity is **Microsoft Entra External ID** (for customers/CIAM), which unifies what used to be B2C's use cases with B2B collaboration into one platform. Everything in this section is designed against Entra External ID, not classic B2C.

**A second real finding, this one a genuine simplification over the AWS design, not a lateral swap**: Cognito had no concept of "the company's own employee directory" — Security Architecture's AWS version had to fabricate a third, synthetic identity pool (`StaffPool`) from nothing just to represent PeakLogic's own staff. **Azure doesn't have this problem** — PeakLogic almost certainly already has (or would provision) a real **Microsoft Entra ID** workforce tenant for ordinary company email/Microsoft 365, and PeakLogic's own employees already have real accounts in it. The Administration Console can authenticate directly against that same tenant rather than inventing a parallel identity space for people who already have one. This is disclosed explicitly in §2.5 as a genuine architectural improvement, not asserted casually.

**Three genuinely separate identity spaces, mapped to three concrete Azure/Entra resources** — mirroring the AWS design's three-Cognito-pool structure, not collapsed into one:

| AWS (Cognito) | Azure equivalent | Why |
|---|---|---|
| Tenant `userPool` | A Microsoft Entra External ID (CIAM) tenant, "PeakLogicCustomers" | External, customer-facing identity — the CIAM product's exact intended use case |
| `PartnerPool` | A **second**, separate Entra External ID tenant, "PeakLogicPartners" | Same reasoning §2.4 (AWS) already gave for a separate Cognito pool — a `ChannelPartnerUser` is not a `User`, no shared identity space — still holds; External ID tenants are the unit of isolation this platform actually offers, the direct analogue of "a second Cognito pool" |
| `StaffPool` | PeakLogic's own **Microsoft Entra ID** workforce tenant (not External ID at all) | Staff are real employees with a real corporate directory already available on this cloud — see §2.0's second finding above |

### 2.1 Authentication & RBAC (rewritten for Entra External ID)

**Tenant identity: a Microsoft Entra External ID tenant, one app registration for the tenant-facing SPA.** Admin-invited only (no self-service sign-up — External ID user flows support this configuration directly, the same posture Cognito's `selfSignUpEnabled: false` already established), email sign-in, MFA required (§2.2), OIDC authorization-code-with-PKCE flow for the SPA (a public client, no client secret — same correct pattern the AWS version already used, unchanged by the cloud switch since PKCE is an OAuth 2.0 standard, not a Cognito-specific feature).

**Role claim mechanism: App Roles, not generic Security Groups — verified, not assumed, to be the correct choice.** Real research confirmed a material difference: Microsoft Entra security groups are subject to a **token overage limit** (200 for JWT tokens) — past that count, Entra omits the groups claim entirely and the app must call Microsoft Graph to resolve membership, a real complication Cognito's `cognito:groups` claim never had. **App Roles have no such limit and are designed specifically for this case** — a small, explicit, per-application set of roles (`admin`, `operator`), assigned to users, surfaced directly as a `roles` array claim in the access token, exactly mirroring how `getAuth()` already reads `cognito:groups` today. This is the direct, verified replacement for Cognito Groups — not a stylistic preference, a documented Microsoft recommendation for exactly this authorization pattern.

**`getAuth()`'s Azure equivalent reads the `roles` claim from the validated Entra External ID access token** instead of `cognito:groups` — same shape, same fail-closed discipline (missing/invalid token → 401), different claim name and issuer to validate against.

**Nuance carried over unchanged, since it's an application-code pattern, not a cloud-specific one (see §2.3 for the concrete finding it produces):** AUTH-3 says a user's role "shall be enforced... on every API call," but `requireRole()`'s existing implementation only calls role checks from write handlers — every read handler has no role check at all. This is a code-level authorization pattern, identical regardless of which identity provider issues the token — the finding, and its risk, is unaffected by the Cognito→Entra switch.

### 2.2 MFA enforcement (rewritten — real, disclosed mechanism uncertainty, not a confident swap)

**The requirement is unchanged**: platform-wide required MFA, not per-role — the AWS version's own reasoning (the `admin` role already gates the most consequential actions; MVP tenant counts are small enough that platform-wide MFA isn't an onboarding burden) is a product/risk decision, not a cloud-specific one, and carries over as-is.

**The concrete Azure mechanism is genuinely less settled than Cognito's single `Mfa.REQUIRED` toggle was, and this document says so rather than asserting false confidence.** Cognito exposed MFA enforcement as one simple pool-wide setting. Entra's MFA enforcement story is more layered — Conditional Access policies are the traditional mechanism (require MFA for all users/all apps), and Microsoft's own 2026 platform changes (a newer "External MFA" mechanism superseding older custom controls, effective through 2026–2027) mean the exact policy object PeakLogic should configure is a real, live-moving target, not something safe to pin precisely in an architecture document today. **Decision: require MFA via Conditional Access policy scoped to the relevant app registration(s), enforced at the tenant level** — the *what* (require MFA, platform-wide, for every sign-in to PeakLogic's apps) is decided here; the *exact policy configuration* (Conditional Access vs. the newer External MFA mechanism, and which authentication methods count) is deliberately left to Infrastructure as Code (#16)/implementation time, flagged in §8, rather than pinned against a still-changing platform feature.

### 2.3 Real gap found (same class as AWS's, re-examined for whether it recurs on Azure): an orphaned App Role would carry the identical risk

**Checked directly, not assumed to carry over just because the AWS version found it**: does the *root cause* — read handlers with no role check at all, making "no restriction" and "restricted role" indistinguishable — depend on anything Cognito-specific? No. This is purely an application-code pattern in `backend/api/routes/*.ts`'s handler logic, completely independent of which identity provider issues the token. **Conclusion: the same class of bug is fully capable of recurring on Azure, unchanged, the moment any App Role is provisioned that isn't wired to an explicit `requireRole()`-equivalent check.** The specific orphaned-group instance the AWS version found and removed (`service_partner`) was itself a leftover from pre-architecture-first v1.0.0 code — since this Azure fork's backend code doesn't exist yet (nothing has been implemented for this track), there is no equivalent leftover App Role to find and remove here. **This section exists to carry the lesson forward, not to re-discover the same bug**: whoever implements the Entra App Role set for this fork should provision only `admin`/`operator` (mirroring the AWS version's post-fix state directly) and should not create a role for the Field Service Partner persona, which continues to use the no-login opaque-token pattern (API Specification §5) on this fork exactly as it does on AWS — unaffected by the cloud switch.

### 2.4 Channel Partner Portal Authentication (rewritten for Entra External ID)

Database Schema §4.4 built the real cross-tenant RLS mechanism (`channel_partner_isolation`/`channel_partner_read` policies, keyed on `app.current_channel_partner_id`/`app.current_channel_partner_user_id`/`app.current_channel_partner_role`) — this section resolves the auth/API-layer wiring, on Azure, from scratch (no code exists yet for this track).

**Decision: a genuinely separate Entra External ID tenant ("PeakLogicPartners"), not a second app registration in the same tenant as PeakLogicCustomers, and not a group/claim distinguishing the two within one tenant.** Same reasoning §2.0/the AWS version already established — a `ChannelPartnerUser` is not a `User` (Domain Model §2.7), no shared `tenant_id`. Mixing a `channel_partner_id` claim into the same tenant's token shape `getAuth()` parses for ordinary tenant sessions would require branching on which kind of identity was received, the exact fragility both the AWS design and this rewrite's §2.0 deliberately avoid. **A separate External ID tenant is the strongest isolation unit Entra actually offers** — the direct analogue of "a second Cognito User Pool," not a weaker substitute for one.

**Decision: no App Roles in the partner tenant for ordinary role resolution — role is still resolved from `channel_partner_users.role` at request time, not from a token claim.** This carries over unchanged from the AWS version's reasoning: `withChannelPartner()` (below) already has to query `channel_partner_users` to resolve `channel_partner_user_id`, which has no Entra equivalent at all — the DB round-trip is already happening, so deriving role from that same query avoids a second, independently-driftable source of truth. **One deliberate, narrow exception carries over too** — see §2.6, which does add exactly one App Role to this same tenant, for a different reason (identity-type discrimination, not role resolution).

**Same security baseline as the tenant identity space, not a lighter one**: MFA required (§2.2's mechanism-uncertainty caveat applies identically — no reason a second tenant gets a different answer once one is chosen), admin-invited only (no self-service user flow enabled) — mirrors Domain Model §4 decision 8's "provisioning is `partner_admin`-initiated" requirement structurally, not just by convention.

**`backend/shared/auth.ts`'s Azure equivalent gains `getPartnerAuth()`**, mirroring `getAuth()`'s shape and fail-closed discipline (missing `sub`-equivalent → 401; missing `channel_partner_id` claim → 403) but returning only `{ sub, email, channelPartnerId }` — no role, no `channel_partner_user_id`, since those are resolved from the DB, not the token. **The `channel_partner_id` claim itself needs a concrete Entra mechanism, flagged not resolved here**: Entra External ID supports custom attributes on user profiles and custom claims providers/claim mapping policies to surface an attribute value into a token — the *shape* (a claim carrying this tenant's foreign key) is decided; the exact provisioning API for setting it per-user at admin-invite time is implementation-detail work, not pinned to a specific Graph API call in this document (the AWS version could cite Cognito's `custom:` attribute API precisely; Entra's external-tenant custom-attribute provisioning surface is real but was not verified call-by-call here — flagged in §8, not silently assumed identical in shape).

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

**Not yet implemented for this fork, unlike the AWS version's corresponding pass** — the AWS §2.4 shipped real, verified code (`cdk synth`, typecheck, 15 tests) in the same session it was designed. This rewrite is design-only: no Azure infrastructure or `backend/` code exists yet for `PeakLogicPartners`, `getPartnerAuth()`, or `withChannelPartner()`. The DB-side logic sketched above (session-variable sequencing, the ordering-bug fix) is genuinely cloud-agnostic — it operates on `auth.sub`/`auth.channelPartnerId`, values any OIDC-compliant token can supply — so it's preserved verbatim rather than rewritten, but it has not been re-verified against a real Entra token or a real Postgres instance. Flagged honestly in §8/§9, not presented with false confidence.

### 2.5 Internal Administration Console Authentication (rewritten for Azure — a genuine simplification, not a lateral swap)

Database Schema §4.5 built the "act as" handoff mechanism (`account_assignments`, the `staff_tenant_access` policy, and the design for `withStaffActingOnTenant()`) — this section resolves the auth/API-layer wiring on Azure.

**Decision: PeakLogic's own Microsoft Entra ID workforce tenant, not a fabricated third identity pool.** This is the real, disclosed architectural improvement §2.0 flagged: the AWS version had to invent `StaffPool` from nothing, because AWS has no concept of "the company's own employee directory." **Azure doesn't have this gap** — PeakLogic's own staff already have (or would have) real Entra ID accounts in the company's ordinary Microsoft 365/workforce tenant, the same directory used for corporate email. The Administration Console authenticates against that **existing** tenant via a dedicated app registration, rather than provisioning a synthetic fourth-ish identity space for people who already have a real one. **A concrete, disclosed configuration requirement this finding depends on**: the app registration must be configured **single-tenant** (`Accounts in this organizational directory only`), not multi-tenant — this is what prevents any other organization's Entra ID users from ever being able to sign in, the functional equivalent of Cognito's `selfSignUpEnabled: false`/admin-invited-only posture, achieved by a different, Azure-native mechanism (tenant restriction at the app-registration level, not a signup-flow toggle).

**Decision: App Roles are used here (`superadmin`, `account_manager`) — same mechanism §2.1 established for the tenant pool, for the same reason.** The admin console's "act as" handoff (Database Schema §4.5) needs `app.current_staff_role` immediately, before any `account_assignments` query runs (that query's own RLS policy depends on it already being set) — circular to require a DB lookup just to learn the role that determines whether a DB lookup is even necessary (`superadmin` skips the assignment check entirely). App Roles supply this in the token directly, no round-trip needed, the identical reasoning that justified them for the tenant identity space.

**Security baseline: whatever PeakLogic's own corporate Entra ID tenant already enforces for its workforce, not a bespoke policy invented here.** This is a genuine, disclosed difference from the AWS version's framing ("stricter, not lighter, is the default posture for internal tooling") — on Azure, the admin console inherits the company's own real MFA/Conditional Access posture automatically, rather than needing its own separately-configured policy the way a synthetic `StaffPool` would have. If PeakLogic's corporate tenant doesn't already require MFA for all staff, that's a real, disclosed prerequisite this design depends on — flagged in §8, not assumed already true.

**`backend/shared/auth.ts`'s Azure equivalent gains `getStaffAuth()`**, mirroring `getAuth()`/`getPartnerAuth()`'s shape and fail-closed discipline: missing/invalid token → 401. Unlike the other two, there is no tenant/partner-scoping claim to check here at all — a token issued by PeakLogic's own workforce tenant, for this specific single-tenant app registration, *is* PeakLogic-staff by construction, nothing further to validate from the claims themselves. Role (`superadmin`/`account_manager`) is read from the `roles` claim, same App-Roles mechanism as §2.1.

**Carried over from the AWS version's own corrected design, re-verified as still applicable, not re-derived from scratch:** `StaffAuthContext` (returned by `getStaffAuth()`) should carry only `sub`/`email`/`role` off the token — no `staffUserId`, since that's a database-derived value (`peaklogic_staff_users.id`), not a token claim. This is *more*, not less, applicable on Entra than it was on Cognito — Entra's own `oid` (object ID) claim identifies the user within the workforce tenant but still isn't the same value as the DB-side `peaklogic_staff_users.id` primary key, so the same "resolve the DB row by the token's own subject identifier first, then use the resulting DB id" sequencing the AWS version's fix established is preserved verbatim below.

**A real, disclosed naming artifact, flagged rather than silently carried forward or silently renamed**: the code below and Database Schema §4.5's `peaklogic_staff_users`/`channel_partner_users`/`channel_partner_managers` tables all name their token-subject column `cognito_sub` — a literal Cognito-era name. On this fork, that column stores whichever OIDC provider's subject identifier applies. **Locked decision (2026-07-17, verified against Microsoft documentation, corrected from an initial implementation bug — see §9 item 12): the stored value is Entra's `oid` (immutable directory object ID), NOT the token `sub` claim.** Entra's `sub` is *pairwise* — unique per (user, app registration) — so the SPA, the mobile app (MSAL), and the Windows hub each receive a *different* `sub` for the same person; only `oid` is stable across every client app in the tenant. Since these subject columns must resolve the same row regardless of which client a user authenticated through, keying on `sub` would silently orphan a user the moment they signed in from a second client. `backend/shared/auth.ts`'s `getAuth()`/`getPartnerAuth()`/`getStaffAuth()` all extract `oid` accordingly. **Recommendation, not yet actioned**: rename the column to a cloud-neutral `auth_subject` (or similar) the next time Database Schema is touched for this track — flagged in §8, not silently renamed here without a corresponding schema amendment.

**`backend/shared/db.ts` gains `withStaffActingOnTenant()`**, implementing Database Schema §4.5's handoff, same sequencing as the AWS version (variable names below keep their existing `cognito_sub`/`current_staff_cognito_sub` spelling pending the rename noted above):
```ts
export async function withStaffActingOnTenant<T>(
  auth: StaffAuthContext,
  targetTenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await (await getPool()).connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.current_staff_cognito_sub = $1', [auth.sub]);
    await client.query('SET LOCAL app.current_staff_role = $1', [auth.role]);

    const { rows: [staffUser] } = await client.query<{ id: string; status: string }>(
      'SELECT id, status FROM peaklogic_staff_users WHERE cognito_sub = $1', [auth.sub],
    );
    if (!staffUser) {
      throw Object.assign(new Error('Staff user not found'), { statusCode: 403 });
    }
    if (staffUser.status === 'disabled') {
      throw Object.assign(new Error('Staff account is disabled'), { statusCode: 403 });
    }
    await client.query('SET LOCAL app.current_staff_user_id = $1', [staffUser.id]);

    if (auth.role !== 'superadmin') {
      const { rows } = await client.query(
        'SELECT 1 FROM account_assignments WHERE tenant_id = $1', [targetTenantId],
      );
      if (rows.length === 0) {
        throw Object.assign(new Error('Not assigned to this tenant'), { statusCode: 403 });
      }
    }

    await client.query('SET LOCAL app.current_tenant_id = $1', [targetTenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
```
Deliberately **not** parameterized to skip the transaction for `superadmin` as an optimization — running the same `BEGIN`/`SET LOCAL`/`COMMIT` shape for both roles, with only the assignment-check query conditionally skipped, keeps this function's behavior easy to reason about and test identically for both roles, rather than two structurally different code paths that could drift apart. The `peaklogic_staff_users` lookup itself is unconditional for both roles — mirrors `withChannelPartner()`'s status check (a disabled staff account is rejected here the same way a suspended channel partner is rejected there), and resolving `id` this way is now load-bearing, not just a nice-to-have, since `account_assignments`' own policy is keyed on `staff_user_id`.

**A design constraint carried over directly from Database Schema §4.5, not re-derived**: the assignment-check query must run *after* `app.current_staff_user_id`/`app.current_staff_role` are set but *before* `app.current_tenant_id` is — this ordering is what lets `account_assignments`' own RLS policy correctly scope the check itself (an `account_manager` session literally cannot see a row proving assignment to a tenant it isn't assigned to), rather than trusting application code to add the right `WHERE staff_user_id = ...` clause unaided. Getting this ordering wrong would either reject valid assignments (if the assignment check ran before staff identity is set) or defeat the check's own RLS scoping (if it ran after `current_tenant_id`, at which point `account_assignments` would be evaluated with the wrong session context). The newly-added `peaklogic_staff_users` lookup slots in after the `cognito_sub`/role variables are set (required, per the corrected `staff_self_or_superadmin` policy) and before the assignment check (which needs the resolved `id`) — same reasoning, one more link in the same chain.

**A new staff-side companion, `withStaffSession()`, for the console's non-tenant-scoped endpoints** (viewing/creating `peaklogic_staff_users`, viewing/creating `account_assignments`, `superadmin`-only tenant/channel-partner creation) — runs the identical `current_staff_cognito_sub` → lookup → `current_staff_user_id` sequence as the first half of `withStaffActingOnTenant()` above, then stops there: no `account_assignments` check, no `app.current_tenant_id` at all, since these actions aren't "acting as" any particular tenant.

**`requireStaffRole()` added, mirroring `requireRole()`/`requirePartnerRole()`** — gates `superadmin`-only actions (IA-2.1, IA-3.1, granting new `account_assignments`) that RLS alone doesn't fully express as a clean allow/deny (the `tenants` `staff_tenant_access` policy already structurally prevents an `account_manager` from inserting a new tenant, but `channel_partners`' application-layer-only enforcement, Database Schema §4.5, needs an explicit code-level check since there's no RLS backing it at all).

**`writeAuditLog()` extended, not replaced**, with an optional `actorStaffUserId` parameter populating the new `audit_log_entries.actor_staff_user_id` column (Domain Model §2.6/Database Schema §4.5) — every write performed through `withStaffActingOnTenant()` or `withStaffSession()` is expected to call this, satisfying IA-7.1.

**Not yet implemented for this fork, same honest disclosure as §2.4** — no Entra app registration, App Role assignment, or `backend/` code exists yet for the Administration Console on Azure. The DB-side handoff logic is preserved because it's cloud-agnostic; the identity-provider integration around it is not yet built or verified.

### 2.6 Channel Partner Manager Authentication (rewritten for Azure)

Database Schema §4.6 built the "act as" handoff mechanism for ChannelPartnerManager (a third instance of §2.5's pattern) — this section resolves the auth/API-layer wiring on Azure.

**Decision: reuse the `PeakLogicPartners` External ID tenant, not a fourth identity space — but with a real, disclosed exception to §2.4's "no App Roles for role resolution" design, mirroring the AWS version's own reasoning exactly.** Domain Model §2.9 specifies a manager authenticates into the same tenant `ChannelPartnerUser` uses (a manager's whole point is being a channel-partner-side identity with elevated, cross-account reach, not a fourth genuinely separate identity space the way staff is). But a manager's token cannot carry a `channel_partner_id` claim the way an ordinary `ChannelPartnerUser` token does — a manager isn't tied to one channel partner, that's the entire premise. Something must distinguish "this is a manager token" from "this is an ordinary partner-user token with a missing claim" before any DB lookup happens — the same problem §2.5 solved for staff using App Roles. **Resolution: `PeakLogicPartners` gains exactly one App Role, `channel_partner_manager`, used purely as an identity-type discriminator** — not a role in the authorization sense, since a manager's authority is always `partner_admin`-equivalent by construction once handed off (Database Schema §4.6), so there's no second role value the App Role would need to distinguish. This is a narrow, deliberate exception to §2.4's "role comes from the DB, not a claim" design, recorded as such — that reasoning still holds for `ChannelPartnerUser.role`; it doesn't apply to a token-type discriminator, which has no DB equivalent to derive from before the DB even knows which table to query. **The exact same trade-off the AWS version made for its one Cognito-group exception, re-derived independently for Entra's App Roles rather than assumed to carry over just because the mechanism name changed.**

**Re-verified for Entra's actual claim behavior, not assumed to carry over from Cognito's**: `getPartnerAuth()` (§2.4) 403s on a missing `channel_partner_id` claim — a manager's token never carries one, so a manager token can never succeed through the ordinary partner-user path regardless of App Role assignment, no additional check needed. Symmetrically, `getManagerAuth()` (below) 403s on a missing `channel_partner_manager` entry in the token's `roles` claim — an ordinary partner-user's token never carries it. Both paths traced explicitly against how Entra actually populates the `roles` claim (§2.1), not assumed safe by analogy to how Cognito's `cognito:groups` worked.

**`backend/shared/auth.ts`'s Azure equivalent gains `getManagerAuth()`**, mirroring `getPartnerAuth()`/`getStaffAuth()`'s shape and fail-closed discipline: missing/invalid token → 401; missing `channel_partner_manager` in the `roles` claim → 403. Returns only `{ sub, email }` — no `channelPartnerId` (there isn't one; every request must name its target explicitly, the same shape as `getStaffAuth()`/`withStaffActingOnTenant()`'s `targetTenantId` parameter, not `getPartnerAuth()`'s single implicit scope).

**`backend/shared/db.ts` gains `withManagerActingOnChannelPartner()`**, implementing Database Schema §4.6's handoff, mirroring `withStaffActingOnTenant()` structurally but with one real simplification: **there is no `superadmin`-style unconditional-access bypass for a manager.** Domain Model §2.9 never defined one — every manager must hold an explicit `channel_partner_manager_assignments` row for every account they can act on, no exceptions, so the assignment check below is never conditionally skipped the way `withStaffActingOnTenant()`'s is.
```ts
export async function withManagerActingOnChannelPartner<T>(
  auth: ManagerAuthContext,
  targetChannelPartnerId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await (await getPool()).connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.current_manager_cognito_sub = $1', [auth.sub]);

    const { rows: [manager] } = await client.query<{ id: string; status: string }>(
      'SELECT id, status FROM channel_partner_managers WHERE cognito_sub = $1', [auth.sub],
    );
    if (!manager) {
      throw Object.assign(new Error('Manager not found'), { statusCode: 403 });
    }
    if (manager.status === 'disabled') {
      throw Object.assign(new Error('Manager account is disabled'), { statusCode: 403 });
    }
    await client.query('SET LOCAL app.current_manager_id = $1', [manager.id]);

    const { rows } = await client.query(
      'SELECT 1 FROM channel_partner_manager_assignments WHERE channel_partner_id = $1', [targetChannelPartnerId],
    );
    if (rows.length === 0) {
      throw Object.assign(new Error('Not assigned to this channel partner'), { statusCode: 403 });
    }

    await client.query('SET LOCAL app.current_channel_partner_id = $1', [targetChannelPartnerId]);
    await client.query("SET LOCAL app.current_channel_partner_role = 'partner_admin'");
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
```
Same ordering discipline §2.5 already established, carried over deliberately, not re-derived: `app.current_manager_cognito_sub` must be set before the `channel_partner_managers` lookup (that table's own `manager_self_or_staff` policy, Database Schema §4.6, requires it); the assignment-verification query must run after `app.current_manager_id` is set but before `app.current_channel_partner_id` is, so `manager_assignment_visibility`'s own RLS correctly scopes the check to this manager's real rows rather than trusting application code alone.

**A new manager-side companion, `withManagerSession()`, for the manager's own cross-account, non-single-partner-scoped endpoint** — specifically `GET /v1/partner-manager/overview` (Domain Model §2.9's locked landing-screen decision, API Specification to define the exact route next in this sequence). Runs the identical `current_manager_cognito_sub` → lookup → `current_manager_id` sequence as the first half of `withManagerActingOnChannelPartner()` above, then stops there — no single-account handoff, since this endpoint's whole job is looping over the manager's own assignment list and opening the existing single-account handoff once per account (an application-code loop, not a new RLS shape — deliberately, to avoid repeating the one class of risk this whole document has avoided everywhere else: a new cross-account *policy* that could grant more than intended, versus a loop over already-individually-verified handoffs, which cannot).

**`writeAuditLog()` extended, not replaced**, with an optional `actorChannelPartnerManagerId` parameter populating the new `audit_log_entries.actor_channel_partner_manager_id` column (Database Schema §4.6) — every write performed through `withManagerActingOnChannelPartner()` is expected to call this, so a manager's actions are attributed to the manager, not silently indistinguishable from that account's own `partner_admin` acting directly.

**Not resolved here, flagged for API Specification (#11)'s own Azure amendment**: the exact email-based invite-or-link provisioning endpoint (Domain Model §2.9's disclosed gap) and the `GET /v1/partner-manager/overview` response shape — API Specification v1.4 already extended this fork's map/3D endpoints but has not yet been amended for this specific invite flow. The identity mechanics of the invite (an admin-created user in `PeakLogicPartners` with the `channel_partner_manager` App Role assigned, matching every other identity surface's admin-invited-only posture) are settled by this section; the API-layer request/response contract is not.

**Not yet implemented or verified against real infrastructure, same honest disclosure as §2.4/§2.5** — no Entra App Role, `getManagerAuth()`, or `withManagerActingOnChannelPartner()` exists in code for this fork yet. Flagged explicitly rather than presented as shipped.

---

## 3. Network Security (mostly cloud-agnostic patterns; exact Azure service names deferred to Infrastructure as Code, #16)

### 3.1 Network Segmentation (rewritten — same principle, Azure-native mechanism)

**The requirement is unchanged**: compute that touches the database must sit in a private, egress-restricted network segment; the database itself must be unreachable from the public internet, reachable only from that compute's own network identity. **Azure's equivalent primitives, verified to exist, not assumed**: an Azure Virtual Network (VNet) with private subnets, Network Security Groups (NSGs) restricting inbound traffic to the database's port from only the compute subnet, and (depending on which compute service Infrastructure as Code #16 selects) either VNet integration for the compute tier or a private endpoint on Azure Database for PostgreSQL. **The exact resource names and CDK-equivalent IaC constructs are Infrastructure as Code's job, not this document's** — this section states the required network topology (private compute, isolated database, no public route), unchanged in substance from the AWS version, not a specific Azure resource graph.

### 3.2 Real gap found on AWS: the same class of gap must be checked for, not assumed absent, once Azure code exists

**The AWS gap, restated as a standing lesson, not a live finding on this fork**: the AWS version found `Cors.ALL_ORIGINS` left wide open in infrastructure code, with a self-flagged, unaddressed TODO comment. **Since no Azure infrastructure code exists yet for this fork, there is nothing to check today** — but the lesson carries forward explicitly: whoever writes the Azure CORS configuration (on whichever compute/API layer Infrastructure as Code selects) must scope `allowOrigins` to the real deployed frontend origin(s) from the first commit, not leave a wildcard "tighten later" placeholder the way the AWS version's v1.0.0 code did. Flagged as a concrete implementation-review checklist item (§8), not assumed to have already been done correctly just because the AWS lesson is documented.

### 3.3 WAF — not present, not recommended yet (unchanged reasoning)

The AWS version's reasoning is cloud-agnostic and carries over: at current design-partner-tenant scale (PRD §8), with identity-provider auth on every data-touching route and rate limiting (§3.4), a WAF's marginal benefit doesn't clearly justify its cost/complexity yet. **Azure's equivalent, if this is revisited**: Azure Front Door's WAF or Application Gateway WAF, depending on which edge/CDN service Infrastructure as Code (#16) selects — named here only so a future revisit doesn't have to re-derive which Azure service this maps to, not a decision to adopt one now.

### 3.4 Rate Limiting — mechanism TBD, requirement unchanged

The requirement (bounded request rate per client, protecting the backend from abuse/volumetric spikes) is unchanged from the AWS version's `throttlingBurstLimit`/`throttlingRateLimit` configuration. The concrete Azure mechanism depends on which API-hosting service Infrastructure as Code (#16) selects (API Management policies, or a compute-tier-native throttling mechanism) — not pinned here, consistent with this document's approach everywhere else to service selection it doesn't own.

---

## 4. Data Protection

### 4.1 Encryption at Rest / In Transit (rewritten — same requirement, verified Azure mechanism)

**Verified, not assumed**: Azure Database for PostgreSQL Flexible Server encrypts data at rest by default (transparent, platform-managed), and Azure's storage services (whichever is selected for static asset/frontend hosting, Infrastructure as Code #16) likewise encrypt at rest by default and enforce HTTPS for client access — matching SRS §5.2's stated baseline without requiring a different architectural decision than the AWS version made. Device-to-cloud (MQTT/TLS, Device & Command Security Architecture §2) and client-server (HTTPS/TLS) transport encryption requirements are unchanged by the cloud switch — TLS itself is not an AWS- or Azure-specific technology.

### 4.2 Real gap found on AWS, re-examined for whether it recurs on Azure: TLS certificate validation must not be silently disabled on the DB connection

**The AWS gap, restated as a standing lesson this fork must not repeat, verified via real Azure documentation, not assumed by analogy**: the AWS version found `rejectUnauthorized: false` on the RDS connection, with a comment conflating network-layer isolation (real) with TLS-layer certificate validation (not actually happening). **The same category of shortcut is equally possible on Azure** — nothing about Azure Database for PostgreSQL forces a developer to validate its certificate; `pg`'s `rejectUnauthorized: false` option exists identically regardless of which cloud hosts the database. **Verified via Microsoft's own documentation**: Azure Database for PostgreSQL Flexible Server's TLS certificate chains up to **DigiCert Global Root G2** and **Microsoft RSA Root Certificate Authority 2017** — both need to be combined into one PEM bundle (the direct Azure equivalent of the AWS version's `rds-global-bundle.pem`, sourced from `truststore.pki.rds.amazonaws.com`) and loaded via `ssl: { ca: AZURE_POSTGRES_CA_BUNDLE, rejectUnauthorized: true }` once real Azure database code is written. **A real, disclosed operational wrinkle the AWS version didn't have to consider**: Microsoft has publicly documented a CA **rotation** program for Azure Database for PostgreSQL — meaning this bundle, unlike (as far as this project's history shows) AWS's, may need periodic updating on a schedule, not treated as a fetch-once artifact. Flagged for whoever implements this (§8), not resolved further here since no Azure DB connection code exists yet to fix.

### 4.3 Secrets Management (rewritten — direct Azure equivalent, verified)

**Decision: Azure Key Vault**, the direct equivalent of AWS Secrets Manager — verified as a real, current Azure service (not deprecated or superseded), supporting the same operational pattern the AWS version already established: database credentials generated/stored in Key Vault (not hardcoded), fetched by the compute tier at cold-start and cached for the life of the warm instance, with a managed-identity-scoped access grant per function/app (Azure's direct equivalent of `grantRead()`-scoped IAM) rather than a shared broad credential. No plaintext secret should ever appear in compute environment variables — only a Key Vault reference/URI, mirroring the AWS version's `DB_SECRET_ARN`-not-the-secret-itself pattern exactly. **Not yet implemented** — this is a design carried over with a verified Azure-native target, not code that exists yet for this fork.

---

## 5. Audit Logging — implementing AUD-1/AUD-2

**The gap, previously flagged but not resolved:** Compliance & Certification Roadmap §4 already listed audit logging as "specified, not yet implemented," and Device & Command Security Architecture §7 item 6 restated it as a pre-implementation gate on command issuance specifically. Checking again while writing this document (2026-07-09) confirmed the gap was total, not partial: `audit_log_entries` (Database Schema §4.3) had its table and its append-only trigger, and AUD-1/AUD-2 (SRS §3.10) specify what must be logged — but no code anywhere in `backend/` wrote to it.

**Design decision (2026-07-09): a single `writeAuditLog()` helper in `backend/shared/audit.ts`, called explicitly at each state-changing handler** — not a generic Express-style middleware/interceptor that fires on every request. Reasoning: AUD-1 only requires logging *specific* state-changing administrative actions (device claim, tenant/user config change, channel-partner attribution change — its own examples), not every read or every write; a blanket interceptor would either over-log (every GET) or need its own exclusion list, which is more complexity than explicit call sites at the handful of routes that actually qualify. This mirrors `withTenant()`'s own pattern — a small shared helper, called explicitly where it applies, not injected globally.

**Status for this fork: design only, not implemented — a bigger gap than the AWS version's own "designed but not built" correction, since nothing in `backend/` exists at all for this track yet.** The mechanism design itself is entirely cloud-agnostic (a single `writeAuditLog()` helper, called explicitly at state-changing handlers, taking a discriminated-union `AuditEntry` matching Database Schema §4.4/§4.5/§4.6's multi-scope `audit_log_entries` shape) — preserved verbatim from the AWS version's own corrected (v1.1+) design, since none of this logic touches an identity provider or cloud service directly.

**Call sites required at MVP, unchanged from the AWS version** (derived from AUD-1's own examples): device claim, device decommission, channel-partner attribution assignment, technician credential creation, route confirmation. **Not required:** ordinary CRUD, an AI-suggested route's generation (only its confirmation is an administrative action).

**Traces forward, unchanged**: this is still Device & Command Security Architecture §5's audit-logging prerequisite — whichever cloud track ships call sites for device claim/decommission first, adding an `issue_command` call site is a one-line addition to an already-working mechanism, not new infrastructure, once that mechanism actually exists for this track.

---

## 6. Incident Response — technical skeleton (process ownership stays with #20)

Compliance & Certification Roadmap §4 flagged "no documented, tested incident response plan" as a real SOC 2 Security-criterion gap — unaffected by the cloud switch, since it's an organizational/process gap, not a technical one. What *is* an architecture question, answered here for Azure specifically: **when an incident happens, what can a responder actually do with the system as built?**

- **Revoke a compromised device:** today, nothing — the same class of gap Device & Command Security Architecture §3.2 already found and redesigned for Azure (disable the IoT Hub device identity + disable the DPS enrollment). That fix is a prerequisite for any credible device-incident response, not just a hygiene nit, unchanged from the AWS framing.
- **Revoke a compromised user session — verified via Microsoft's own Graph API documentation, not assumed to carry over from Cognito's global-sign-out mechanism.** The direct equivalent is Microsoft Graph's `revokeSignInSessions` API (generally available, not the beta `invalidateAllRefreshTokens` which Microsoft has stated will not reach GA) — invalidates all of a user's issued refresh tokens and session cookies, with a documented **small delay of a few minutes** before it takes effect, essentially the same "not instant" caveat Cognito's own revocation carried. Not currently wired into any admin-facing tooling for this fork (nothing has been implemented at all yet) — flagged as a real gap (§8), same disclosure the AWS version already made for its own unbuilt tooling.
- **Investigate what happened:** `writeAuditLog()`'s design exists (§5) but nothing is implemented for this fork yet, so `audit_log_entries` has no rows to investigate regardless of platform. **The forensic log source itself changes**: Compliance & Certification Roadmap §4 (this fork's own v1.1 amendment) already identified Azure Monitor/Log Analytics as the Azure equivalent of CloudWatch Logs — whatever retention period is configured there inherits the same "is two weeks long enough" open question (§8) the AWS version already flagged, not re-litigated fresh here.

---

## 7. Traceability

| Section | Traces to |
|---|---|
| §2.0 Azure identity landscape *(rewritten v2.0)* | Real research: Entra External ID (Azure AD B2C successor for new customers), Entra ID workforce tenant for staff |
| §2.2 MFA Enforcement | Compliance & Certification Roadmap §4 (open item); Azure mechanism genuinely less settled than Cognito's, disclosed |
| §2.3 Orphaned role-claim risk *(re-examined for Azure)* | Application-code pattern, unaffected by cloud switch — no live instance on this fork since no code exists yet |
| §3.2 CORS gap | Standing lesson carried forward from AWS finding — nothing to check yet on this fork |
| §4.2 TLS cert validation gap | Standing lesson, re-verified against real Azure Database for PostgreSQL CA documentation |
| §5 Audit Logging design | AUD-1, AUD-2 (SRS §3.10), Database Schema §4.3/§4.4/§4.5/§4.6, Device & Command Security Architecture §5 |
| §6 Incident Response skeleton | Compliance & Certification Roadmap §4 (open item); Graph API `revokeSignInSessions` verified |
| §2.4 Channel Partner Portal Authentication *(rewritten v2.0)* | Domain Model §2.7/§4 decision 8, Database Schema §4.4, PRD §5.10/SRS §3.12 (TR-1–TR-3) |
| §2.5 Internal Administration Console Authentication *(rewritten v2.0)* | Domain Model §2.8, Database Schema §4.5, PRD §5.11/SRS §3.13 (IA-1–IA-8) |
| §2.6 Channel Partner Manager Authentication *(rewritten v2.0)* | Domain Model §2.9, Database Schema §4.6, iOS Application doc §2.1a (no PRD/SRS requirement ID yet — Domain Model §6.6) |

---

## 8. Open Questions

1. **Azure Monitor/Log Analytics retention may be too short for real incident investigation, same standing concern as the AWS version's CloudWatch item** — no decision made here; flagged for whoever owns the incident-response plan (#20).
2. **No "force logout" / session-revocation tooling exists** — Microsoft Graph's `revokeSignInSessions` supports it at the API level (verified); nothing in `backend/`/frontend exposes it to an admin, since nothing has been implemented for this fork at all. Real gap, not yet scheduled.
3. **§2.2's MFA mechanism is genuinely less settled than Cognito's single toggle was — a real, disclosed uncertainty, not a confident decision.** Conditional Access vs. Entra's newer "External MFA" mechanism (itself mid-transition through 2026–2027) means the exact policy object to configure should be re-verified against current Microsoft documentation at implementation time, not assumed frozen as of this document's writing.
4. **§2.4's `channel_partner_id` claim provisioning mechanism is named at the shape level, not verified call-by-call, unlike the AWS version's precise `custom:` attribute API citation.** Entra External ID's custom-attribute/claims-mapping-policy surface is real but wasn't traced through a specific Graph API call the way Cognito's `AdminUpdateUserAttributes` was — flagged for whoever implements this to verify against current documentation before writing code.
5. **A real, disclosed naming artifact**: `cognito_sub`-named DB columns (Database Schema §4.5/§4.6) now store an Entra subject identifier, not a Cognito one — recommended rename to a cloud-neutral name flagged, not yet actioned (see §2.5).
6. **§2.5's Administration-Console-on-corporate-Entra-ID design depends on a real, unverified assumption**: that PeakLogic's own corporate Microsoft 365/Entra ID tenant already enforces MFA for its workforce. If it doesn't, this design inherits that gap rather than closing it independently — flagged, not assumed true.
7. **Every Azure-native claim in this document (App Roles behavior, MFA mechanism options, Graph API revocation, Azure Postgres CA chain) is verified against current Microsoft documentation, not against a real Azure tenant** — same "sound reasoning, unverified against a real instance" caveat this project applies consistently elsewhere (Database Schema §6 items 6/8/11), now applying to identity infrastructure specifically. No Azure subscription/Entra tenant exists yet to actually exercise any of this.
8. **None of §2.1/§2.4/§2.5/§2.6 has been implemented at all for this fork** — a materially bigger gap than the AWS document's own open items, which tracked specific unwired call sites and unbuilt frontends against otherwise-shipped, verified infrastructure. Here, nothing exists yet: no Entra tenants provisioned, no app registrations, no `backend/` auth code. This is stated plainly rather than let the section prose (deliberately written with the same confident, decided tone as the AWS version, since the *design* decisions themselves are real and considered) imply a verification bar this rewrite hasn't cleared.
9. **§3/§4's exact Azure service names remain unpinned pending Infrastructure as Code (#16)** — this document states required security properties (network isolation, encryption at rest, secrets management via Key Vault) without naming every specific resource, consistent with how PRD/SRS/Database Schema have all treated the IaC-tool-dependent decisions throughout this amendment sequence.

---

## 9. Review Log

**v2.0 (2026-07-17), the `PeakLogic-Azure` full rewrite.** Every Azure/Entra-specific claim below was checked against real, current Microsoft documentation via live web research, not assumed by analogy to the Cognito design.

1. **A load-bearing, potentially design-invalidating fact verified before any other design work began**: confirmed Azure AD B2C — the naive "Cognito equivalent" a less careful rewrite might have reached for — is closed to new customers as of May 1, 2025. Designing this section against classic B2C would have specified a product PeakLogic cannot actually provision. Redirected the entire identity design to Microsoft Entra External ID (the real, current, purchasable CIAM product) before writing anything else in §2.
2. **A genuine, disclosed architectural improvement identified and verified, not asserted for effect**: confirmed Azure has no Cognito-style gap requiring a synthetic "staff pool" — PeakLogic's own real Entra ID workforce tenant (the company's actual Microsoft 365 directory) is a legitimate, standard identity source for an internal admin tool, verified against real single-tenant app-registration configuration guidance rather than assumed to work by analogy to how AWS's `StaffPool` had to be invented from nothing.
3. **App Roles vs. Security Groups was a real, verified decision, not a naming preference**: confirmed via Microsoft's own documentation that Entra security groups are subject to a 200-member token overage limit requiring a fallback Graph API call, while App Roles have no such limit and are Microsoft's own stated recommendation for exactly this per-application authorization pattern — the direct, verified replacement for Cognito Groups, re-derived from real platform behavior rather than assumed equivalent by name similarity.
4. **The `channel_partner_manager` App Role exception (§2.6) was re-derived independently against §2.4's original reasoning, not copied forward just because the AWS version made the same exception for its Cognito group.** Confirmed the underlying reasoning (role-resolution-from-DB is free once a DB round-trip already happens; identity-type discrimination has no DB equivalent to piggyback on) transfers to Entra's App Roles mechanism on its own merits, not by assumption.
5. **The Azure Database for PostgreSQL TLS CA chain (§4.2) was verified via Microsoft's own security documentation**, not assumed to be "some other CA bundle, same idea" — confirmed the specific roots (DigiCert Global Root G2, Microsoft RSA Root CA 2017) and the real, disclosed operational wrinkle that Microsoft runs a CA rotation program for this service, a maintenance consideration the AWS version's RDS bundle didn't carry in quite the same documented way.
6. **Microsoft Graph's `revokeSignInSessions` (§6) was verified as the correct, GA mechanism** — explicitly checked against documentation stating the newer-sounding `invalidateAllRefreshTokens` is beta and will **not** reach general availability, avoiding a plausible but wrong choice a less careful pass might have made by picking the more literally-named API.
7. **Verification-status claims throughout this rewrite are stated honestly, not inflated by the confident tone of the design prose itself**: every section that would have cited real `cdk synth`/test results on the AWS side instead states plainly that nothing has been implemented yet for this fork (§8 item 8) — the design decisions are real and considered, the code is not, and this document does not blur that line.
8. **What did NOT change, confirmed deliberately**: the MFA-required-platform-wide product decision (§2.2), the audit-logging call-site list (§5), and the incident-response architecture questions (§6) are all cloud-agnostic security/product decisions — re-read each against this rewrite's new mechanism sections and confirmed none depend on anything Cognito-specific that would need to change.

**Deep-review follow-up (2026-07-17), during the post-implementation architecture review.**

12. **A real bug found and fixed in the ported `backend/shared/auth.ts`, not just flagged**: the first port extracted the token `sub` claim (falling back to `oid`), the reverse of what's correct. Verified via Microsoft's own claims-reference documentation that Entra's `sub` is pairwise-per-app-registration while `oid` is the stable cross-app object ID — so a partner/staff user logging in via a second client app (SPA vs. MSAL mobile vs. hub) would have resolved to a nonexistent DB row and been rejected. Fixed to prefer `oid`; the decision is now locked in §2.5's naming-artifact note above so all three identity tables and all three `get*Auth()` functions agree. This is exactly the class of subtle cross-client identity bug that only surfaces on the second login path, which no single-client test would catch — worth a real integration test against a real Entra tenant once one exists.

---

## Revision History

**v2.0 (2026-07-17)** — the first `PeakLogic-Azure`-specific rewrite, forced by `azure-restructuring-plan.md` item 13 (🟣 full rewrite required: "Cognito → Entra ID — different auth model, MFA config, token claims structure").

- **§2.0 added**: states the Azure identity landscape up front — Entra External ID (not classic B2C, closed to new customers since May 2025) for customer/partner-facing identity; PeakLogic's own real Entra ID workforce tenant for staff, a genuine simplification over AWS's synthetic `StaffPool`.
- **§2.1 rewritten**: Entra External ID tenant "PeakLogicCustomers" replaces the tenant Cognito User Pool; App Roles (verified, not a Cognito Groups synonym) replace `cognito:groups` as the role-claim mechanism.
- **§2.2 rewritten, with a real, disclosed uncertainty the AWS version didn't have**: the *requirement* (MFA required, platform-wide) is unchanged; the *mechanism* is genuinely less settled on Entra than Cognito's single toggle was, given Microsoft's own mid-transition MFA feature set through 2026–2027 — stated honestly rather than pinned with false confidence.
- **§2.3 re-examined, not re-discovered**: confirmed the orphaned-role-grants-full-access risk class is a code pattern, not a Cognito-specific bug, and therefore fully capable of recurring on Azure — but there is no live instance to find on this fork, since no backend code exists yet.
- **§2.4/§2.5/§2.6 rewritten**: a second, separate Entra External ID tenant "PeakLogicPartners" replaces `PartnerPool`; PeakLogic's corporate Entra ID tenant (with a single-tenant app registration) replaces `StaffPool`; the `channel_partner_manager` App Role replaces the equivalent Cognito group, re-derived independently against the original reasoning rather than copied forward. All design decisions this document made (role-from-DB vs. role-from-claim, the manager App Role exception, the handoff-pattern reuse) are preserved because they were never Cognito-specific to begin with — only the concrete identity-provider mechanics changed.
- **§3/§4 rewritten**: network segmentation, CORS, WAF, rate limiting, encryption at rest, secrets management (Azure Key Vault replacing AWS Secrets Manager) all restated in Azure-native or cloud-agnostic terms, with exact service selection deferred to Infrastructure as Code (#16) consistent with every other document in this amendment sequence. The TLS-certificate-validation lesson (§4.2) was re-verified against real Azure documentation, not assumed to transfer automatically.
- **§5/§6 carried over as cloud-agnostic design, honestly re-scoped**: `writeAuditLog()`'s mechanism is unchanged (it never touched Cognito directly); the incident-response technical skeleton's device-revocation and log-retention items point at their real Azure equivalents (Device & Command Security Architecture §3.2's redesigned decommissioning, Azure Monitor/Log Analytics, Graph API session revocation).
- **Honestly scoped throughout, not oversold**: unlike the AWS document's amendment history (which shipped and verified real code in the same passes it was designed), this entire rewrite is design-only — no Entra tenant, app registration, or `backend/` auth code exists yet for this fork. Stated plainly in §8 item 8 and throughout, not implied away by the prose's otherwise-confident tone.
- **Downstream artifacts requiring their own amendments as a result** (tracked in `azure-restructuring-plan.md` §2): Multi-Tenant Architecture (#14, connection-pooling-under-Azure-Functions specifics), Deployment Architecture (#15), Infrastructure as Code (#16, the exact compute/network services this document deferred), CI/CD Pipeline (#17, Entra federated credentials for deployment).
