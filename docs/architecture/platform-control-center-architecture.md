# Platform Control Center — Architecture & Enterprise Validation

**Company:** PeakLogic  ·  **Project codename:** Project Vantage
**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Status:** 🟡 Draft v0.1 (2026-07-25) — architecture + validation for the operational command layer
**Naming decision:** supersedes **"Super Admin Console"** as the primary product concept (§1). The staff-facing console (`super-console-implementation-plan.md`) becomes the Platform Control Center's UI.
**Depends on / reconciles with:** [Device & Command Security](device-command-security-architecture.md) (DPS/IoT Hub identity) · [Hub Enrollment & Identity](hub-enrollment-and-identity-design.md) (Q6) · [Hub Agent Runtime](hub-agent-runtime-design.md) (the device-side reconciler) · [Dual-Platform Hub](dual-platform-hub-design.md) · [Multi-Tenant Architecture](multi-tenant-architecture.md) · [Target Reference Architecture](target-reference-architecture.md) · [Security Architecture](security-architecture.md) · [Policy Engine](policy-engine-design.md) · [Super-Console Plan](super-console-implementation-plan.md)

---

## 0. Thesis

**The Platform Control Center (PCC) is the operational command plane for the entire fleet — the closed-loop system that drives every device to a declared desired state, safely, at scale, with a complete audit of who changed what and why.** The requirement in this document is sound and enterprise-grade in *scope*. Whether an implementation of it becomes a **true control plane** or merely an **operations dashboard** turns on four mechanisms the requirement implies but does not specify: **(1)** a closed-loop desired-state reconciler, **(2)** atomic, health-gated update safety, **(3)** a scale-out delivery + eventing architecture, and **(4)** an automated progressive-rollout engine. This document specifies those four, validates the design against the enterprise platforms named, and gives an honest verdict with required changes.

**The single most important architectural recommendation, stated up front:** **do not rebuild the primitives.** PeakLogic already commits to Azure IoT Hub + DPS + IoT Edge. The PCC's differentiation is the **multi-tenant RBAC + release-channel abstraction + workflow/drift/override/audit layer** *over* Azure's device-management primitives — **IoT Hub device twins** (desired/reported = the reconciliation substrate), **DPS** (identity + enrollment groups), **Device Update for IoT Hub (ADU)** (OTA deployments, groups, compliance, delta, rollback), and **Event Grid** (fleet eventing). Re-implementing an OTA engine, a twin store, or a device-identity service from scratch would burn years re-solving solved problems and is the classic path to a fragile dashboard.

---

## 1. Naming & positioning

Per the requirement, **"Super Admin Console" is retired as the primary product concept.** The Platform Control Center is the operational command layer *within* PeakLogicSystems (the cloud pillar). The existing staff-facing console work (`super-console-implementation-plan.md`, `prototypes/super-console-demo.html`) is **the PCC's operator UI** — not a separate product. A terminology sweep (super-console → Platform Control Center across docs/prototype/code) is a follow-up, not done in this pass (same disposition as the `windows-hub/` rename).

**Layering (important):** the PCC spans two audiences the RBAC roles already imply — **platform operators** (PeakLogic staff: Platform/Release/Security Admin, Support) and **delegated customer/partner admins** (Customer Administrator, Field Technician, Read-Only Auditor). This is the same platform-operator-vs-tenant boundary the super-console's load-bearing invariant protects: **the PCC never issues a cross-tenant query; fleet-wide views are aggregations, never ambient cross-tenant reads** (§5 has the scale consequence).

## 2. The requirement, accepted (with reconciliation notes)

The eight functional areas and RBAC model are **accepted as the functional specification.** Condensed, with notes on what already exists to build on:

