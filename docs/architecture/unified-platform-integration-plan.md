# Unified Platform Integration Plan

**Status:** Active — governing tracker for the PeakLogic-first artifact sweep
**Created:** 2026-07-24
**Owner:** Chief Software Architect function
**Repo:** `PeakLogic-Azure-V2` (the merger / unified-platform development line; the original `PeakLogic-Azure` is frozen at the pre-merger fork point `14f5dd1`)

---

> **📊 Sweep progress (updated 2026-07-25).** **Phase 0** (naming/governance) ✅ · **Phase 1** spine — Vision/PRD/SRS/Domain Model → Draft v2.0 ✅ · **Phase 2** — Database Schema v1.5 + **5 real migrations** ✅; self-contained **backend** (PM-generation, compliance, PeakAssist; 174/174 tests) ✅; **11 substantive doc amendments** ✅; the **clickthrough demo** (PeakView360 / Hubs / CMMS / Compliance / PeakAssist + partner & tenant white-label branding, headless-verified) ✅ · **Phase 3** — 2 net-new design docs (PeakView360 HMI/SCADA, PeakAssist) ✅ · **Phase 4** — canonical-naming reconciliation across 24 docs ✅; both **guides** (User Guide v1.3, SysAdmin §1 framing) ✅; vision-doc cloud-pillar naming (PeakLogic→PeakLogicSystems) ✅; unified-platform content notes on the 8 AMEND-flagged docs (device-command-security, threat-model, compliance-cert, patent, mvp/enterprise roadmaps, channel-partner-intelligence, whitelabel-estate) ✅. **Sweep essentially complete** — every architecture artifact, both guides, the business north-star, the schema/backend, and the demo are reconciled to the unified platform. Remaining is downstream *build* work (the PeakView360 app, Hub PLC drivers, PeakAssist CMS/sync, actuation), all honestly marked design-stage, plus the separate AWS→Azure reconciliation of the SysAdmin guide body.

## 0. Why this document exists

The `PeakLogic-Azure-V2` repo was forked to develop the **PeakLogic-first unified platform** decided in [`docs/business/unified-product-vision.md`](../business/unified-product-vision.md): a multi-tenant SCADA/HMI + CMMS + AI-intelligence platform that absorbs the proven capabilities of Purple Standard's **MooreView**, delivered as three components that are one product — **PeakLogicSystems** (cloud), **PeakView360** (HMI/SCADA), and **PeakLogic Hubs** (on-prem edge), with **PeakAssist** (help) as a first-class pillar.

The entire `docs/architecture/` set (38 artifacts) predates that decision. It frames the product as a single-tier "facilities **risk** intelligence platform" — no SCADA/HMI layer, no built-in CMMS, no on-prem Hub as a first-class pillar, no MooreView absorption, no compliance-automation wedge, and no PeakAssist. This document is the **carry-over / amend / rewrite / new** map that governs reconciling every artifact to the unified platform, tracked to completion.

This mirrors the role [`azure-restructuring-plan.md`](azure-restructuring-plan.md) played for the AWS→Azure re-derivation — same discipline, next layer.

---

## 1. Canonical naming (locked 2026-07-24)

**This supersedes all prior naming in every artifact, including the "Approved v1" Vision Document and CLAUDE.md.** Three conflicting systems existed at fork time (`PeakView Hub/360` in the Vision Document, `PeakVantage Hub/360` + codename `Vantage` in CLAUDE.md, `PeakLogic/PeakView360/…` in the unified-vision doc). The user resolved them:

| Layer / entity | Canonical name | Notes |
|---|---|---|
| Company | **PeakLogic** | The legal/brand entity. |
| Project codename (internal) | **Project Vantage** | Internal engineering use only; never customer-facing. Was "Vantage." |
| Cloud / brain intelligence layer (SaaS) | **PeakLogicSystems** | The multi-tenant cloud. **Distinct from the company name.** Also happens to be the GitHub org slug — that's incidental. |
| HMI / SCADA layer | **PeakView360** | One token, no space (not "PeakView 360"). The modernized operator experience absorbing MooreView. |
| On-prem edge unit | **PeakLogic Hub** (one), **PeakLogic Hubs** (fleet) | Productization of the existing `windows-hub/` / PeakLogic Edge. |
| Help / support system | **PeakAssist** | First-class, offline-capable, contextual. |

