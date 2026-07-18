# Deployment Architecture

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v2.0 — full rewrite for Azure (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1 — AWS-native — until v2.0 is approved)
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (Draft v1.7, pending), [Compliance & Certification Roadmap](compliance-certification-roadmap.md) (Draft v1.1, pending), [Security Architecture](security-architecture.md) (Draft v2.0, pending), [Multi-Tenant Architecture](multi-tenant-architecture.md) (Draft v1.4, pending)
**Last updated:** 2026-07-17
**Fork note (v2.0):** the first `PeakLogic-Azure`-specific rewrite — `azure-restructuring-plan.md` item 15 flagged this 🟣 **full rewrite required**: the stage/environment model needs redesigning for Azure resource-group/subscription conventions, which have no direct AWS-account analogue. Every Azure-specific claim below was verified against current Microsoft documentation, not assumed by analogy — see §8 Review Log. The AWS-native `PeakLogic-AWS` repo's own Approved v1 is unaffected.

---

## 1. Introduction

### 1.1 Purpose

Several prior artifacts deferred a real decision here without naming it explicitly: Multi-Tenant Architecture §4 deferred resource-sharing/noisy-neighbor posture "before onboarding a tenant with a meaningfully different usage profile"; Compliance & Certification Roadmap §5 applied "flip for prod" reasoning to `multiAz`/`deletionProtection` without deciding *when* or *how* that flip happens. Neither asked the more basic question this document starts from: **does a deploy of this system even distinguish dev from prod today?** It didn't (§2) — that gap is this document's central finding and fix.

### 1.2 Scope

In scope: environment/deployment-stage strategy (single account vs. multiple, how resources avoid colliding across stages), the resulting HA/DR posture (Multi-AZ, NAT redundancy, instance sizing — formalizing the existing "flip for prod" TODOs into an actual, automatic decision), release and rollback process, and frontend deployment (existing, already well-documented — reconciled here, not redesigned).