| # | Functional area | Reconciles with / builds on |
|---|---|---|
| — | **RBAC** (Platform/Release/Security Admin, Customer Admin, Support, Field Tech, Read-Only Auditor; granular, configurable) | Extends the real Entra App-Roles model (`backend/shared/auth.ts`: customers `admin`/`operator`, staff `superadmin`/`account_manager`, partner roles). Today's roles are **too coarse** — the spec's 7 roles + granular permissions are a genuine, required expansion (§6). |
| 1 | **Artifact Repository** (firmware/driver/software/config/cert/recovery-image/AI-model; versions, signatures, deps, lifecycle) | New. Maps to a **content-addressed store + ADU import manifests**; AI models tie to `ai-analytics-layer-design.md`. |
| 2 | **Release Channels** (Dev→…→LTS/Hotfix/custom; each = a complete desired software state) | New, and the **core abstraction**. A channel = a named, versioned *desired-state bundle* (§3). Maps to ADU deployments + IoT Hub twin desired properties. |
| 3 | **Device Assignment** (device/group/fleet/geo/model/dynamic-rule; devices inherit desired state) | Builds on the `hubs`/`devices` registry + DPS enrollment groups + IoT Hub twin tags for dynamic group membership. |
| 4 | **Deployment** (schedule/approve/monitor/pause/cancel/rollback; staged Internal→…→100% with health checks) | New orchestration engine (§3.4). Maps to ADU deployments + a **progressive-rollout controller**. |
| 5 | **Fleet Compliance & Drift** (per-artifact compliance; 7 drift categories; expected vs. unexpected) | New. Reconciliation *reports* (reported vs. desired twin) → drift. Builds on the **hub agent's twin reported-properties** (already built) and the silence sweep. |
| 6 | **Override Management** (temp/perm/emergency/customer/eng; reason/requestor/approver/expiry/audit) | New workflow. Rides the append-only `audit_log_entries` substrate. |
| 7 | **Rollback** (individual/group/fleet/channel/automatic; triggers: health/boot/crash/telemetry/security) | New. **Requires A/B atomic update on-device** (§3.3) — the spec lists triggers but not the mechanism that makes rollback *safe*. |
| 8 | **Operational Intelligence** (health/status/adoption/drift/success-rate/failure-analysis/security/audit/timeline; full traceability) | Builds on `audit_log_entries` (append-only, immutable) + a fleet **read model** (§5) — not synchronous fan-out at scale. |

**Every action traceable (who/what/when/why/which devices/prev→new state):** already the design intent of `audit_log_entries` (append-only, Database Schema §4.3). The PCC formalizes it as a first-class, queryable event log.

## 3. The four mechanisms that make it a control plane (not a dashboard)

The requirement describes *what* is managed. These four specify *how* — and are the difference between a control plane and a dashboard over manual operations.

### 3.1 Closed-loop desired-state reconciliation (the defining mechanism)
A control plane is **declarative and self-converging**: you declare desired state; the system continuously drives every device toward it and reports convergence. The requirement's *"devices inherit their desired state from the assigned Release Channel… SHALL NOT require manual version assignment"* is exactly this — but a reconciler must exist to honor it.

- **Desired state** = the Release Channel bundle, projected onto each device's **IoT Hub twin desired properties**.
- **Reported state** = each device's **twin reported properties**, written by the **on-device agent** — which PeakLogic *already has*: the `PeakLogicEdge` hub agent reports `agent_version`/`peakassist_content_version` today, and its `PeakAssistSync` engine is a working *content-reconciliation* precedent (compare desired vs. current → pull → verify → report). Generalize that from "PeakAssist bundle" to "the full desired-state bundle."
- **Drift** = a computed diff (reported ≠ desired). Expected drift = an active Override (§6); unexpected drift = an alert + a remediation candidate.
- **Convergence** is eventual and reported, not assumed. This is the Intune/hawkBit/Balena-supervisor model.

**Without this loop, "inherit desired state" is a label on a dashboard.** With it, the PCC is a reconciler.

### 3.2 Progressive-rollout orchestration engine
Staged rollout (Internal→Engineering→QA→Pilot→Canary→5→20→50→100%) is only a control plane if promotion is **automated and health-gated**, not a human clicking "next ring." Required: a **rollout controller** that, per ring, evaluates **health SLOs / an error budget** (deployment success rate, boot-success, crash rate, telemetry-error rate, security events) and **auto-promotes on green, auto-halts on breach** — the pattern in Eclipse hawkBit (rollout groups with error thresholds), WUfB (safeguard holds), and progressive-delivery tooling. Manual approve/pause/cancel remain as overrides.

### 3.3 Atomic, health-gated update safety (A/B) — the missing rollback mechanism
The requirement lists rollback *triggers* but not the *mechanism*. Safe rollback requires **atomic dual-slot (A/B) updates on-device**: write the new image to the inactive slot, switch boot, run a health/boot-success gate with a **watchdog**; on failure, **auto-revert to the known-good slot**. This is Mender's and Balena's core safety property. The PeakLogic Hub (Windows appliance / Linux IoT Edge module) needs an A/B or image-history update strategy so "Rollback SHALL preserve recovery capability" is real, not aspirational. (IoT Edge module rollback + host-level A/B for the OS.)

