# Azure Restructuring Plan

**Status:** Draft v0.1
**Purpose:** Steers the sequenced effort to restructure PeakLogic's architecture for Azure, forked from the AWS-native repo as part of exploring a merger/common commercialization roadmap with Purple Standard (Azure/Microsoft-based, product **MooreView**). See `docs/business/platform-commercialization-roadmap.md` for the business-level context.
**Forked from:** `PeakLogicSystems/PeakLogic-AWS` at tag `aws-architecture-baseline` (dev branch, commit `49ee2a6`) — named `PeakLogicSystems/PeakLogicSystems` at the time of the fork, renamed 2026-07-17 (same GitHub account) so the AWS and Azure repos are easy to tell apart. That tag is the permanent, unmodified reference point for the AWS-native architecture. Nothing from that repo has been deleted; this is a parallel effort, not a replacement, until a real decision is made.
**Last updated:** 2026-07-17

---

## 1. Method

This repo starts as a full copy of `PeakLogic-AWS`, not a blank slate — most of the 27 existing architecture artifacts describe the *product* (what it does, who it's for, how tenants/data are modeled), not the cloud it runs on. Re-deriving those from zero would be wasted, redundant work. Only the artifacts that actually encode AWS-specific services, APIs, or mechanisms need a genuine rewrite.

**Naming note:** the 27 inherited artifacts (and the sysadmin/user guides, CHANGELOG, and `infra/lib/cicd-stack.ts`) still say "PeakLogicSystems" in many places — that's almost always the **GitHub account/company/engineering-brand name**, which hasn't changed and still owns both repos. It is *not* a stale pointer to the old AWS repo slug, except in the small number of places that literally name the repo (fork banners here and in `CLAUDE.md`/`README.md`, already updated, plus the OIDC repo string in `cicd-stack.ts`). Don't bulk-rewrite the inherited docs' "PeakLogicSystems" mentions — they're still correct as company-name references, and the ones describing historical AWS-side work (archived sysadmin/user guides, `CHANGELOG.md`) must stay untouched per this project's own archiving rules anyway.

Each artifact below gets one of three dispositions:

- **✅ Carry over as-is** — cloud-agnostic; stays Approved at its current version, revisited only if a new feature (§3) forces a normal amendment.
- **🔵 Needs Azure amendment** — the document's *substance* is still valid, but specific AWS service names/mechanisms need real, verified Azure equivalents substituted in (not just find-and-replace — each swap needs the same "verify via research, don't assume" discipline the original project used for AWS).
- **🟣 Full rewrite required** — the document's entire mechanism is AWS-specific; the Azure version will look structurally different, not just relabeled.

Work proceeds in the same dependency order the original architecture-first process used — don't jump ahead to infra docs before the two new features (§3) have been folded into PRD/SRS/Domain Model, since those upstream docs may change what the infra needs to support.

---

## 2. Artifact Disposition

| # | Artifact | Disposition | Notes |
|---|----------|--------------|-------|
| 1 | Vision Document | ✅ Carry over | Product-level, cloud-agnostic |
| 2 | PRD | ✅ **Amended, v1.7 drafted 2026-07-17** | Folded in §3's new features (GEO-1–6, 3DR-1–3) and corrected stale AWS platform-constraint language (§4/§7/§8) |
| 3 | SRS | ✅ **Amended, v1.7 drafted 2026-07-17** | Mirrors PRD v1.7; corrected AWS-named system-context diagram/software-interfaces to Azure-track language |
| 4 | Domain Model | ✅ **Amended, v1.4 drafted 2026-07-17** | `Site.lat`/`lng` confirmed portable/newly load-bearing; 3D-model entity deliberately left unmodeled pending its own scoping pass |
| 5 | Compliance & Certification Roadmap | ✅ **Amended, v1.1 drafted 2026-07-17** | Real research confirmed Azure Activity Log≈CloudTrail, Azure Monitor≈CloudWatch (plus a third Entra ID log source AWS didn't split out); confirmed Azure offers a HIPAA BAA at no extra cost, same posture as AWS |
| 6 | User Personas | ✅ Carry over | |
| 7 | User Stories | ✅ **Amended, v1.1 drafted 2026-07-17** | Added US-18–21 for map/3D; disclosed (not fixed) a pre-existing gap — never amended for the AWS-side CH-3/IA-1 requirement sets either |
| 8 | UX Wireframes | ✅ **Amended, v1.4 drafted 2026-07-17** | Added §2.16 Portfolio Map View, §2.17 3D Panel addendum; **resolved the mapping-technology decision (see §4 below) — Mapbox, not Azure Maps** |
| 9 | Information Architecture | ✅ **Amended, v1.1 drafted 2026-07-17** | Map view placed as a toggle on the existing Portfolio nav item (not a new top-level entry); 3D panel added to Site Detail hierarchy; channel-partner-portal nav gap disclosed, not fixed |
| 10 | Database Schema | ✅ **Amended, v1.4 drafted 2026-07-17** | Verified via Microsoft docs: RLS/PostGIS portable to Azure Database for PostgreSQL (PostGIS needs a real `azure.extensions` allowlist step); `gen_random_uuid()` requires PG13+; no new schema needed for GEO features, none added for 3D pending its own scoping pass |
| 11 | API Specification | ✅ **Amended, v1.4 drafted 2026-07-17** | `GET /v1/portfolio` extended (lat/lng, unlocated_count); new `GET /v1/partner/portfolio`; 3D delivery endpoint deliberately left undesigned pending its own scoping pass |
| 12 | Device & Command Security Architecture | ✅ **Rewritten, v2.0 drafted 2026-07-17** | Azure IoT Hub + DPS individual X.509 enrollment; Direct Methods replace the custom command-acks topic (a genuine simplification, not just a swap) |
| 13 | Security Architecture | ✅ **Rewritten, v2.0 drafted 2026-07-17** | Entra External ID (two separate tenants, mirroring the two-Cognito-pool split) for customer/partner identity; PeakLogic's own real Entra ID workforce tenant for staff (a genuine simplification vs. AWS's synthetic StaffPool) — **note: classic Azure AD B2C is closed to new customers since May 2025, verified before designing anything** |
| 14 | Multi-Tenant Architecture | ✅ **Amended, v1.4 drafted 2026-07-17** | Verified via Microsoft docs: Azure Functions' warm-instance/static-client pattern carries the identical connection-pooling-plus-RLS risk Lambda has, so `SET LOCAL` stays load-bearing unchanged; every specific bug-fix finding carries forward as a lesson, none re-verified against real Azure infra yet |
| 15 | Deployment Architecture | ✅ **Rewritten, v2.0 drafted 2026-07-17** | Single subscription, resource-group-per-stage (deliberate deviation from Microsoft's own subscription-per-env recommendation, mirroring AWS's own cost-conscious single-account choice); IoT Hub's per-stage resource isolation structurally closes the MQTT-namespace risk AWS could only work around operationally |
| 16 | Infrastructure as Code | ✅ **Rewritten, v2.0 drafted 2026-07-17** | **Decision: Bicep** (not Terraform) — stateless, day-zero Azure coverage, no state-backend cost, matches this team's proportionality reasoning elsewhere. PSRule for Azure adopted as the cdk-nag equivalent. Compute resolved to Azure Functions. Real, disclosed gap: neither Bicep nor Terraform can automate Entra External ID tenant creation |
| 17 | CI/CD Pipeline | ✅ **Rewritten, v0.2 drafted 2026-07-17** | Entra Workload Identity Federation replaces OIDC-federated IAM roles — genuinely simpler (no singleton-provider-collision problem to work around). Branch-protection billing-tier constraint re-verified live against `PeakLogic-Azure` itself, not assumed. Still Draft, blocked on real Azure account, same status as the AWS version |
| 18 | Test Strategy | ✅ Carry over | Vitest/testing approach is app-layer, cloud-agnostic; minor amendment only if integration test target changes |
| 19 | Threat Model | ✅ **Amended, v1.1 drafted 2026-07-17** | Verified: Azure IMDS lives at the identical `169.254.169.254` address AWS uses, so the existing whole-CIDR SSRF fix already covers it with zero code change; Azure Functions has no native IoT Hub/Event Hub DLQ support at all (a materially bigger gap than the AWS residual, not a renamed one) |
| 20 | SOC 2 Control Mapping & Evidence Plan | ✅ **Amended, v1.1 drafted 2026-07-17** | Evidence sources corrected across CC4–CC9/A1/C1 (PSRule, Entra, Azure Monitor, Key Vault); Microsoft replaces AWS as primary subprocessor. Control requirements themselves unchanged, cloud-agnostic |
| 21 | Patent Opportunity Analysis | ✅ Carry over | Product-level, not infra-specific |
| 22 | MVP Roadmap | ✅ **Rewritten, v2.0 drafted 2026-07-17** | Fully resequenced: Bicep implementation + backend Azure-SDK porting now first (blocks everything), map/3D feature backlog added as new Azure-track-specific item, channel-partner-portal/sensing-logic gaps restated as inherited-and-unaffected by the pivot |
| 23 | Enterprise Roadmap | ✅ **Amended, v1.1 drafted 2026-07-17** | Almost entirely cloud-agnostic (product/business strategy); §3.3 multi-subscription Azure has one fewer forcing trigger than AWS's multi-account version since IoT Hub structurally closes the shared-namespace risk; §6 tech-debt hand-off list corrected to real Azure equivalents |
| 24 | Technical Debt Register | ✅ **Amended, v1.4 drafted 2026-07-17** | Not renumbered (per this item's own warning) — classified by category instead; TD-43's Azure equivalent (Key Vault bypass) flagged as a genuinely new, undecided question; TD-10 confirmed closed; TD-13 flagged materially worse on Azure. Real fresh audit deferred to once `infra-azure/` code exists |
| 25 | Windows Endpoint Application | ✅ **Amended, v1.2 drafted 2026-07-17** | Device identity → Azure IoT Hub/DPS, REST auth → Entra External ID (real OIDC refresh-token flow, not a renamed Cognito call); config/secret storage → Azure Blob/Entra; core ingestion/caching/kiosk-UI logic confirmed untouched by grep |
| 26 | iOS Application | ✅ **Amended, v1.3 drafted 2026-07-17** | MSAL/Entra External ID replaces Amplify/Cognito SRP — a real simplification (MSAL's hosted UI handles MFA natively, no hand-built TOTP state machine needed); Graph API `revokeSignInSessions` replaces `GlobalSignOut`; core telemetry/caching/UI logic confirmed untouched |
| 27 | Device Onboarding & Telemetry Acquisition | ✅ **Rewritten, v0.2 drafted 2026-07-17** | Azure IoT Hub + DPS individual enrollment replaces AWS IoT Core throughout, reusing Device & Command Security Architecture §2's verified design. Path A design-complete-not-implemented; Path B core logic confirmed cloud-agnostic (Windows Hub doc); Path C sketch corrected to Key Vault/Azure Functions |

---

## 3. New Feature Backlog (to fold in during the PRD amendment)

Two new product improvements the user wants built into the Azure-era product, identified 2026-07-17 by comparing against Purple Standard's MooreView platform:

1. **Site map visualization** — a real interactive map on the dashboard showing the physical geographic locations of all sites in a tenant's portfolio (not the existing RP-4 plain address-sortable directory — this is genuinely geospatial). Likely touches: Domain Model (site lat/long), Database Schema, API Specification (map data endpoint), UX Wireframes (new dashboard map view), and a real mapping library/service choice (e.g. Azure Maps, given the Azure-alignment context — needs its own real evaluation, not assumed).
2. **3D facility rendering** — the ability to render 3D visualizations of facility infrastructure (explicitly called out: pools, water treatment plants). This is a substantially new capability with no existing precedent in the current architecture — needs its own scoping pass (asset format, rendering approach web vs. native, authoring/CAD-import workflow, storage) before it can even enter Domain Model/Database Schema design. Treat as higher-uncertainty than the map feature; don't assume scope until a dedicated first pass is done.

**Both features must go through a formal PRD/SRS amendment first** (mirroring how the Channel Partner Portal and Internal Administration Console were introduced in the AWS-side project) — do not let infra rewrite work (§2 items 12–17, 22, 27) start assuming a final feature shape before that amendment lands, since these features may add new requirements (e.g., asset storage, a mapping service dependency) that the infra docs need to account for.

---

## 4. Real Open Decisions (not yet made — flag, don't assume)

- **IaC tool choice for Azure:** Bicep (Azure-native, closest conceptual match to CDK's declarative-with-a-real-language feel is actually closer to Terraform/Pulumi; Bicep is declarative-only) vs. Terraform (multi-cloud, larger ecosystem, already broadly used). Needs a real evaluation pass, not a default pick.
- ~~**Mapping service for the site-map feature:** Azure Maps vs. a third-party option~~ **Resolved 2026-07-17** (UX Wireframes v1.4 §2.16) — **Mapbox**, matching the already-shipping Territory Map Editor (§2.12). Real evaluation found no technical benefit to Azure Maps for a purely client-side map-rendering feature; splitting the app across two map vendors had no upside.
- **Whether this becomes the merged entity's actual platform, or stays an exploratory parallel track** — this repo's existence doesn't commit PeakLogic to abandoning AWS; see `docs/business/platform-commercialization-roadmap.md` §8 Open Items, which explicitly defers the technology-direction decision to the merger negotiation.

---

## 5. How to Apply

Work through this list in dependency order, same discipline as the original architecture-first process: don't start a 🟣 full-rewrite infra doc until the 🔵 upstream product docs it depends on (PRD → SRS → Domain Model → ...) have absorbed the new feature backlog in §3. Update this table's disposition/status as each artifact is actually touched — this file is the live tracker for the whole restructuring effort, the same role `docs/architecture/README.md` plays for the original artifact sequence.