**Retired (do not use going forward):** *PeakView Hub*, *PeakView 360*, *PeakVantage Hub*, *PeakVantage 360*, bare *Vantage* (now *Project Vantage*). Where old docs used *PeakLogicSystems* to mean "the cloud platform," that remains correct.

**Correction owed:** `docs/business/unified-product-vision.md` used **PeakLogic** for the cloud pillar — it must be renamed to **PeakLogicSystems** during this sweep.

---

## 2. The substantive changes each phase introduces

Beyond naming, the pivot introduces these genuinely new concepts the old artifacts don't cover — each needs a real home in the spine before it cascades:

1. **Three-pillar product** (PeakLogicSystems / PeakView360 / PeakLogic Hubs) as one product, replacing the old single-tier framing.
2. **"Above SCADA, never replacing it"** positioning — the platform never touches safety-rated PLC control logic (a hard guardrail to repeat in every relevant doc).
3. **PeakView360 as a first-class HMI/SCADA layer** — real-time operator screens, alarm management, equipment dashboards, facility visualization, multi-pen historian; dual-source rendering (Hub-local/offline + cloud/multi-site).
4. **PeakLogic Hubs as a first-class on-prem pillar** — PLC/RTU acquisition (Modbus/OPC-UA/EtherNet-IP), edge processing, offline reliability, store-and-forward, offline PeakView360 + PeakAssist serving.
5. **Built-in CMMS** — work orders, PM schedules, alarm-driven work orders (absorbed/modernized from MooreView, extending the existing CMMS connector work).
6. **Compliance automation** — regulatory reporting (e.g. NPDES/DMR for wastewater), the identified market wedge.
7. **PeakAssist** — the mandatory first-class help system.
8. **MooreView feature absorption** — the preserve/modernize/redesign/retire disposition (unified-vision §4).

---

## 3. Artifact disposition & status

**Legend — Disposition:** `CARRY` (naming/positioning touch only) · `AMEND` (real new sections) · `REWRITE` (foundational re-derivation) · `NEW` (net-new artifact).
**Legend — Status:** ⬜ not started · 🟨 in progress · ✅ done (committed).

### Phase 0 — Governance & naming ✅ COMPLETE
| Artifact | Disposition | Status | Notes |
|---|---|---|---|
| `unified-platform-integration-plan.md` (this doc) | NEW | ✅ | The governing tracker; includes §4a code-reconciliation rule. |
| `CLAUDE.md` → Naming section | AMEND | ✅ | Canonical naming table + reframe banner. |
| `README.md` (root) | AMEND | ✅ | Retitled to unified-platform framing; 3-pillar summary; naming current (AWS body reconciled later). |
| `README.md` (architecture index) | AMEND | ✅ | Read-first banner pointing here + canonical naming. |
| Canonical-naming memory | NEW | ✅ | `project_peaklogic_canonical_naming.md` + MEMORY.md index line. |

### Phase 1 — Foundational spine ✅ COMPLETE (checkpoint reached — awaiting user review before Phase 2)
| # | Artifact | Disposition | Status | Notes |
|---|---|---|---|---|
| 1 | Vision Document | REWRITE (→v2) | ✅ | Draft v2: 3-pillar model + PeakAssist; above-SCADA; multi-site/service-provider/compliance targeting; MooreView absorption; per-facility tiers; canonical naming. v1 philosophy preserved. No direct code. |
| 2 | PRD | AMEND (→v2) | ✅ | Draft v2.0: §5.18–§5.23 (PeakView360, Hubs, CMMS, compliance automation, PeakAssist, MooreView absorption) + roles/scope/naming. CP-5 flagged blocked on outbound-delivery infra. No direct code. |
| 3 | SRS | AMEND (→v2) | ✅ | Draft v2.0: §3.20–§3.25 mirror PRD §5.18–§5.23; traceability + open-issues (10/11) + naming. No direct code. |
| 4 | Domain Model | AMEND (→v2) | ✅ | Draft v2.0: §2.10–§2.14 (HMI screens/tags, Hub fleet, CMMS, compliance, PeakAssist). Verification-only code reconciliation (all new vs `data-model.sql`); **real finding: `service_visits` referenced by #32/#34 but absent** — carried to Phase 2. No migrations here. |