### 3.4 Scale-out delivery + eventing (see §5)
Desired-state at fleet scale needs a **content-addressed artifact store + CDN distribution + delta/differential updates**, and an **event-driven** control loop (not polling). Detailed in §5.

## 4. Validation against enterprise platforms

Assessed the requirement (as specified, plus the §3 mechanisms) against the named platforms. Legend: ✅ covered · 🟡 implied/partial · ❌ absent in the spec as written.

| Capability | Spec as written | Intune | WUfB | AWS IoT DM | Azure IoT Hub + **ADU** | Mender Ent. | Balena | hawkBit |
|---|---|---|---|---|---|---|---|---|
| Declarative desired-state reconciliation | 🟡 (implied) | ✅ | ✅ | ✅ (jobs/shadow) | ✅ (twins) | ✅ | ✅ (supervisor) | ✅ |
| Release channels / rings | ✅ | ✅ | ✅ | 🟡 | ✅ (groups/deployments) | ✅ | ✅ | ✅ |
| **Health-gated auto-promote/halt** | ❌ | 🟡 | ✅ (safeguard) | 🟡 | 🟡 | ✅ | 🟡 | ✅ (error thresholds) |
| **A/B atomic update + auto-rollback** | ❌ (triggers only) | n/a | ✅ | 🟡 | ✅ (ADU) | ✅ (core) | ✅ (core) | 🟡 (client-dep) |
| **Delta / differential updates** | ❌ | 🟡 | ✅ | ✅ | ✅ (ADU delta) | ✅ | ✅ | 🟡 |
| **Content-addressed store + CDN** | 🟡 (repo, no CDN) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Device identity / attestation (TPM, secure boot) | 🟡 (certs) | ✅ | ✅ | ✅ (Defender) | ✅ (DPS + attestation) | 🟡 | 🟡 | ❌ |
| Granular RBAC + delegated admin | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | 🟡 | ✅ |
| **Hard multi-tenancy** (platform + customer) | ✅ | 🟡 (scope tags) | ❌ | 🟡 | 🟡 | ✅ (RBAC) | ✅ (fleets) | 🟡 |
| Drift detection & remediation | ✅ | ✅ | 🟡 | 🟡 | ✅ (compliance) | 🟡 | ✅ | 🟡 |
| Compliance reporting at scale | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Audit / full traceability | ✅ | ✅ | 🟡 | ✅ | 🟡 | ✅ | 🟡 | 🟡 |
| Supply-chain integrity (signing custody, SBOM, provenance) | 🟡 (signatures) | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| Proven scale (100k–millions) | ❓ (unstated) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Reading of the matrix:** the requirement's **functional breadth is genuinely enterprise-class** — on channels, drift, override, rollback, RBAC, multi-tenancy and audit it meets or exceeds several named platforms. Its **gaps are mechanistic**, concentrated in the ❌/🟡 rows: health-gated automation, A/B/delta update safety, CDN delivery, and (critically) the *unstated* scale architecture.

## 5. Scale analysis — does this manage millions of devices?

**As written, the requirement is silent on scale, and one inherited invariant actively threatens it.** A design that scales to millions requires these, none of which the requirement states:

1. **Control-plane / data-plane separation.** The PCC (management: intent, workflow, audit) must be architecturally distinct from the device data plane (telemetry, twin sync). Millions of devices connect to the **data plane** (IoT Hub, horizontally partitioned by DPS across multiple hubs); the PCC issues *intent* and consumes *events*. Conflating them (a console that directly queries every device) does not scale.
2. **Event-driven, not polling.** Fleet state changes must propagate via **Event Grid** (twin-change, connection-state, deployment-status events) into **materialized read models** — never per-device polling and never synchronous fan-out for a fleet view.
3. **⚠️ The super-console's "global views are fan-outs of individually-scoped reads" invariant does not scale to millions.** That model is correct for *isolation* but a fleet-wide compliance/drift view computed by synchronously fanning out per-tenant RLS reads is O(tenants×devices) per view — fine at design-partner scale, untenable at millions. **Required change:** keep the isolation guarantee, but serve fleet/compliance views from an **event-sourced, tenant-partitioned read model / projection** (updated by Event Grid), so a "fleet compliance" query is an indexed read of a materialized projection, not a live fan-out. Isolation is preserved by partitioning the projection by tenant, not by avoiding aggregation.
4. **Artifact distribution at scale:** content-addressed store + **CDN edge distribution** + **delta updates** + resumable, bandwidth-aware, rate-limited download — otherwise a 100%-ring release is a **thundering herd** that saturates egress and the herd re-downloads full images.
5. **Rollout backpressure & partitioning:** the rollout controller must throttle concurrent deployments, respect per-region/per-link bandwidth, and shard by device group — a fleet rollback of millions cannot be a single synchronous operation.
6. **Regional distribution / data residency:** multi-region IoT Hub + DPS allocation policies, and tenant data-residency (EU/US) as a first-class control-plane concept.
7. **Control-plane HA/DR:** the PCC itself needs HA + a tested DR/RPO story; a control plane that can go down and strand a fleet mid-rollout is not enterprise-grade.