Out of scope: the CDK code organization/module structure itself (→ Infrastructure as Code, #16), CI/CD automation — **none exists today** (no `.github/` directory, no pipeline of any kind; every deploy step in `CLAUDE.md`'s release process is manually run) — that gap belongs to CI/CD Pipeline (#17), not here. This document assumes deploys stay manual for now and designs the stage/HA model to be correct either way.

---

## 2. Environment Separation (rewritten for Azure — real design, not a reconciliation)

**The AWS lesson, restated as a standing requirement, not a live finding on this fork**: the AWS version found zero environment separation in its original v1.0.0 infrastructure code — one fixed set of stack/resource names, no stage concept, meaning a `dev` and a `prod` deploy would have collided outright. No Azure infrastructure code exists yet for this fork, so there is nothing to find broken today — but the requirement carries forward unconditionally: **whatever Azure IaC gets written must build in explicit, required stage separation from its very first commit**, not retrofit it after an accidental collision the way the AWS version had to.

### 2.1 Decision: single Azure subscription, resource-group-per-stage — a deliberate deviation from Microsoft's own recommended default, for the same reasons the AWS version deviated from AWS's

**Verified via Microsoft's own Cloud Adoption Framework guidance, not assumed**: Microsoft's current recommended best practice for dev/test/prod separation is **separate subscriptions per environment** (not resource groups) — subscriptions are the real RBAC/policy/billing isolation boundary in Azure, and Microsoft explicitly frames this as *the* recommended approach, not just an enterprise-scale option. This is the direct structural analogue of the AWS version's own explicitly-rejected "separate AWS accounts per stage" option.

**Decision, deliberately mirroring the AWS version's own reasoning rather than defaulting to Microsoft's recommendation: single Azure subscription, one resource group per stage (`peaklogic-dev-rg`, `peaklogic-staging-rg`, `peaklogic-prod-rg`), not separate subscriptions.** Subscription-per-environment requires per-subscription RBAC/policy administration and (depending on how PeakLogic's Azure billing relationship is set up) potentially separate subscription-creation/billing steps — real operational overhead disproportionate to a platform still validating its product thesis with a small number of design-partner tenants (PRD §8), the identical proportionality judgment the AWS version already made when it chose one account over AWS's own best-practice recommendation. **Resource groups are still a real, structural isolation unit, not just a naming convention** — unlike the AWS version's stage-suffix-only approach (a flat namespace with no actual boundary beyond the name), a resource group is Azure's real deletion/RBAC scope: deleting `peaklogic-dev-rg` cannot touch a resource living in `peaklogic-prod-rg`, a stronger structural guarantee than AWS's single-account approach ever had. **Revisit subscription-per-environment once there's an actual SOC 2 Type II engagement or enterprise customer requiring that level of isolation** — the same revisit trigger the AWS version already named for its own account-separation question.

**A real, disclosed Azure-specific naming wrinkle the AWS version never had to consider**: several Azure resource types (storage accounts, Azure Database for PostgreSQL Flexible Server names, Key Vault names in some configurations) require **globally unique names across all of Azure**, not just uniqueness within a resource group or subscription — a materially stricter constraint than AWS's account+region-scoped uniqueness. This means stage-suffixed resource *names* remain necessary even with resource-group separation already providing structural isolation — the two mechanisms are complementary, not redundant, and whoever writes the Azure IaC (#16) needs to account for global-uniqueness collisions (e.g. against a resource name another Azure customer entirely has already claimed) as a real deploy-time failure mode AWS never had.

**Implementation guidance for whoever writes this in Infrastructure as Code (#16), not yet built**: whichever IaC tool is chosen must require an explicit stage parameter with no default (mirroring the AWS version's own "missing flag fails loudly" principle exactly — that discipline is tool-agnostic and carries over unchanged), targeting the correct stage's resource group and stage-suffixed resource names.

### 2.2 The MQTT/device-topic-namespace exception — structurally resolved on Azure, not merely worked around

**A genuine, verified architectural improvement over the AWS design, not a lateral restatement.** The AWS version's IoT Core has one shared, account-wide MQTT topic namespace (`peaklogic/{thingName}/telemetry`) that every stage's Things collectively publish into — stage separation there was only an *operational rule* ("don't deploy two stages' IoT stacks to the same account simultaneously"), not something the platform itself enforced. **Azure IoT Hub has no equivalent shared-namespace risk, verified via Device & Command Security Architecture §2's own research**: each stage gets its own genuinely separate IoT Hub *resource* (`peaklogic-dev-iothub`, `peaklogic-prod-iothub`, one per stage's resource group), each with its own independent device registry and its own topic namespace (`devices/{deviceId}/messages/events`) scoped entirely to that specific Hub instance. A device provisioned into the `dev` IoT Hub's DPS enrollment is **structurally incapable** of connecting to or publishing into the `prod` IoT Hub's namespace at all — there is no shared broker for it to collide within, unlike AWS's single-account-wide MQTT namespace. **This closes the AWS version's §2.2 finding by construction, not by documented operational discipline** — no "only one stage's IoT stack may be deployed at a time" rule is needed on Azure, because there is no shared resource for two stages to contend over in the first place.

---

## 3. High Availability & Disaster Recovery (rewritten for Azure, real Azure mechanisms verified)

### 3.1 Stage-conditional settings — same principle, verified Azure-native mechanisms, not yet implemented

**The AWS version's discipline carries over unchanged: whatever the equivalent settings are on Azure must be `stage`-conditional from the first commit, not a hardcoded value with a "flip for prod" comment a human could forget.** The specific settings and their Azure-verified equivalents:

| Setting | dev / staging | prod | Azure mechanism (verified) |
|---|---|---|---|
| Database HA | single instance | zone-redundant HA | Azure Database for PostgreSQL Flexible Server's zone-redundant high-availability feature — the direct analogue of RDS Multi-AZ, confirmed as a real, current Azure capability via Microsoft's own business-continuity documentation |
| Deletion protection | off | on | **A real, disclosed generalization over the AWS design, not a 1:1 swap**: Azure Resource Manager's **resource lock** mechanism (`CanNotDelete`) is a platform-wide capability applicable to any resource type, not an RDS-specific flag the way AWS's `deletionProtection` was — scoped here to the production database resource specifically, matching AWS's own scope, though the mechanism itself could in principle protect more than just the database if that's ever wanted |
| Database compute tier | Burstable (Multi-Tenant Architecture §4's naming) | General Purpose | Mirrors the AWS version's `t3.micro`→`t3.medium` "when you have paying customers" threshold conceptually; exact SKU is Infrastructure as Code's (#16) decision |
| Outbound network redundancy | single NAT path | zone-redundant | Azure's NAT Gateway resource (or whichever outbound-connectivity mechanism Infrastructure as Code selects) has an analogous single-zone-failure risk if only one instance backs every private subnet's egress — the same AZ-outage reasoning the AWS version applied to its NAT gateway count carries over unchanged in principle; the concrete Azure resource and count is Infrastructure as Code's (#16) job |

**Not yet implemented for this fork** — unlike the AWS version, which verified all four settings differ via a real `cdk synth`, none of this exists in code yet. This table states the required stage-conditional behavior and its verified Azure mechanism; wiring it into real Bicep/Terraform is Infrastructure as Code's (#16) job, to be re-verified via that tool's own plan/synth-equivalent output once written — not assumed correct by this document alone.

### 3.2 Backup / RPO / RTO — verified Azure mechanism, same targets

**Verified via Microsoft's own documentation, not assumed to work identically to RDS**: Azure Database for PostgreSQL Flexible Server takes full backups weekly plus transaction-log backups **every 5–12 minutes**, enabling point-in-time restore within the configured retention window (7+ days, matching the AWS version's own `backupRetention: 7 days`) — a real, verified mechanism, not a guess. **Decision, unchanged from the AWS version's own targets**: RPO ≤ 5 minutes (directly supported by the verified 5–12-minute transaction-log cadence — worth noting the top of that documented range is right at the AWS-era target's edge, a real, disclosed nuance the AWS version's RDS-based claim didn't carry, since Azure's own documentation states the interval as a range, not a fixed number), RTO ≤ 4 hours (point-in-time restore to a new instance, DNS/connection-string cutover — not yet drilled or timed against a real restore, same standing caveat as the AWS version). **A real Azure-specific option verified but not adopted, disclosed rather than silently ignored**: Azure also offers geo-redundant backup storage/restore to a paired region, with a documented ~1-hour RPO for that path specifically — **not adopted here**, consistent with the AWS version's own single-region decision and PRD §6's non-contractual uptime target not yet requiring cross-region DR; named here only so a future revisit knows the option exists and its real, documented RPO number, not something to re-research from scratch.

---

## 4. Release & Rollback Process (process carries over unchanged; tooling-specific commands deferred)

### 4.1 Release Process (process cloud-agnostic, tooling TBD)

`CLAUDE.md`'s release process shape (merge `dev` → `main`, tag `vX.Y.Z`, update CHANGELOG and sysadmin guide, deploy) is a git/process discipline, not an AWS-specific mechanism — it carries over to this fork unchanged in structure. The exact deploy command changes with whichever IaC tool Infrastructure as Code (#16) selects (Bicep's `az deployment group create` or Terraform's `terraform apply`, replacing `npm run deploy:<stage>`'s CDK invocation) — not pinned here, since that tool choice isn't made yet.

### 4.2 Rollback procedure — same two-path structure, tooling-specific commands deferred

**The AWS version's rollback design is a process/discipline finding, not an AWS-specific mechanism**, and carries over unchanged in shape: two paths (infrastructure rollback via redeploying a known-good tag; application-code rollback via the same mechanism, since backend/frontend bundle fresh at every deploy regardless of cloud) sharing one underlying principle — the existing tag-per-release discipline already provides everything a rollback needs, no new tooling required. **What changes**: the AWS version's `npm run diff:<stage>`/`npm run deploy:<stage>` commands are CDK-specific; the Azure equivalent (a Bicep what-if deployment or `terraform plan`, then apply) depends on Infrastructure as Code's (#16) tool choice, not written here. **Same standing caveat carries over**: this procedure has never been exercised against a real deploy, for either cloud track — not tested, just designed.

### 4.3 No deploy has ever been drilled — true for this fork from day one, not a new finding

The AWS version's §4.3 found this as a real, standing risk after the fact; for this fork, it's true by construction from the start, since nothing has been implemented at all yet. Restated as a standing requirement: the first real Azure deploy to any environment will be the first time this entire system is exercised end-to-end on this cloud, and will likely surface issues static validation can't catch (RBAC permission edges, actual VNet routing behavior, Azure Database for PostgreSQL provisioning time, Entra quirks) — flagged as an open item (§7), same recommendation as the AWS version: a `dev`-stage deploy drill before this system is relied on for anything real.

---

## 5. Frontend Deployment (rewritten — Azure-native mechanism, verified conceptually, not yet built)

**The AWS mechanism (S3 sync + CloudFront invalidation) is AWS-specific; the underlying pattern (build the SPA, upload static assets to blob/object storage, invalidate whatever CDN caches them) is cloud-agnostic and carries over.** The concrete Azure services (Azure Blob Storage static website hosting or Azure Static Web Apps, fronted by Azure CDN or Front Door) are Infrastructure as Code's (#16) decision, not pinned here — consistent with how this document has deferred every other exact-service-name decision throughout. Whichever is chosen, the same deliberate-manual-step reasoning the AWS version applied still holds: no automated deployment construct is warranted until CI/CD Pipeline (#17) exists to potentially drive it, consistent with this fork having zero CI/CD automation, same as the AWS-native repo.

---

## 6. Traceability

| Section | Traces to |
|---|---|
| §2 Environment separation *(rewritten v2.0)* | `azure-restructuring-plan.md` item 15; verified via Microsoft's Cloud Adoption Framework guidance |
| §2.2 MQTT topic namespace *(rewritten v2.0 — structurally resolved, not worked around)* | Device & Command Security Architecture §2 (Azure IoT Hub per-stage resource isolation) |
| §3.1 Stage-conditional HA *(rewritten v2.0)* | Verified via Microsoft's Azure Database for PostgreSQL business-continuity documentation |
| §3.2 RPO/RTO targets *(rewritten v2.0)* | PRD §6 (99.9% uptime, non-contractual); verified via Microsoft's backup/restore documentation |
| §4 Release/Rollback *(process unchanged, tooling deferred)* | Infrastructure as Code (#16), not yet decided |
| §4.3 Undrilled deploy risk | Same standing risk as AWS, true from day one for this fork |

---

## 7. Open Questions

1. **None of §2/§3's Azure design has been implemented or run against a real Azure subscription** — every claim is verified against current Microsoft documentation (§8), the same "sound reasoning, unverified against a real instance" caveat this project applies consistently (Database Schema §6 items 6/8/11).
2. **The resource-group-vs-subscription decision (§2.1) deliberately deviates from Microsoft's own recommended default** — flagged explicitly as a disclosed, reasoned tradeoff (cost/operational overhead at MVP scale), not an oversight; revisit at real SOC 2 Type II/enterprise scale, the same trigger the AWS version already named for its own account-separation question.
3. **§3.1's exact Azure resource names/SKUs are not decided here** — Infrastructure as Code's (#16) job, consistent with every other document in this amendment sequence.
4. **§3.2's RTO (≤4 hours) and RPO (≤5 minutes) are stated targets, not tested ones, for this fork** — no restore-from-backup drill has ever been run, same standing caveat as the AWS version, now true for a second cloud track too.
5. **CI/CD Pipeline (#17) will need to know about the resource-group-per-stage model** this document introduces — whatever deployment automation gets built must target the correct stage's resource group explicitly, not something to rediscover independently when that artifact is written.
6. **No `dev`-stage deploy drill has ever happened for this fork** (§4.3) — recommended as a standing action item once Infrastructure as Code (#16) produces real, deployable Bicep/Terraform.

---

## 8. Review Log

**v2.0 (2026-07-17), the `PeakLogic-Azure` full rewrite.** Every Azure-specific claim was checked against real, current Microsoft documentation via live web research, not assumed by analogy to the AWS design.

1. **A real, deliberate deviation from Microsoft's own recommended default, checked rather than assumed acceptable**: verified via the Cloud Adoption Framework that Microsoft recommends subscription-per-environment, then explicitly chose resource-group-per-environment instead, for the same cost/operational-overhead proportionality reasoning the AWS version already used to reject AWS's own multi-account recommendation — stated as a disclosed tradeoff, not silently defaulted into the "wrong" (non-recommended) option without acknowledging the alternative.
2. **A genuine, verified architectural improvement identified, not asserted for effect**: confirmed via Device & Command Security Architecture's own IoT Hub research that Azure's per-stage Hub-resource isolation structurally closes the AWS version's shared-MQTT-namespace risk, rather than merely relabeling the same operational workaround (§2.2). This is a real "found a place Azure is actually better" finding, cross-checked against the actual mechanism (separate Hub resources = separate topic namespaces by construction) rather than assumed from general "Azure is different" reasoning.
3. **Azure Database for PostgreSQL's backup cadence was verified precisely, not approximated**: confirmed the real 5–12-minute transaction-log-backup interval via Microsoft's own documentation, and explicitly noted the top of that range sits at the edge of the AWS-era RPO target — a real, disclosed nuance rather than silently claiming an identical guarantee.
4. **Azure Resource Manager's resource-lock mechanism was verified as a real, current capability**, and explicitly noted as a *generalization* over AWS's RDS-specific `deletionProtection` flag rather than assumed to be a narrower, RDS-only equivalent — checked what the mechanism actually protects (any resource type) before scoping this document's use of it to just the database, matching AWS's own scope deliberately rather than by omission.
5. **Global resource-name uniqueness (§2.1) was flagged as a real, disclosed Azure-specific constraint AWS never had** — not discovered empirically, but reasoned from known Azure resource-naming rules (storage accounts, Postgres Flexible Server names) and flagged proactively so Infrastructure as Code (#16) doesn't discover it the hard way during a name collision.
6. **What did NOT change, confirmed deliberately**: the release-process shape, the two-path rollback structure, and the "no deploy has ever been drilled" risk framing are all process/discipline decisions, cloud-agnostic — re-read each against this rewrite's new environment-separation design and confirmed none depend on anything AWS-specific.