> **⏸️ CHECKPOINT — the spine is complete. Recommended: pause here for user review before Phase 2** cascades the reframe into ~30 downstream docs (and begins the real code reconciliation at Database Schema #10). Phase 1 was docs-only (the spine carries no direct code); Phase 2 is where migrations/backend changes begin.

### Phase 2 — Architecture docs needing real additions
| # | Artifact | Disposition | Status | Notes |
|---|---|---|---|---|
| 28 | Target Reference Architecture | AMEND | ⬜ | Three-pillar/three-plane physical model incl. PeakView360 + Hub; dual-source data path. |
| 30 | Platform Services Architecture | AMEND | ⬜ | Add PeakView360, Hub edge-processing, PeakAssist, CMMS as logical services. |
| 27 | Device Onboarding & Telemetry Acquisition | AMEND | ⬜ | Hub-relayed becomes the primary path; PLC/RTU acquisition; Path C context. |
| 25 | Windows Endpoint Application ("The Brains") | REWRITE | ⬜ | This IS the PeakLogic Hub — rebrand + productize: protocol drivers, offline PeakView360 + PeakAssist serving, fleet mgmt. |
| 34 | AI Analytics Layer Design | AMEND | ⬜ | Absorb MooreView PdM (asset↔tag mapping, health scoring, feature batch) into the central AI engine. |
| 10 | Database Schema | AMEND | ✅ | Draft v1.5 §4.8 + **5 real migrations** (`1784142000000`–`…240000`): hubs, hmi_screens/tags/historian_pens, pm_schedules/service_visits + service_tickets ext, compliance_*, help_*. Mirrored in `data-model.sql`. Resolved DM §6.9 (service_tickets=work order; **service_visits created**) + §6.10 (tags=normalization fabric). |
| 11 | API Specification | AMEND | ⬜ | PeakView360 / Hub / PeakAssist / CMMS / compliance endpoints (may itself be phased). |
| 32 | Reporting & KPI Design | AMEND | ⬜ | Compliance/DMR report automation. |
| 6 | User Personas | AMEND | ⬜ | Operator, technician, compliance-officer personas. |
| 7 | User Stories | AMEND | ⬜ | PeakView360 / Hub / PeakAssist / compliance stories. |
| 8 | UX Wireframes | AMEND | ⬜ | PeakView360 operator screens; PeakAssist surface. |
| 9 | Information Architecture | AMEND | ⬜ | PeakView360 nav, Hub management, PeakAssist. |

### Phase 3 — Net-new design artifacts
| Artifact | Disposition | Status | Notes |
|---|---|---|---|
| PeakView360 HMI/SCADA Architecture | NEW | ⬜ | Operator screens, alarm mgmt, historian, facility viz, dual-source rendering. |
| PeakAssist Help System Architecture | NEW | ⬜ | Formalizes unified-vision §6: contextual, one-click, offline-via-Hub, cloud-synced, two audiences. |
| Hub Agent Runtime Design | NEW | ✅ | `hub-agent-runtime-design.md` — runtime scoping of the `PeakLogicEdge` .NET agent against the now-real Hub cloud contracts (register/heartbeat/peakassist-sync); exists/new inventory, transport-reconciliation open item, 8-step build sequence. Reconciles with `windows-endpoint-application.md`. Step §7.1 (commissioning loop) built. |
| Hub Enrollment & Identity Design | NEW | ✅ | `hub-enrollment-and-identity-design.md` — resolves runtime-design Q6 (first-run auth) + Q7 (site resolution): hub = X.509/DPS IoT Hub device (reuses Device & Command Security §2), two-phase commissioning, twin-native heartbeat/sync (built handler logic reused), dual-disable revocation. Settles transport toward IoT Hub MQTT. |
| Dual-Platform Hub Design | NEW | ✅ | `dual-platform-hub-design.md` — Hub must run on Windows 11 + Linux. Decisions: headless + browser UI on Linux, Azure IoT Edge module packaging. `PeakLogicEdge.Core` retargeted `net8.0;net8.0-windows` (portable build verified, 51 tests green); DPAPI/serial gated to Windows TFM; Linux identity/heartbeat delegated to IoT Edge + Q6 DPS + D2 twin. |
| MooreView Feature Integration & Disposition | NEW (candidate) | ⬜ | Formalizes unified-vision §4 preserve/modernize/redesign/retire as an architecture artifact; may instead be folded into the Vision/PRD. |

### Phase 4 — Naming / positioning sweep (lighter touch)
| # | Artifact | Disposition | Status | Notes |
|---|---|---|---|---|
| 5 | Compliance & Certification Roadmap | AMEND | ⬜ | Compliance automation is now a product wedge, not only SOC 2 readiness. |
| 12 | Device & Command Security Architecture | AMEND | ⬜ | PeakView360/portal → device command path (e.g. valve shutoff). |
| 13 | Security Architecture | CARRY/AMEND | ⬜ | PeakView360 auth; Hub offline credential path. |
| 14 | Multi-Tenant Architecture | CARRY/AMEND | ⬜ | PeakView360/Hub tenancy scoping. |
| 15 | Deployment Architecture | CARRY | ⬜ | Naming; Hub/PeakView360 deployment notes. |
| 16 | Infrastructure as Code | CARRY | ⬜ | Naming (Azure). |
| 17 | CI/CD Pipeline | CARRY | ⬜ | Naming. |
| 18 | Test Strategy | CARRY | ⬜ | Naming. |
| 19 | Threat Model | AMEND | ⬜ | PeakView360/Hub/command-path threats. |
| 20 | SOC 2 Control Mapping | CARRY | ⬜ | Naming. |
| 21 | Patent Opportunity Analysis | AMEND | ⬜ | Detect→dispatch→outcome moat; unified-platform/PdM angles. |
| 22 | MVP Roadmap | AMEND | ⬜ | Pilot = unified-platform MVP (unified-vision §5.5 / §10). |
| 23 | Enterprise Roadmap | AMEND | ⬜ | Unified-platform initiatives. |
| 24 | Technical Debt Register | CARRY | ⬜ | Naming + any new items surfaced during the sweep. |
| 26 | iOS Application | CARRY/AMEND | ⬜ | PeakView360 mobile framing. |
| 29 | Super-Console Implementation Plan | CARRY | ⬜ | Staff console over the unified platform. |
| 31 | Policy Engine Design | CARRY/AMEND | ⬜ | PeakView360 alarm-config surface. |
| 33 | Channel Partner Intelligence Layer | AMEND | ⬜ | Maps onto the service-provider pillar. |
| 35 | White-Label Estate Branding Design | CARRY/AMEND | ⬜ | PeakView360 post-login theming. |
| — | `azure-restructuring-plan.md` | CARRY | ⬜ | Note the merger layer on top of the Azure re-derivation. |
| — | `docs/data-model.sql` | AMEND | ✅ | Mirrored the 5 v2.0 migrations (unified-platform section appended). |

### Business docs (parallel)
| Artifact | Disposition | Status | Notes |
|---|---|---|---|
| `business/unified-product-vision.md` | AMEND | ⬜ | Correct cloud-pillar naming PeakLogic → PeakLogicSystems; it remains the north-star. |
| `business/platform-commercialization-roadmap.md` | CARRY | ⬜ | Note superseded-for-planning by PeakLogic-first (already flagged in the vision doc). |
| `business/business-development-and-strategy.md` | CARRY | ⬜ | Naming/positioning. |

---

## 4. Working rules for this sweep

- **Dependency order, always.** Spine (Vision→PRD→SRS→Domain Model) before anything downstream; a later doc may force a spine revision — if it does, go back and fix the spine, don't paper over it.
- **One doc, one commit.** Per the repo's git discipline. Update this tracker's Status column in the same commit that completes an artifact.
- **Preserve real code truth.** Existing shipped code (RLS isolation, Policy Engine, AI Tier-1, channel-partner work, the Azure kill switch) is reconciled, not discarded — the same "existing code is reference, not authoritative" rule the project already runs on.
- **Honesty ledger.** Keep the real-vs-designed-vs-roadmap distinction explicit; the Hubs' PLC drivers, PeakView360, and PeakAssist are design-stage, not built.
- **Checkpoint after Phase 1** for user review before cascading.

### 4a. Code reconciliation — reconcile the code as we go (user directive, 2026-07-24)

Each artifact update is paired with reconciling the **real code** against it, not just the prose — the same rhythm that shipped AI Tier-1 alongside its design doc. What "reconcile" means is deliberately tiered, so the sweep stays honest about scale:

- **Naming in code/config** (cross-cutting, do early with Phase 0): fix real divergent references. First pass is a grep of the retired names across the whole repo to scope the footprint. Note up front: the code prefix is already `peaklogic`/`PeakLogic` (`peaklogic-api`, `PeakLogic-dev-Api`) — consistent with the company name — so the retired product names (PeakVantage/PeakView/Vantage) are expected to live mostly in **docs and comments**, not in resource identifiers. Renaming any deployed resource *identifier* is a breaking infra change and is explicitly **out of scope** here — nothing is deployed, but identifier churn would still ripple through infra/tests for no benefit. Scope this to human-readable strings, comments, and doc-like content only.
- **Existing capabilities** (verify + close small real gaps): confirm shipped code matches the now-amended doc; where a small, self-contained gap surfaces (the way `metric_baselines` had no writer), close it with real, tested code + a migration.
- **Net-new pillars** — PeakView360 (HMI/SCADA), PeakLogic Hubs (PLC drivers), PeakAssist — are **design-stage**. "Reconciliation" for these is honest recording (they don't exist yet) plus, where a genuinely self-contained first increment makes sense, building it. **This sweep does not attempt to build three whole new product pillars** — that would be dishonest to promise. New backend/schema increments are built only where they're small, real, and testable now; everything larger is sequenced as follow-on work, disclosed as such.
- **One change, one commit; code and its doc land together or back-to-back.** Typecheck (`npm run typecheck`) and, where tests exist, the test suite must pass before committing any code change.

**Clickthrough demo updated (2026-07-25):** `prototypes/super-console-demo.html` gained an *Operations* nav group + one-click **PeakAssist** help — four working views (PeakView360 operator screen, PeakLogic Hubs fleet, CMMS work orders + PM, Compliance/DMR) + a contextual offline-badged help drawer with per-alarm deep-links. Wired through the existing generic `nav:` dispatch (low-risk). **Headless-browser verified: all views render, help drawer contextual, existing views intact, zero console errors.** README updated. Still a design-target prototype (illustrative data, no backend), not the real PeakView360 SPA.

**Backend increments built (2026-07-25, user directive "build everything"):** on the v2.0 schema, three self-contained tested modules (pure logic + fan-out handler + Timer main, mirroring silence-detection): **PM work-order generation** (`backend/jobs/pm-generation*`), **compliance report generation** (`backend/compliance/report-generator`, generation≠delivery, operator=filer-of-record), **PeakAssist resolution** (`backend/shared/peakassist`). **20 new tests; full suite 174/174 green; typecheck clean.** Not deployed (no Functions-hosting module yet) — same disclosed state as silence-detection. The PeakView360 SPA, PLC drivers, and PeakAssist delivery/sync remain large net-new surfaces, not built.

## 5. Revision history
| Version | Date | Notes |
|---|---|---|
| v0.1 | 2026-07-24 | Initial tracker: canonical naming locked; 38 artifacts + 2–3 net-new classified across 4 phases. |