**Verdict on scale:** the *functional* model can manage millions **only if** these are added. As specified (feature list without scale mechanics, plus a fan-out read invariant), a literal implementation tops out at **thousands–tens of thousands**, not millions.

## 6. Missing enterprise capabilities (gap analysis)

Beyond the §3 mechanisms and §5 scale items, the following enterprise capabilities are absent or under-specified:

- **Supply-chain integrity (beyond "digital signatures"):** signing-key custody in **HSM/Key Vault + Managed HSM**, **SBOM** per artifact, build **provenance/attestation (SLSA)**, reproducible builds, and *verification on-device before apply*. "Approve signing keys" needs the whole chain, or a signed artifact means little.
- **Certificate lifecycle at scale:** automated **rotation**, short-lived leaf certs, a real **PKI hierarchy**, and **revocation** (CRL/OCSP or DPS enrollment-disable) — reconciles with Device & Command Security §3.2/§3.3 (the dual-disable revocation, and DPS "roll certificates").
- **Policy-as-code / GitOps for desired state:** Release Channels should be **versioned, reviewable, diffable, promotable artifacts** (a channel promotion = a reviewed change), not console-mutable rows. Ties to `policy-engine-design.md`.
- **Approval workflows as first-class:** channel-approval and override-approval need real **maker/checker** workflows with segregation of duties (the RBAC example — Release Manager ≠ Security Admin — implies this but the engine is unstated).
- **Remote device operations:** secure remote command/method invocation, **remote terminal/log pull**, and diagnostics — gated behind Device & Command Security §5 (the actuation gate). Support Engineer role needs this, safely.
- **Fleet segmentation/query engine:** dynamic groups from a **device query language** over twin/registry attributes (AWS Fleet Indexing / hawkBit target filters) — "dynamic rule-based assignment" needs a real query engine.
- **Quotas, rate limits, abuse controls** per tenant/partner on the control plane.
- **Cost/telemetry governance:** ingestion quotas, retention tiers, and the cost kill-switch already built (`project_peaklogic_azure_cost_findings`).
- **Notifications/webhooks/integration:** deployment/drift/security events out to customer SIEM/ITSM (ServiceNow, Splunk) — enterprises require this.
- **Maintenance windows & change freeze:** per-tenant/site deployment blackout windows (regulated/industrial sites demand them).
- **Break-glass / emergency access** with heightened audit (the "emergency override" hints at it; the access path itself needs specifying).

## 7. Recommended architecture (the target)

1. **Build the PCC as a control-plane LAYER over Azure device-management primitives** — the top recommendation:
   - **Identity/provisioning:** DPS (individual + enrollment groups; §Q6 already designed this for hubs) with attestation.
   - **Desired/reported state:** IoT Hub **device twins** as the reconciliation substrate; the **hub agent already reports** — generalize it to full desired-state.
   - **OTA:** **Device Update for IoT Hub (ADU)** for deployments, groups, compliance, delta, and rollback — do **not** hand-roll an OTA engine.
   - **Eventing:** **Event Grid** → materialized read models (§5).
   - PeakLogic's differentiated value sits *above* these: multi-tenant RBAC, the Release-Channel abstraction, delegated partner/customer admin, drift/override/audit workflows, and the operator UX.
2. **Implement the four §3 mechanisms** (reconciler, progressive-rollout controller, A/B update safety, delivery/eventing).
3. **Replace the synchronous fan-out fleet view with an event-sourced, tenant-partitioned read model** (§5.3) — keep isolation, gain scale.
4. **Model Release Channels as versioned config-as-code** (§6, GitOps) with maker/checker approval.
5. **Complete the supply-chain and certificate-lifecycle stories** (§6).
6. **Expand RBAC** to the 7 granular roles with a real permission model + segregation of duties, extending the Entra App-Roles foundation.
7. **Sequence realistically:** most of this is **infrastructure-gated** (needs a real Azure subscription: IoT Hub, DPS, ADU, Event Grid, CDN) — it is design-stage until infra item 1 exists. The **device-side reconciler foundation is already built** (the hub agent) and is the right place to start on the pure-logic side (generalize `PeakAssistSync` → desired-state sync).

