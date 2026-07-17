# Azure Restructuring Plan

**Status:** Draft v0.1
**Purpose:** Steers the sequenced effort to restructure PeakLogic's architecture for Azure, forked from `PeakLogicSystems` (AWS-native) as part of exploring a merger/common commercialization roadmap with Purple Standard (Azure/Microsoft-based, product **MooreView**). See `docs/business/platform-commercialization-roadmap.md` for the business-level context.
**Forked from:** `PeakLogicSystems` at tag `aws-architecture-baseline` (dev branch, commit `49ee2a6`) — that tag is the permanent, unmodified reference point for the AWS-native architecture. Nothing from that repo has been deleted; this is a parallel effort, not a replacement, until a real decision is made.
**Last updated:** 2026-07-17

---

## 1. Method

This repo starts as a full copy of `PeakLogicSystems`, not a blank slate — most of the 27 existing architecture artifacts describe the *product* (what it does, who it's for, how tenants/data are modeled), not the cloud it runs on. Re-deriving those from zero would be wasted, redundant work. Only the artifacts that actually encode AWS-specific services, APIs, or mechanisms need a genuine rewrite.

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
| 2 | PRD | 🔵 Needs amendment | Must fold in §3's new features (map, 3D rendering) via a formal non-silent amendment before anything downstream is touched |
| 3 | SRS | 🔵 Needs amendment | Mirrors PRD amendment |
| 4 | Domain Model | 🔵 Needs amendment | New entities likely needed: site geo-coordinates, 3D facility model assets |
| 5 | Compliance & Certification Roadmap | 🔵 Needs amendment | SOC 2 scope is cloud-agnostic, but evidence sources (CloudTrail→Azure Activity Log, CloudWatch→Azure Monitor) and the HIPAA/shared-responsibility language need real, researched Azure equivalents, not assumed 1:1 mappings |
| 6 | User Personas | ✅ Carry over | |
| 7 | User Stories | 🔵 Needs amendment | New stories for map/3D features |
| 8 | UX Wireframes | 🔵 Needs amendment | New wireframes: dashboard map view, 3D facility render view |
| 9 | Information Architecture | 🔵 Needs amendment | New nav items for map/3D views |
| 10 | Database Schema | 🔵 Needs amendment | RLS/Postgres pattern itself is portable to Azure Database for PostgreSQL as-is; needs new schema for site lat/long + 3D model asset references |
| 11 | API Specification | 🔵 Needs amendment | New endpoints for map data + 3D asset delivery |
| 12 | Device & Command Security Architecture | 🟣 Full rewrite | Per-device X.509 mutual TLS over AWS IoT Core → Azure IoT Hub device identity/DPS model — different provisioning flow, not a relabel |
| 13 | Security Architecture | 🟣 Full rewrite | Cognito → Entra ID (or Azure AD B2C) — different auth model, MFA config, token claims structure |
| 14 | Multi-Tenant Architecture | 🔵 Needs amendment | The RLS pattern itself (`SET LOCAL`/`FORCE ROW LEVEL SECURITY`) is standard Postgres, portable as-is; connection-pooling-under-Lambda specifics need Azure Functions equivalents verified |
| 15 | Deployment Architecture | 🟣 Full rewrite | Stage/environment separation model needs to be redesigned for Azure resource-group/subscription conventions |
| 16 | Infrastructure as Code | 🟣 Full rewrite | AWS CDK v2 has no Azure equivalent — real choice needed (Bicep vs. Terraform), see §4 |
| 17 | CI/CD Pipeline | 🟣 Full rewrite | OIDC-federated AWS IAM roles → Azure equivalent (Entra ID federated credentials); still-unresolved even on the AWS side (Draft v0.1, blocked on AWS account) |
| 18 | Test Strategy | ✅ Carry over | Vitest/testing approach is app-layer, cloud-agnostic; minor amendment only if integration test target changes |
| 19 | Threat Model | 🔵 Needs amendment | AWS-specific findings (Lambda async-invocation retry behavior, IMDS-style metadata endpoints) need real Azure Functions equivalents researched, not assumed |
| 20 | SOC 2 Control Mapping & Evidence Plan | 🔵 Needs amendment | Evidence sources change with the infra rewrite |
| 21 | Patent Opportunity Analysis | ✅ Carry over | Product-level, not infra-specific |
| 22 | MVP Roadmap | 🟣 Full rewrite | Needs full resequencing once the Azure infra path and new features are scoped |
| 23 | Enterprise Roadmap | 🔵 Needs amendment | Mostly carries over; revisit sequencing once merger terms are clearer |
| 24 | Technical Debt Register | 🔵 Needs amendment | Several AWS-specific items (TD-43 dev credential bypass, TD-10 CloudFront TLS) don't map 1:1 — needs a fresh audit pass once real Azure infra exists, not a renumbering exercise |
| 25 | Windows Endpoint Application | 🔵 Needs amendment | Backend client points at a different API/auth endpoint (Entra ID token format vs. Cognito); core hub logic (ingestion sources, durable queue) is unaffected |
| 26 | iOS Application | 🔵 Needs amendment | Same auth-model amendment as #25; spec-only either way, no code written yet |
| 27 | Device Onboarding & Telemetry Acquisition | 🟣 Full rewrite | Provisioning sequence is written around AWS IoT Core/X.509; needs a real Azure IoT Hub/DPS-based rewrite |

---

## 3. New Feature Backlog (to fold in during the PRD amendment)

Two new product improvements the user wants built into the Azure-era product, identified 2026-07-17 by comparing against Purple Standard's MooreView platform:

1. **Site map visualization** — a real interactive map on the dashboard showing the physical geographic locations of all sites in a tenant's portfolio (not the existing RP-4 plain address-sortable directory — this is genuinely geospatial). Likely touches: Domain Model (site lat/long), Database Schema, API Specification (map data endpoint), UX Wireframes (new dashboard map view), and a real mapping library/service choice (e.g. Azure Maps, given the Azure-alignment context — needs its own real evaluation, not assumed).
2. **3D facility rendering** — the ability to render 3D visualizations of facility infrastructure (explicitly called out: pools, water treatment plants). This is a substantially new capability with no existing precedent in the current architecture — needs its own scoping pass (asset format, rendering approach web vs. native, authoring/CAD-import workflow, storage) before it can even enter Domain Model/Database Schema design. Treat as higher-uncertainty than the map feature; don't assume scope until a dedicated first pass is done.

**Both features must go through a formal PRD/SRS amendment first** (mirroring how the Channel Partner Portal and Internal Administration Console were introduced in the AWS-side project) — do not let infra rewrite work (§2 items 12–17, 22, 27) start assuming a final feature shape before that amendment lands, since these features may add new requirements (e.g., asset storage, a mapping service dependency) that the infra docs need to account for.

---

## 4. Real Open Decisions (not yet made — flag, don't assume)

- **IaC tool choice for Azure:** Bicep (Azure-native, closest conceptual match to CDK's declarative-with-a-real-language feel is actually closer to Terraform/Pulumi; Bicep is declarative-only) vs. Terraform (multi-cloud, larger ecosystem, already broadly used). Needs a real evaluation pass, not a default pick.
- **Mapping service for the site-map feature:** Azure Maps vs. a third-party option (e.g., Mapbox, which PeakLogic's Windows Hub branding work already referenced conceptually) — real cost/licensing/feature comparison needed.
- **Whether this becomes the merged entity's actual platform, or stays an exploratory parallel track** — this repo's existence doesn't commit PeakLogic to abandoning AWS; see `docs/business/platform-commercialization-roadmap.md` §8 Open Items, which explicitly defers the technology-direction decision to the merger negotiation.

---

## 5. How to Apply

Work through this list in dependency order, same discipline as the original architecture-first process: don't start a 🟣 full-rewrite infra doc until the 🔵 upstream product docs it depends on (PRD → SRS → Domain Model → ...) have absorbed the new feature backlog in §3. Update this table's disposition/status as each artifact is actually touched — this file is the live tracker for the whole restructuring effort, the same role `docs/architecture/README.md` plays for the original artifact sequence.