## 8. Verdict — control plane or dashboard?

**The requirement is a control-plane *specification*, not a dashboard specification — its scope, RBAC depth, drift/override/audit model, and multi-tenancy are enterprise-grade and, on several axes, ahead of the named platforms.** But it specifies **what** is managed and is largely silent on the **four mechanisms** and the **scale architecture** that make a control plane real. An implementation that took the requirement literally — build the eight modules as UI over manually-triggered actions and synchronous per-tenant reads — **would degrade into a sophisticated dashboard**: it would *show* fleet state and *fire* operations, but it would not *continuously converge* devices to desired state, would not *automatically* gate rollouts on health, would not make rollback *safe*, and would not scale past tens of thousands.

**Required changes to make it a true enterprise control plane:**
1. Add the **closed-loop reconciler** (desired vs. reported via IoT Hub twins; the hub agent is the foundation). *[the defining change]*
2. Add **health-gated automated progressive rollout** (auto-promote/halt on SLO/error-budget).
3. Add **A/B atomic, watchdog-gated on-device updates** so rollback is safe, not merely triggered.
4. Add the **scale-out delivery + eventing architecture** and **replace synchronous fan-out with an event-sourced tenant-partitioned read model**.
5. **Build on Azure IoT Hub/DPS/ADU/Event Grid**, not a from-scratch reimplementation.
6. Close the **supply-chain, certificate-lifecycle, policy-as-code, and granular-RBAC** gaps (§6).

With 1–6, the Platform Control Center is a genuine enterprise control plane capable of millions of devices. Without 1–4 especially, it is a dashboard.

## 9. Honesty ledger (real vs. design)

- **Real foundations that exist today:** the hub agent's twin-style reporting + `PeakAssistSync` reconciliation precedent (the device-side reconciler seed); DPS/IoT-Hub device identity design (Q6); append-only `audit_log_entries`; the multi-tenant isolation invariant + `withStaffActingOnTenant`; the coarse Entra App-Roles RBAC; the super-console backend (staff registry) + prototype UI.
- **Design-stage (this document):** the entire PCC as specified — reconciler generalization, release channels, ADU integration, progressive-rollout engine, A/B update safety, drift/override/rollback engines, the scale read model, and the expanded RBAC. **Nothing here is built**, and most is **infrastructure-gated** (no Azure subscription / IoT Hub / DPS / ADU / Event Grid / CDN — infra item 1). Same standing caveat as the whole Azure track.
- **Not validated against a real fleet:** every scale claim is architectural reasoning, unverified against a running deployment.

## 10. Open decisions

- **D1:** Confirm the "build on ADU + IoT Hub twins, don't hand-roll OTA" direction (§7.1) — the load-bearing decision.
- **D2:** PCC scope boundary — does it own *only* platform/device ops, with customer/partner-facing functions (white-label, dispatch, billing) staying in the tenant/partner portals? Recommend yes (keep the PCC the ops command plane).
- **D3:** On-device update strategy for the Windows-11 hub vs. the Linux IoT Edge hub (A/B host + IoT Edge module updates vs. MSIX) — reconciles with dual-platform-hub-design §6/§7.8.
- **D4:** The fleet read-model technology (§5.3) — projection store + Event Grid pipeline.
- **D5:** RBAC permission model — attribute/role hybrid, and how granular permissions are stored/evaluated.

## 11. Revision history

| Version | Date | Change |
|---|---|---|
| Draft v0.1 | 2026-07-25 | Establishes the Platform Control Center (supersedes "Super Admin Console"). Accepts the 8-area functional spec + RBAC; specifies the four control-plane mechanisms (reconciler, progressive-rollout, A/B safety, delivery/eventing); validates against Intune/WUfB/AWS IoT DM/Azure IoT Hub+ADU/Mender/Balena/Jamf/Workspace ONE/hawkBit; scale analysis to millions (incl. the fan-out-read-model finding); gap analysis; recommends building on Azure primitives; honest dashboard-vs-control-plane verdict + required changes. |
