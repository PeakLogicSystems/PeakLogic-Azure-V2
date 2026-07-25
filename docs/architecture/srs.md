# Software Requirements Specification (SRS)

**Company:** PeakLogic  ·  **Project codename:** Project Vantage
**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Status:** 🟡 Draft v2.0 — unified-platform reframe (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1.5 until v1.6–v2.0 are approved)
**Depends on:** [Vision Document](vision-document.md) (Draft v2), [PRD](prd.md) (Draft v2.0 — mirrors this amendment)
**Last updated:** 2026-07-25
**v2.0 reframe note:** mirrors PRD v2.0's unified-platform requirements — adds §3.20–§3.25 (PeakView360, PeakLogic Hubs, CMMS, compliance automation, PeakAssist, MooreView absorption). Naming canonical per `unified-platform-integration-plan.md` §1.
**Fork note (v1.7):** mirrors the PeakLogic-Azure fork's PRD v1.7 amendment (`azure-restructuring-plan.md` §3) — see Revision History. The AWS-native `PeakLogic-AWS` repo's own SRS is unaffected.

---

## 1. Introduction

### 1.1 Purpose

The PRD says *what* we are building and in what priority order. This SRS says *how the system must behave* — precise enough that (a) engineering can implement against it without re-deriving intent, and (b) a future Test Strategy artifact (#18) can write a test per `shall`-statement without ambiguity. Every requirement here traces to a PRD requirement ID; where this document adds detail the PRD didn't specify, it's marked **(SRS-new)** and must not contradict PRD scope or priority.

This SRS covers the **MVP** horizon only, matching the PRD's horizon. Enterprise-roadmap items (actuation, active electrical load conditioning, a self-service adapter marketplace, MCP-client behavior) are referenced only where the architecture must not preclude them later.

### 1.2 Scope

In scope: the device-adapter framework, the sensing modalities and alerting pipeline, device-management UX, multi-tenancy, device/command networking (outbound-only, no actuation), the MCP server and baseline analytics, channel-partner attribution, and — for the pool-servicing vertical specifically, added v1.5 — a scoped partner operational-dispatch portal (territory/route management, AI-assisted dispatch suggestions) — as bounded by PRD §4.

Out of scope (deferred to later artifacts per PRD §9): exact domain entities/relationships (→ **Domain Model**, #4), SOC 2 control-level detail (→ **Compliance & Certification Roadmap**, **SOC 2 Control Mapping & Evidence Plan**, #5/#20), screen-level UX (→ **UX Wireframes**/**Information Architecture**, #8–9), schema/API contracts (→ **Database Schema**/**API Specification**, #10–11), and the actuation/command security model (→ **Device & Command Security Architecture**, #12).

### 1.3 Definitions, Acronyms, Abbreviations

| Term | Meaning |
|---|---|
| **Device adapter** | A defined contract (metrics, units, alert-rule thresholds, default specs) that lets a device/sensor category plug into ingest without changing core dispatch logic |
| **Telemetry** | A single timestamped `(device, metric, value)` reading ingested from a device |
| **Alert** | A record produced when a telemetry value trips a device adapter's threshold rule, following the existing severity/status/dedup lifecycle |
| **Tenant** | An isolated customer organization; all data and auth are tenant-scoped |
| **MCP server / MCP tool** | The Model Context Protocol server PeakLogicSystems exposes; a "tool" is one callable capability it offers (e.g. "list open alerts for a site") |
| **Trailing window** | The rolling historical period (§3.7, AI-3) a baseline-analytics computation compares a new reading against |
| **Channel partner** | A reseller/supplier (e.g. a pool-chemical supplier) whose customers' tenants/devices are attributed to them for revenue-share purposes. **For the pool-servicing vertical**, also the entity that logs into the scoped operational-dispatch portal (§3.12) *(added v1.5)* |
| **Territory** | A named geographic boundary (drawn on a map) a channel partner defines to group their attributed tenants' sites for technician assignment purposes *(added v1.5)* |
| **Commands topic** | The per-device MQTT topic already scoped in the IoT device policy for future actuation; unused at MVP (CC-3) |
| MVP requirement IDs (`DA-`, `SN-`, `AL-`, `UX-`, `MT-`, `CC-`, `MCP-`, `AI-`, `CH-`, `TR-`) | Defined in [PRD](prd.md) §5; reused verbatim in this SRS as the traceability key. `TR-` (Partner Territory & Dispatch) added v1.5 |

### 1.4 References

- [Vision Document](vision-document.md) v1
- [PRD](prd.md) v1
- `backend/ingest/handler.ts`, `docs/data-model.sql` — existing v1.0.0 implementation this SRS reconciles against, per `docs/architecture/README.md`'s governance model

### 1.5 Document Conventions

- **Shall** = mandatory, testable system behavior (maps to PRD Must).
- **Should** = expected behavior, may slip without blocking MVP (maps to PRD Should).
- **May** = optional/discretionary.
- Requirement IDs follow the PRD's category prefixes (`DA-`, `SN-`, `AL-`, `UX-`, `MT-`, `CC-`, `MCP-`, `AI-`, `CH-`) with a decimal suffix for SRS-level elaboration (e.g. `DA-1.1` elaborates `DA-1`). Two categories not broken out separately in the PRD get their own prefixes here because they need system-level specification: `AUTH-` (authentication/authorization) and `AUD-` (audit logging), both implied by PRD §6's Security baseline NFR but not previously itemized.

### 1.6 Overview

Section 2 describes the system at a black-box level. Section 3 is feature-by-feature functional specification. Section 4 covers external interfaces. Section 5 elaborates non-functional requirements. Section 6 bounds data requirements pending the Domain Model. Section 7 states the verification principle each requirement must satisfy. Section 8 is the traceability matrix.

---

## 2. Overall Description

### 2.1 Product Perspective

PeakView MVP is **not** a greenfield system — it reconciles and extends the existing v1.0.0 implementation, per `docs/architecture/README.md`'s governance model. Components marked *(existing)* below are kept as-is unless a requirement in §3 says otherwise; components marked *(new)* are net-new work this SRS specifies.

```
IoT Device (MQTT/TLS, outbound-only)                    Browser (React SPA)
        │                                                        │
        ▼                                                        ▼
Azure IoT device gateway (mechanism TBD — #12)      CDN/static hosting (mechanism TBD — #16)
        │  Routing rule                                          │
        ▼                                                        ▼
peaklogic-ingest function (existing logic, host TBD)  API layer + identity-provider authorizer (mechanism TBD — #13)
        │                                                        │
        ├── Device Adapter Registry (new — formalizes            ▼
        │   existing RULES_BY_CATEGORY, §3.1)         peaklogic-api function (existing logic, extended)
        ├── Alert / Ticket pipeline (existing)                    │
        └── Baseline Analytics (new, §3.7)                        ├── router.ts → routes/*.ts (existing)
                                                                   ├── requireRole() → withTenant() RLS (existing)
                                                                   └── MCP Server (new, §3.7)
                                                                              │
                                                          External AI/Agent Consumer (new integration surface)

Azure Database for PostgreSQL (RLS-enforced) ── tenants, users, sites, assets, devices, telemetry, alerts, service_tickets
Identity provider (mechanism TBD — #13) ── auth/RBAC
```

*(Corrected v1.7 — this diagram previously named AWS IoT Core/Lambda/API Gateway/Cognito/CloudFront/RDS verbatim, describing the repo this was forked from. The **logic** at each node — adapter dispatch, alert/ticket pipeline, RLS-scoped router, MCP server — is reconciled and kept unchanged; only the underlying Azure service at each node is left open, deliberately, pending Device & Command Security Architecture (#12), Security Architecture (#13), and Infrastructure as Code (#16).)*

This is a system-context sketch, not a final architecture decision — final component boundaries and data flow belong to the API Specification (#11) and Device & Command Security Architecture (#12) artifacts.

### 2.2 Product Functions (summary)

1. Ingest telemetry from devices across electrical, water (flow and chemistry), gas, temperature, and air-quality modalities.
2. Evaluate each modality's readings against a device adapter's threshold rules and produce alerts through the existing alert/ticket pipeline.
3. Let new sensing modalities/device categories be added via the adapter contract without forking ingest dispatch logic.
4. Provide a device-management UX simple enough for a non-technical facility operator, with no manual required.
5. Enforce tenant isolation at every layer (data, auth) — reconciled from existing RLS/Cognito implementation, extended to new modalities automatically.
6. Connect devices outbound-only over persistent MQTT/TLS; no actuation ships at MVP.
7. Expose an MCP server surfacing devices, alerts, and telemetry as tools for external AI/agent consumers.
8. Compute baseline real-time analytics (trend/anomaly detection) over telemetry, beyond static thresholds.
9. Attribute tenants/devices to channel partners for revenue-share reporting.
10. **For the pool-servicing vertical**, let a channel partner log into a scoped operational-dispatch portal, define technician territories on a map, and receive an AI-generated advisory daily route suggestion per technician *(added v1.5)*.
11. Plot a tenant's site portfolio on an interactive map, distinguishing risk status per site *(added v1.7)*.
12. Optionally display an associated 3D model for a Site or Asset, when one exists *(added v1.7, first-pass/Should)*.

### 2.3 User Classes and Characteristics

Reused from PRD §3 (full personas deferred to artifact #6):

| Role | Technical sophistication | Primary environment |
|---|---|---|
| Facility Operator | Low; time-pressured, non-technical | Web dashboard, on-site |
| Tenant Admin | Moderate-to-high (configures sites/devices/users) | Web dashboard, office |
| Service Partner | Moderate | Web dashboard, on-site/mobile browser |
| Channel Partner / Reseller | Low-to-moderate | N/A for most verticals (attribution only). **For the pool-servicing vertical**, a dedicated web portal — territory/route management, dispatch view *(added v1.5)* |
| External AI/Agent Consumer *(system actor, not a login role)* | N/A | Queries MCP server programmatically |
| PeakLogic Superadmin *(added v1.6)* | High — internal PeakLogic staff | Administration Console (§3.13), full internal tooling access |
| PeakLogic Account Manager *(added v1.6)* | Moderate-to-high — internal PeakLogic staff | Administration Console (§3.13), scoped to an assigned subset of accounts |

### 2.4 Operating Environment

- **Backend/cloud**: Azure *(corrected v1.7 — this line previously named the AWS-native stack verbatim)* — device connectivity, serverless compute, managed PostgreSQL, identity, API layer, and CDN/static hosting, provisioned via a real IaC tool (choice not yet made — Infrastructure as Code, #16). The application-level logic (RLS, adapter dispatch, router/RBAC) is reconciled and kept; the underlying Azure services are being newly selected for this track, not reconciled from the AWS implementation 1:1.
- **Client**: responsive web dashboard (React SPA) only; no native mobile app at MVP (PRD §7).
- **Device firmware**: outbound-only MQTT/TLS; port 443 preferred over 8883 for new firmware (CC-2).

### 2.5 Design and Implementation Constraints

- The device adapter contract (§3.1) must be addable without modifying core ingest dispatch logic — no new sensing modality may require forking `backend/ingest/handler.ts`'s dispatch flow, only adding a new adapter definition.
- Multi-tenant isolation must remain structural (Postgres RLS via `withTenant()`), not an application-level filter alone — new modalities inherit this automatically via the existing `assets`/`devices` foreign-key model (MT-3).
- The per-device `commands` MQTT topic, already scoped in the IoT device policy, must remain unpublished-to at MVP (CC-3) — no code path may send a command to a device.
- The MCP server must authenticate through the existing Cognito-issued tokens — no parallel auth system (MCP-2).
- **Channel-partner portal login (§3.12, added v1.5) is a genuinely new identity surface** — channel partners have had no login/auth concept of any kind before this amendment (no Cognito group, no `users` table relationship). This constraint is flagged, not resolved, here: the concrete mechanism (new Cognito group vs. new user pool, partner-scoped JWT claims) is Security Architecture's (#13) job to amend, not this SRS's.
- **The Administration Console (§3.13, added v1.6) is a *third* genuinely new identity surface, and a materially harder one than the channel-partner portal's.** The channel-partner portal's cross-tenant access is read-mostly and narrowly scoped (a technician's own territory). Account Manager access (IA-4/IA-5) needs cross-tenant **read and write** — creating tenant users, onboarding devices, setting baselines — across an *assigned subset* of accounts. This is flagged, not resolved, here: the concrete mechanism (a third Cognito pool vs. an extension of an existing one; how "assigned subset" is enforced at the RLS layer, not just the UI layer) is Security Architecture's and Multi-Tenant Architecture's job to amend. It directly intersects an already-known gap: no non-owning application database role exists yet (Technical Debt Register TD-7) — an console with real cross-tenant write access sharpens why that gap matters, it doesn't yet close it.
- **TR-3's external AI agent consuming the MCP server does not conflict with AI-4.1.** AI-4.1 forbids PeakLogic's own AI/analytics layer from *calling out* to an external MCP server; TR-3 is the opposite direction — an external agent calls *into* PeakLogic's own MCP server, the same access pattern any other MCP client already uses (§3.7). Noted explicitly so a future reader doesn't misread these as contradictory.
- **The mapping technology behind §3.16 (added v1.7) is deliberately undecided at this level.** Azure Maps vs. a third-party option is an implementation choice for UX Wireframes (#8)/API Specification (#11) to make, per `azure-restructuring-plan.md` §4 — not assumed here.
- **§3.17's (added v1.7) 3D rendering scope is deliberately left open** — file format, rendering approach (web vs. native), and storage mechanism are explicitly not decided in this SRS, mirroring the PRD's own first-pass treatment of 3DR-1–3DR-3. Domain Model/Database Schema must not design against an assumed shape for this feature.

### 2.6 Assumptions and Dependencies

- Domain Model (#4) will formalize entity/relationship structure this SRS refers to loosely (Device, Asset, Adapter, Telemetry, Alert, Tenant, etc.); where this SRS names an entity, it is a placeholder pending that artifact.
- ~~Threshold/reference values for new sensing modalities are placeholders pending real verified input~~ — **resolved 2026-07-11** (was Open Issue #1, §9): pool-chemistry (pH, free chlorine) and gas-detection thresholds are now real, cited values (SN-4.1, SN-5.1). This SRS still specifies the *mechanism* (adapter contract, alert pipeline) as its primary job — the same way IronQuill's SRS separates mechanism from the Regulatory Requirements Matrix's content — but the specific content gap this bullet flagged no longer exists for the two modalities named here.
- Device & Command Security Architecture (#12) will define the actuation/command model when that work is scheduled; this SRS only guarantees the `commands` topic exists and stays unused (CC-3/CC-4).
- **Territory/technician/route-assignment entities (§3.12, added v1.5) have no formal data model yet** — Domain Model (#4) will need its own amendment, the same as every other entity this SRS names loosely pending that artifact.
- **PeakLogic staff users and account-manager-to-account assignments (§3.13, added v1.6) have no formal data model yet** — same pattern, Domain Model (#4) needs its own amendment for these too, including the "book of business" assignment relationship (IA-4) that doesn't map onto any existing entity.
- **A 3D-model-asset-reference entity (§3.17, added v1.7) has no formal data model yet, and deliberately won't until the open scoping items (file format, storage) are resolved** — Domain Model (#4) should not invent a shape for this ahead of that. `sites.lat`/`sites.lng` backing §3.16 already exist and need no new entity, only a Database Schema amendment confirming their portability to Azure Database for PostgreSQL.

---

## 3. System Features

### 3.1 Device Adapter Framework (→ PRD §5.1 DA-1–DA-5)

**Description:** The contract every sensing modality plugs into. No modality may bypass it with modality-specific ingest logic.

| ID | Requirement |
|---|---|
| DA-1.1 | The system shall dispatch ingested telemetry to a device adapter looked up by the device's `category`, and adapters shall be addable by defining a new adapter object — no change to the dispatch function itself |
| DA-2.1 | Each adapter shall declare: required/optional metric names and units, a list of threshold rules (metric, condition, static-or-spec-derived threshold, severity, message template), and default spec values used when an asset's `specs` are not set |
| DA-3.1 | Adapters shall be registered via a code change deployed by PeakLogic engineering at MVP; no runtime/dynamic registration path (e.g. an uploaded adapter definition) shall exist yet |
| DA-4.1 | Ingest should validate an incoming metric against its adapter's declared unit where feasible, and should log (not reject) a mismatch, so malformed device firmware is diagnosable without dropping data |
| DA-5.1 | The adapter lookup (DA-1.1) shall not distinguish white-label PeakView 360 devices from third-party/open-source devices by any privileged code path — the device's `category` and adherence to the adapter contract are the only gate |

**Error/edge conditions:** telemetry arrives for a `category` with no registered adapter (system shall store the telemetry but skip alert evaluation, per existing behavior, not reject the ingest); an adapter's spec-derived threshold function receives null specs (system shall fall back to the adapter's declared defaults, per existing `??` pattern in `RULES_BY_CATEGORY`).

### 3.2 Sensing Modalities (→ PRD §5.2 SN-1–SN-7)

| ID | Requirement |
|---|---|
| SN-1.1 | Electrical power draw (`power_kw`) shall be evaluated against spec-derived warning/critical thresholds, extending the existing `energy_meter`/`pump` adapters |
| SN-2.1 | Water flow rate (`flow_lpm`) shall be evaluated against spec-derived minimum-flow thresholds, extending the existing `pump`/`pool_system` adapters |
| SN-3.1 | A binary leak-detected signal shall produce an immediate critical alert with no warning tier, per the existing `leak_sensor` adapter |
| SN-4.1 | A new `pool_chemistry` adapter shall evaluate pH and free chlorine against thresholds sourced from CDC's Model Aquatic Health Code (5th Ed., Dec 2024), and TDS against an industry-standard (non-CDC) threshold — **resolved 2026-07-11, no longer placeholders** (was Open Issue #1, §9). Total chlorine is not yet implemented — a disclosed, real gap, not a silent omission |
| SN-5.1 | A new `gas_sensor` adapter shall evaluate a binary gas-leak-detected signal identically in structure to SN-3.1 (immediate critical alert, no warning tier) — **resolved 2026-07-11**, no concentration/PPM threshold needed at MVP given this binary structure |
| SN-6.1 | Ambient and product-probe temperature shall continue to be evaluated per the existing `hvac`/`refrigeration`/`pool_system` adapters, unchanged |
| SN-7.1 | A new `air_quality` adapter shall evaluate at least one representative metric (e.g. CO2 ppm) against a threshold rule; additional pollutant metrics are a content addition to this adapter later, not a re-architecture |

**Error/edge conditions:** a `pool_chemistry` or `gas_sensor` reading arrives for a metric not yet implemented (e.g. total chlorine) — system shall still store the telemetry (unaffected by rule evaluation) and simply not evaluate a rule against it, per DA-1.1's existing "no adapter for this category" behavior extended to "no rule for this metric."

### 3.3 Alerting & Service Tickets (→ PRD §5.3 AL-1–AL-3)

| ID | Requirement |
|---|---|
| AL-1.1 | Every adapter's fired threshold rule shall produce an alert through the existing `alerts` table and deduplication logic (open/acknowledged alert of the same device+metric+severity suppresses a duplicate) — no modality gets its own alert table or dedup logic |
| AL-2.1 | A critical-severity alert shall continue to auto-create a `service_tickets` row and fire the tenant's configured webhook, unchanged from existing behavior, regardless of which adapter produced it |
| AL-3.1 | New modalities (SN-4–SN-7) shall use the existing `severity` (`info`/`warning`/`critical`) and `status` (`open`/`acknowledged`/`resolved`/`suppressed`) enums without extension |

### 3.4 Device Management UX (→ PRD §5.4 UX-1–UX-3)

| ID | Requirement |
|---|---|
| UX-1.1 | Adding a device shall be completable in a small, fixed number of steps (target: comparable to pairing a consumer smart-speaker) — exact screen flow deferred to UX Wireframes (#8), but this SRS requires the step count and required-field count be explicitly measured against that target, not assumed |
| UX-2.1 | Device list/detail views shall surface health status, last-seen timestamp, and open alert count without requiring the viewer to separately query tenant/asset/device relationships |
| UX-3.1 | Existing frontend pages (`Devices.tsx`, `Assets.tsx`, `Sites.tsx`) shall be reconciled from hardcoded mock data (`MOCK_DEVICES`, `MOCK_ASSETS`, `MOCK_SITES`) to the real API, removing the `VITE_PREVIEW` Cognito bypass as a production code path (it may remain as a local-dev-only flag) |

### 3.5 Multi-Tenancy (→ PRD §5.5 MT-1–MT-3)

| ID | Requirement |
|---|---|
| MT-1.1 | Every data-layer query touching a tenant-scoped table shall go through `withTenant()` (existing), which sets `app.current_tenant_id` and activates Postgres RLS — reconciled, no change required |
| MT-2.1 | Tenant isolation at the auth layer shall continue to be enforced via Cognito-issued, tenant-scoped claims — reconciled, no change required |
| MT-3.1 | New adapters (§3.1, §3.2) shall require no modality-specific tenant-isolation logic — isolation is inherited automatically via the existing `assets`/`devices` foreign-key chain into RLS-protected tables |

### 3.6 Device & Command Networking (→ PRD §5.6 CC-1–CC-4)

| ID | Requirement |
|---|---|
| CC-1.1 | Devices shall connect to AWS IoT Core over persistent MQTT/TLS, outbound-initiated only — reconciled from existing implementation, no inbound network path shall exist |
| CC-2.1 | New device firmware/provisioning defaults (`scripts/provision-devices.ts`'s `device-config.json` output) should specify port 443 rather than 8883 |
| CC-3.1 | No backend code path shall publish to a device's `commands` MQTT topic at MVP, even though the IoT device policy already scopes it for future use |
| CC-4.1 | No API endpoint, Lambda, or scheduled job shall exist that issues a shutoff/actuation command to any device at MVP |

**Error/edge conditions:** a device firmware update changes its connection port from 8883 to 443 — no backend change is required, since AWS IoT Core serves both ports identically; this is purely a device-firmware/provisioning concern (CC-2.1).

### 3.7 AI & MCP Orchestration (→ PRD §5.7 MCP-1, MCP-2, AI-3, AI-4)

| ID | Requirement |
|---|---|
| MCP-1.1 | The system shall expose an MCP server offering, at minimum, tools to: list devices/alerts for a tenant, fetch telemetry for a device within a time range, and fetch alert detail — read-only at MVP, no tool shall mutate state. **Extended v1.5**: for the pool-servicing vertical, additionally list a channel partner's territories/technicians and fetch a territory's sites with current status — the read tools TR-3.1's external dispatch agent depends on |
| MCP-2.1 | MCP tool calls shall authenticate using the same Cognito-issued tokens as the REST API, and shall enforce the same tenant scoping (`withTenant()`, MT-1.1) — no separate auth or authorization path |
| AI-3.1 | Baseline analytics shall compute, for each device/metric pair with sufficient history, a trailing-window statistical baseline (e.g. mean/standard-deviation over a rolling period) and shall flag a reading whose deviation from that baseline exceeds a configured threshold, independent of the adapter's static threshold rules |
| AI-3.2 | A trend/anomaly flag from AI-3.1 shall be surfaced through the existing alert pipeline (AL-1.1) as its own `type` (distinct from `threshold`), so it is visually and functionally distinguishable from a static-threshold alert |
| AI-3.3 | The deviation threshold that triggers an AI-3.1 flag shall be configurable at minimum per adapter/category *(added — see Revision History)* — a hardcoded, one-size-fits-all sensitivity is not acceptable given how directly alert-fatigue tolerance drives whether a Site-Level Facility Operator keeps trusting the product (User Personas §6 item 3) |
| AI-4.1 | No code path shall exist at MVP where PeakLogicSystems' AI/analytics layer initiates a call to an external MCP server — this is a hard MVP boundary, not a performance target |

**Error/edge conditions:** a device/metric pair has insufficient history for a trailing-window baseline (AI-3.1 shall not fire a flag until a minimum history threshold is met — no flag is preferable to a flag computed on too little data).

**Implementation status (2026-07-21, `ai-analytics-layer-design.md` Tier 1 shipped, `AI_ANALYTICS_ENABLED`-gated):** AI-3.1 met (`backend/ingest/baseline.ts` + `anomaly.ts` — EWMA trailing baseline, minimum-history withholding). AI-3.2 met (emits `alerts.type='anomaly'` through the existing pipeline). **AI-3.3 NOT yet met** — `anomaly.ts`'s `MIN_SAMPLES_FOR_ANOMALY`/`DEFAULT_SIGMA_THRESHOLD` are hardcoded module constants today, not configurable per adapter/category. Deliberate, disclosed gap for this first cut (zero real telemetry history exists yet to tune per-category values against); the fix is a Policy Engine `anomaly` policy kind (already flagged as pending in the design doc §10), not a re-architecture.

### 3.8 Channel & Partner Support (→ PRD §5.8 CH-1–CH-3)

| ID | Requirement |
|---|---|
| CH-1.1 | A tenant record shall support an optional channel-partner reference (identifying which reseller/supplier relationship the tenant came through) |
| CH-1.2 | No tenant-facing API path shall allow a tenant to set or change its own channel-partner reference — assignment is performed by PeakLogic-internal operations only (mechanism deferred, analogous to CH-3.1's deferred tooling). A tenant-facing read is permitted, displaying the supplier's actual name, never the generic classification term "channel partner" *(added — see Revision History)* |
| CH-2.1 | The system should provide a queryable report of tenants/devices grouped by channel-partner reference, for manual/offline revenue-share calculation — not an automated billing/payout feature |
| CH-3.1 | A scoped, operational-only partner portal — white-label branded login, dispatch-focused view (territories, routes, site chemistry/status) — shall exist at MVP **for the pool-servicing vertical**, elaborating PRD CH-3 (revised v1.5). The portal shall grant no access to a tenant's own settings, billing, or user management |
| CH-3a.1 | Full tenant-management access for partners, automated revenue-share/billing calculation, and any proprietary AI-routing/optimization engine shall not exist at MVP, elaborating PRD CH-3a *(added v1.5)* |

### 3.9 Authentication & Access Control — **(SRS-new)** (implied by PRD §6 Security baseline)

**Description:** Not broken out as its own PRD section but required by MT-2, MCP-2, and the Security baseline NFR. Specified here because the MCP server (§3.7) and channel-partner attribution (§3.8) both depend on a concrete identity/role model.

| ID | Requirement |
|---|---|
| AUTH-1 | The system shall authenticate all users via Cognito; no API or MCP endpoint that reads or writes tenant data shall accept unauthenticated requests |
| AUTH-2 | The system shall enforce role-based access control with, at minimum, the roles in PRD §3 (Facility Operator, Tenant Admin, Service Partner) plus the reserved system-actor path for MCP consumers (not a login role) |
| AUTH-3 | A user's role shall be enforced server-side on every API call and every MCP tool call — client-side role gating alone is not sufficient |

### 3.10 Audit Logging — **(SRS-new)** (implied by PRD §6 Security baseline, CH-2.1)

| ID | Requirement |
|---|---|
| AUD-1 | State-changing administrative actions (device claim, tenant/user config change, channel-partner attribution change) shall be logged with actor, action, target entity, and timestamp |
| AUD-2 | Audit log entries shall be tenant-scoped by the same RLS enforcement as MT-1.1, not application-level filtering alone |

### 3.11 Portfolio & Route Reporting (→ PRD §5.9 RP-1–RP-4) *(added — see Revision History)*

| ID | Requirement |
|---|---|
| RP-1.1 | The system shall provide a query/view returning aggregate status across every Site a Tenant Admin or Corporate/Regional Ops Leader is authorized to see, scoped by the existing tenant/RLS model (MT-1.1) — not a per-device query repeated by the client. The response shall separately report **sites with an open `trend`/`anomaly`-type alert** (AI-3.2) versus **sites with an open `threshold`-type alert**, so a client can render "trending toward risk" distinctly from "currently in alarm" *(added — see Revision History)* |
| RP-2.1 | The system shall provide a query/view returning a Service Partner's assigned sites for the current day, ordered by a defined urgency ranking (e.g. open critical alerts first, then trending-toward-threshold per AI-3.1, then healthy). Each site's entry shall include its devices' current adapter-specific readings (e.g. `pool_chemistry` pH/chlorine/TDS values, `refrigeration` product temperature) — not solely a health-state/alert summary *(added — see Revision History)* |
| RP-4.1 | The system shall provide a query/view returning every Site a Tenant Admin is authorized to see, including full address (street, city, state, zip — per the existing `sites.address` JSONB), scoped by the existing tenant/RLS model (MT-1.1). The view shall support sorting/filtering by city and state, independent of and without requiring RP-1.1's health/alert-status grouping *(added — see Revision History)* |

**Error/edge conditions:** a Tenant Admin/Ops Leader has zero sites, or a Service Partner has zero assigned stops for the day (RP-1.1/RP-2.1/RP-4.1 shall return an empty, valid result — not an error state).

### 3.12 Partner Territory & Dispatch (→ PRD §5.10 TR-1–TR-3) *(added v1.5 — see Revision History)*

**Description:** For the pool-servicing beachhead vertical specifically — a channel partner's operational-dispatch portal (CH-3.1), letting them define technician territories, assign technicians, and receive an AI-generated advisory daily route. Reuses RP-2.1's existing urgency-ranking and per-site reading logic rather than a parallel implementation.

| ID | Requirement |
|---|---|
| TR-1.1 | A channel partner shall be able to define a named territory — a geographic boundary — that groups a subset of their attributed tenants' sites. A site's membership in a territory shall be derived from whether its coordinates (`sites.lat`/`sites.lng`, already existing) fall within the territory's boundary |
| TR-2.1 | A channel partner shall be able to assign one or more technicians to a territory. A technician's daily stop list shall be the set of sites within their assigned territory(ies) that meet RP-2.1's existing urgency criteria (open critical alert, trending-toward-threshold, then healthy) — no separate urgency logic is introduced |
| TR-3.1 | The system shall provide an AI-generated suggested daily route ordering per technician, produced by an external AI agent calling PeakLogic's MCP server (MCP-1.1, extended) — **advisory only**; the system shall require explicit partner confirmation before a suggested route is treated as a technician's final assignment |
| TR-3.2 | No PeakLogic-built route-optimization or scheduling algorithm shall exist at MVP — TR-3.1's ordering is produced entirely by the external agent consuming MCP-1.1's read tools, not by PeakLogic-side logic |

**Error/edge conditions:** a partner has zero territories or zero technicians assigned (TR-2.1 shall return an empty, valid result, not an error state); a technician has zero stops for the day (same, consistent with RP-2.1's existing empty-result behavior); the external dispatch agent is unreachable or returns no suggestion (system shall fall back to RP-2.1's existing urgency-ranked list, unordered by route — a missing AI suggestion degrades to the pre-TR-3 experience, not an error state).

### 3.13 Internal Administration Console (→ PRD §5.11 IA-1–IA-8) *(added v1.6 — see Revision History)*

**Description:** A third identity/access surface, PeakLogic-staff-only, for provisioning and operating tenant/channel-partner accounts. Replaces the manual SQL + AWS CLI process documented today in the System Administrator Guide with a real, in-product tool — while deliberately not opening any customer- or partner-facing self-registration path (AUTH-1 is unchanged for tenant/partner users).

| ID | Requirement |
|---|---|
| IA-1.1 | The system shall provide a PeakLogic-internal identity surface, distinct from the tenant Cognito pool (§3.9) and the channel-partner Cognito pool (§2.5), with exactly two roles: `superadmin` and `account_manager` |
| IA-2.1 | Only a session with role `superadmin` shall be permitted to create a new `tenants` row |
| IA-3.1 | Only a session with role `superadmin` shall be permitted to create a new `channel_partners` row |
| IA-4.1 | An `account_manager` session shall only be able to read or write data belonging to tenants/partners explicitly assigned to that account manager — enforced structurally (RLS or equivalent), not by application-layer filtering alone, consistent with MT-1.1's existing principle for tenant isolation |
| IA-5.1 | Within an assigned account, an `account_manager` session shall be permitted to: create tenant `admin`/`operator` users, claim/assign devices on the tenant's behalf (reusing the existing device-claim flow), set an asset's `specs` (baseline threshold inputs), and update alert status/configuration for that tenant |
| IA-6.1 | A `superadmin` session shall be permitted every action IA-5.1 permits an `account_manager`, for every tenant/partner, without requiring an explicit assignment record — `superadmin` access is not itself an "assignment," it is unconditional |
| IA-7.1 | Every write performed through the console shall be recorded via the existing audit-log mechanism (AUD-1/AUD-2), with the acting staff member's identity and the target tenant/partner recorded — extending the existing dual-scope (tenant/channel-partner) audit model to a third actor type rather than inventing a parallel logging mechanism |
| IA-8.1 | No endpoint under this identity surface shall accept an unauthenticated request, and no endpoint shall permit a tenant or channel-partner user to create a `tenants` or `channel_partners` row — that capability is exclusive to `superadmin` |
| IA-9.1 | Device/site provisioning and per-asset threshold configuration performed under IA-5.1/IA-6.1 shall reuse the tenant's or channel-partner's own provisioning/threshold screens and API contract, entered via the existing act-as session context — not a parallel, staff-only form or endpoint set *(added — see Revision History)* |

**Error/edge conditions:** an `account_manager` session with zero assigned accounts (IA-4.1 shall produce an empty, valid result, not an error); a `superadmin` action targets a tenant/partner that doesn't exist (shall be rejected with a real error, not silently create a duplicate).

**A real, unresolved gap, not settled by IA-9.1 alone**: whether act-as literally mounts the tenant/partner-side frontend inside the console's own chrome (an iframe or route-level embed), or the console has its own UI calling the identical tenant-facing API endpoints under the acting-staff session, is an open UX Wireframes/API Specification question. IA-9.1 only commits to *behavioral* parity (same screens, same capabilities) — not which of those two implementations is used.

### 3.14 Settings & Preferences (→ PRD §5.12 SET-1–SET-8) *(added v1.6 — see Revision History)*

**Description:** A conventional settings area for the tenant-side web application. Distinct from §3.13 — this is tenant/operator-facing, not internal-staff-facing.

| ID | Requirement |
|---|---|
| SET-1.1 | The system shall expose a Settings page reachable from the same location in the navigation on every authenticated page |
| SET-2.1 | The system shall allow a user to change their own password through the Settings page, using Cognito's existing change-password capability — no parallel credential store |
| SET-3.1 | The system shall allow a user to select a 12-hour or 24-hour clock format; every timestamp rendered anywhere in the application shall respect this preference |
| SET-4.1 | The system shall allow a user to select a display timezone; every timestamp rendered anywhere in the application shall be converted to and displayed in that timezone. This preference is independent of `sites.timezone` (an existing, separate field describing a Site's own local timezone, not the viewing user's) |
| SET-5.1 | The system shall allow a user to select a light or dark visual theme; the selection shall apply consistently across every page, not per-page |
| SET-6.1 | The system shall allow a user to view their enrolled MFA method and re-enroll (e.g. after a lost device), reusing Cognito's existing MFA management capability |
| SET-7.1 | For a `tenant_admin`-role session, the system shall provide a Team/Users panel listing the tenant's own users with their role, and shall permit creating/updating/removing those users — a product-facing equivalent of the AWS-Console process documented in the System Administrator Guide §5.2, not a new access model |
| SET-8.1 | *(Could, not committed — see PRD SET-8)* If a real outbound email-notification mechanism exists, the system shall allow a user to select which alert severities trigger an email; if no such mechanism exists yet, this requirement is deferred, not silently dropped |

**Error/edge conditions:** none of SET-1.1–SET-7.1 depend on the user having any sites, assets, or devices — a newly-created user with an empty tenant still gets a fully functional Settings page.

### 3.15 Site → Asset → Device Drill-Down & Device Telemetry Detail (→ PRD §5.13 NAV-1–NAV-5) *(added v1.6 — see Revision History)*

**Description:** The Sites, Assets, and Devices pages (§3.4) exist today as three independent, unlinked list views. This section specifies real navigation between them, and clarifies — checked directly against `docs/data-model.sql`, not assumed — that `devices.asset_id` carries no uniqueness constraint, so the one-Asset-to-many-Devices relationship (e.g. a pump asset monitored by a separate flow sensor, energy monitor, leak sensor, and power actuator, each its own `devices` row) is already structurally correct and requires no schema change, only UI and API work.

| ID | Requirement |
|---|---|
| NAV-1.1 | The system shall provide a Site Detail view, reachable from the Sites list, returning every Asset where `assets.site_id` matches the selected site |
| NAV-2.1 | The system shall provide an Asset Detail view, reachable from the Site Detail view or the Assets list, returning every Device where `devices.asset_id` matches the selected asset — the response shall not assume or enforce a maximum of one device |
| NAV-3.1 | The system shall provide a Device Detail view, reachable from the Asset Detail view or the Devices list, returning that device's current/most-recent telemetry reading(s) and a recent history window, using the existing `GET /v1/telemetry?deviceId=` endpoint (already implemented) — this view shall render whichever metrics that device's adapter category actually reports (§3.2), not a fixed generic set |
| NAV-4.1 | The channel-partner portal (§3.12) shall provide the same Site → Asset → Device drill-down for a partner's attributed tenant sites, as a browsing capability independent of and in addition to the route/dispatch view (RP-2.1, TR-2.1) |
| NAV-5.1 | **Verified defect, not a hypothetical requirement**: `GET /v1/devices` (`backend/api/routes/devices.ts`) currently takes an `_event` parameter it never reads — no query-string filtering exists at all, and the handler always returns the full tenant device list. This endpoint shall accept optional `assetId` and `siteId` query parameters, filtering server-side, before NAV-2.1/NAV-3.1 are implemented client-side |

**Error/edge conditions:** a Site with zero Assets, or an Asset with zero Devices (NAV-1.1/NAV-2.1 shall return an empty, valid result, not an error); a Device with no telemetry rows yet (NAV-3.1 shall render a "no data yet" state, not an error — consistent with how a newly-claimed, not-yet-reporting device already behaves elsewhere in the system).

### 3.16 Geospatial Site Portfolio Visualization (→ PRD §5.14 GEO-1–GEO-6) *(added v1.7 — see Revision History)*

**Description:** An interactive map view of a tenant's site portfolio, reusing existing `sites.lat`/`sites.lng` — a new view, not new data collection.

| ID | Requirement |
|---|---|
| GEO-1.1 | The system shall provide a query/view returning every Site a Tenant Admin or Corporate/Regional Ops Leader is authorized to see, each with its `lat`/`lng` and current risk-status classification (reusing RP-1.1's existing trend/alarm distinction, §3.11) |
| GEO-2.1 | A Site's map-marker classification shall use the same `trend`/`anomaly` vs. `threshold` alert-type distinction RP-1.1 already computes — no separate classification logic |
| GEO-3.1 | Selecting a Site's map marker shall navigate to the existing Site Detail view (NAV-1.1) |
| GEO-4.1 | The map view shall be additive: RP-1.1 (roll-up) and RP-4.1 (directory) shall remain independently reachable, unaffected by this feature |
| GEO-5.1 | The channel-partner portal (§3.12) shall provide the same map view, scoped to a partner's attributed tenants' sites — mirroring NAV-4.1's existing pattern of extending tenant-side features to that surface |
| GEO-6.1 | A Site with a null `lat` or `lng` shall be excluded from the plotted map and instead surfaced in a separate "unlocated sites" list/count — never plotted at a default or last-known-bad coordinate |

**Error/edge conditions:** zero sites (GEO-1.1 shall return an empty, valid result). **Verified against `docs/data-model.sql`, not assumed**: `sites.lat`/`sites.lng` are nullable columns with no `NOT NULL` constraint, and are already referenced by the existing Territory-containment query (`ST_Contains(terr.boundary, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography)`) — a site with null coordinates already silently fails territory assignment today; GEO-6.1 is the first requirement to surface that condition to a user rather than let it fail invisibly. Whether site creation should require coordinates going forward is not resolved here — flagged for the Database Schema/UX Wireframes amendments.

### 3.17 3D Facility Rendering (→ PRD §5.15 3DR-1–3DR-3) *(added v1.7 — first pass, deliberately high-uncertainty; see Revision History)*

**Description:** Optional 3D visualization of facility/equipment for a Site or Asset. Scoped at behavioral-placeholder level only — see the PRD's own §5.15 note on why this is not fully specified yet.

| ID | Requirement |
|---|---|
| 3DR-1.1 | Where a 3D-model asset reference exists for a Site or Asset, the system should render it in that entity's detail view (NAV-1.1/NAV-2.1) |
| 3DR-2.1 | The system shall treat a 3D model as an out-of-band-authored asset associated by reference — no in-product authoring/editing capability shall exist |
| 3DR-3.1 | The absence of a 3D-model reference for a Site/Asset shall render as a normal, unremarkable state (e.g. the view simply omits the 3D panel) — not an error or a "missing data" warning |

**Error/edge conditions:** none beyond 3DR-3.1's default-absence handling — no further behavior is specified until the open scoping items (file format, rendering approach, storage) are resolved. This section deliberately does not specify a rendering library, a file format validation rule, or a storage/CDN mechanism — doing so before the dedicated scoping pass (PRD §5.15) would be assuming, not specifying.

### 3.18 Device & Firmware Version Catalog (→ PRD §5.16 FW-1–FW-4) *(added v1.8 — see Revision History)*

**Description:** A canonical catalog of supported products/sensor types and the firmware/software versions PeakLogic supports for each, organized into named channels. Surfaced by the Internal Administration Console prototype (§3.13) already modeling a per-device "Firmware channel" (desired) / "Firmware installed" (reported) twin property pair with nothing behind it — today that value is a freely-typed string with no source of truth to validate against.

| ID | Requirement |
|---|---|
| FW-1.1 | The system shall maintain a catalog entity mapping each supported product/sensor type to its set of supported firmware/software versions, each version tagged with a named channel (e.g. `stable`, `beta`) |
| FW-2.1 | A device's reported firmware version (device-twin reported property, §3.13's prototype) shall be checked against FW-1.1's catalog for that device's product type; a version not present in the catalog shall be flagged as unmanaged/unrecognized rather than accepted as valid |
| FW-3.1 | The Internal Administration Console (§3.13) shall provide a fleet-wide query/view of firmware drift: devices on an unmanaged version, devices on a supported-but-outdated version, and devices already on the latest version for their channel |
| FW-4.1 | The device-twin desired property "Firmware channel" shall be set from FW-1.1's catalog of channels defined for that device's product type — not accepted as an arbitrary string from the caller |

**Error/edge conditions:** a product/sensor type with zero catalog entries (FW-2.1 shall flag every reported version for that type as unmanaged, not silently pass); a device whose product type is itself unknown/unset (same treatment — unmanaged, not an error state that blocks rendering).

**Deliberately undecided at this level, consistent with PRD §5.16**: whether this catalog also drives actual firmware image distribution (an OTA delivery pipeline) or is version/compatibility metadata only, feeding a separately-designed distribution mechanism, is left to Domain Model, Database Schema, and Device & Command Security Architecture.

### 3.19 Automated Pool Water-Quality Reporting (→ PRD §5.17 PW-1–PW-14) *(added v1.9 — see Revision History)*

**Description:** A recurring, consumer-legible water-quality report per pool site, delivered to the property owner under the channel partner's branding. Reports combine **continuously sensed** chemistry with a **technician-entered** reagent panel, because the two sets are not both automatable — see the sensing limit below. Elaborates the pool-servicing vertical already established by §3.12 (partner territory/dispatch) and §3.11 (RP-2.1's per-site readings).

| ID | Requirement |
|---|---|
| PW-1.1 | The system shall generate a water-quality report per pool site on a configurable recurrence, defaulting to weekly, rendered for a non-technical reader |
| PW-2.1 | A `channel_partner_users` session with an administrative role shall be able to enable, schedule, and disable the report for any site attributed to that partner, without a PeakLogic staff action |
| PW-3.1 | Each parameter in the report shall carry its measured value, its target range, an in/out-of-range determination, and its trend across the reporting period — not a single point reading |
| PW-4.1 | The report shall mark each parameter as continuously sensed or technician-entered. A parameter with no sensed source shall never be rendered as sensed |
| PW-5.1 | The system shall accept a technician-recorded reagent panel (total alkalinity, calcium hardness, cyanuric acid) against a site, persisting the test date and the attributed `channel_partner_users` identity with each entry |
| PW-6.1 | Services performed at the site during the reporting period shall be included in the report. The report shall carry **no** chemical, material, or labour pricing field |
| PW-7.1 | The system shall deliver the report by email to per-site designated recipients — **conditional, see the blocking note below** |
| PW-8.1 | Report email shall be sent under the channel partner's own sending domain and branding, consistent with §3.12's branded-portal model — **conditional, see the blocking note below** |
| PW-9.1 | Report generation and each delivery attempt shall be written to `audit_log_entries` (AUD-1/AUD-2), and an issued report shall be reproducible byte-for-byte as sent for the retention period |
| PW-10.1 | Technician capture (PW-5.1) shall authenticate as the existing `channel_partner_users` `technician` role (§2.4/§3.12) — no new identity surface, no new pool |
| PW-11.1 | Capture shall complete without network connectivity and reconcile on reconnect, extending the offline queue already specified for PeakLogic Mobile — loss of signal shall not block completion of a stop |
| PW-12.1 | A reagent-panel entry shall reference the technician's `route_stops` row for that site and period; an entry with no corresponding checked-in stop shall be rejected |
| PW-13.1 | Each entry field shall be validated against a per-parameter plausible range; an out-of-range value shall require explicit confirmation rather than being silently persisted |
| PW-14.1 | The system should allow an image of the physical test result to be attached to a reagent-panel entry |

**🔴 Blocking dependency for PW-7.1 / PW-8.1 — verified, not assumed:** there is **no outbound email mechanism in the codebase** (`backend/`, `infra/`) — no SES, SendGrid, nodemailer, Postmark, Mailgun, or SMTP integration exists. The only outbound notification path implemented is the fire-and-forget webhook on critical alerts (`backend/ingest/handler.ts`). PW-7.1 requires scheduled recurring per-recipient delivery; PW-8.1 additionally requires per-partner sender authentication (SPF/DKIM/DMARC per custom domain), bounce and complaint handling, and suppression lists. Both are **deferred, not dropped** — the same treatment SET-8.1 received for the same missing dependency — and neither may be scheduled until outbound email infrastructure is itself specified and built.

**Sensing limit, verified against `backend/ingest/rules.ts`:** the `pool_chemistry` adapter implements `ph`, `free_chlorine_ppm`, and `tds_ppm`; `pool_system` implements `flow_lpm` and `temp_c`. Total alkalinity, calcium hardness, and cyanuric acid have **no implemented metric and no practical residential inline sensor** — hence PW-4.1/PW-5.1's hybrid model. `salt_ppm` is obtainable from existing salt-chlorine-generator integration and is the one gap closeable without new sensing research.

**Provenance limit, stated rather than engineered around:** a technician-entered value is **attested, not measured**. PW-12.1 constrains it to a real visit and PW-13.1 challenges implausible values, but neither makes it a measurement. Direct instrument integration (a digital photometer transmitting its own reading) is the only mechanism that would, and is explicitly **not** required at this revision.

**Error/edge conditions:** a pool site with no chemistry device (PW-1.1 shall produce no report — a valid empty state, not an error); a period with no technician visit (the report shall state the reagent panel was not tested, never repeat a prior period's values); a sensor offline for part of the period (the report shall represent the gap, not interpolate across it); an entry captured offline and synced after its report was generated (the entry shall bind to the period of its recorded test date, not its sync time).

---

### 3.20 PeakView360 — HMI/SCADA Operator Layer (→ PRD §5.18 PV-1–PV-8) *(added v2.0 — see Revision History)*

**Description:** The modernized HMI/SCADA operator experience absorbing MooreView's proven surface. Sources live data locally from a PeakLogic Hub (§3.21) and historical/cross-site data from the cloud. A supervisory/visualization layer only — never a control system.

| ID | Requirement |
|---|---|
| PV-1.1 | The system shall render a real-time operator screen showing live process values and equipment state (running / fault / offline) for a site, refreshed on a live cadence |
| PV-2.1 | The system shall present active alarms with acknowledgement and alarm history, built on the **existing** `alerts` model and alert pipeline (§3.3), not a parallel alarm store; the alarm UI shall be a docked, responsive panel (MooreView's floating-window pattern is redesigned) |
| PV-3.1 | The system shall provide a multi-pen historian trend allowing overlay of multiple metrics over a selectable range (24h / 7d / 30d / custom) with CSV export — superseding the current single-fixed-window per-metric chart |
| PV-4.1 | The system shall provide a per-asset equipment dashboard combining live telemetry, trend, and (Intelligence tier) an AI/PdM health score with a recommended action that can create a work order (§3.22) |
| PV-5.1 | The system shall render facility visualization as a 2D process schematic by default; 3D rendering (§3.17) is an opt-in mode, not the default |
| PV-6.1 | The system shall render live data sourced from the local Hub over the LAN (offline-capable) and historical/cross-site data sourced from the cloud, transparently to the operator (dual-source; see HUB-4.1) |
| PV-7.1 | The system shall not implement, assume, or depend on safety-rated control logic, hardware interlocks, or emergency-shutdown functions — PeakView360 is HMI/visualization/supervisory only |
| PV-8.1 | The system shall support deployment as either the primary HMI (greenfield/small sites) or a supervisory layer alongside an existing control system (brownfield) without change to its data model |

**Error/edge conditions:** loss of cloud connectivity shall degrade PeakView360 to Hub-local live data + locally-cached history, not a blank screen (see HUB-4.1); a site with no Hub yet configured shall present a clear empty/setup state, not an error.

### 3.21 PeakLogic Hubs — On-Prem Edge Units (→ PRD §5.19 HUB-1–HUB-7) *(added v2.0 — see Revision History)*

**Description:** The on-prem edge pillar — a productization of the existing PeakLogic Edge (`windows-hub/`). Acquires from field equipment, evaluates alarms locally, serves PeakView360 and PeakAssist on the LAN, and store-and-forwards to the cloud over an outbound-only channel.

| ID | Requirement |
|---|---|
| HUB-1.1 | The Hub shall acquire telemetry from PLCs/RTUs via at least one industrial protocol (Modbus TCP or OPC-UA) at MVP; additional protocols are Phase 2 |
| HUB-2.1 | The Hub shall buffer telemetry locally and store-and-forward it to PeakLogicSystems over outbound-only MQTT/TLS — reconciling the existing PeakLogic Edge store-and-forward, not replacing it; no inbound port/VLAN/firewall exception shall ever be required (CC-1/CC-2 parity) |
| HUB-3.1 | The Hub shall evaluate safety-relevant alarm conditions locally, without dependence on a cloud round-trip |
| HUB-4.1 | The Hub shall serve PeakView360's live data on the LAN so the site continues operating during a loss of internet connectivity |
| HUB-5.1 | The Hub shall carry a complete offline copy of PeakAssist content (PA-4.1) and serve it to PeakView360 on the LAN |
| HUB-6.1 | The Hub estate shall be centrally manageable (fleet inventory, patch/version governance, secure remote administration) — reconciling the Windows Endpoint Application spec (#25), re-scoped as this pillar |
| HUB-7.1 | The Hub shall read and supervise only; it shall not replace PLC safety interlocks, and any future actuation it relays shall fail safe locally (CC-4 parity) |

**Error/edge conditions:** a protocol read failure on one device shall not stop acquisition from the others; a prolonged cloud outage shall accumulate buffered telemetry up to a bounded local-retention limit and forward on reconnection without data reordering that would corrupt the historian.

### 3.22 Built-in CMMS — Work Orders & PM Schedules (→ PRD §5.20 CM-1–CM-4) *(added v2.0 — see Revision History)*

**Description:** Native work-order and preventive-maintenance workflow, reconciling the existing `service_tickets`/`service_visits` tables and the CMMS-connector design (#32).

| ID | Requirement |
|---|---|
| CM-1.1 | The system shall support work orders created manually or automatically (alarm-driven), assignable to a technician, with a status lifecycle (dispatched → accepted → on-site → completed) and a recorded outcome — reconciling `service_tickets`/`service_visits` |
| CM-2.1 | An acknowledged or critical alarm shall be able to auto-create a work order — reconciling the existing critical-alert → service-ticket + webhook path |
| CM-3.1 | The system shall support recurring preventive-maintenance schedules per asset/category, with a "generate due work orders" action |
| CM-4.1 | The system shall support a bi-directional CMMS connector — durable/idempotent outbound work-order push to an external CMMS plus inbound status sync — reconciling the #32 connector framework (`generic_webhook` adapter) |

**Error/edge conditions:** a failed outbound push to an external CMMS shall be retried durably and never silently dropped; a PM schedule generating a work order for an asset with no assigned technician shall produce an unassigned work order in a valid queued state, not an error.

### 3.23 Compliance Automation (→ PRD §5.21 CP-1–CP-5) *(added v2.0 — see Revision History)*

**Description:** Automated compilation of regulator-relevant reports from monitored data, with the operator as filer of record. The market wedge (wastewater NPDES/DMR first).

| ID | Requirement |
|---|---|
| CP-1.1 | The system shall compile a reporting period's monitored values, exceedances, and recorded corrective actions into a regulator-relevant report (wastewater DMR as the first template) |
| CP-2.1 | The system shall present compliance reports as operator-assist artifacts: the operator remains the filer of record; the system shall not transmit filings to a regulator or represent itself as assuming regulatory responsibility |
| CP-3.1 | Every issued compliance report shall be backed by the immutable audit trail (§3.10) and be reproducible from the retained underlying data |
| CP-4.1 | The system shall maintain an exceedance log and honor the Compliance-tier retention SLAs |
| CP-5.1 | *(Blocked — see PRD CP-5)* Automated recurring delivery of compliance reports depends on outbound-delivery infrastructure that does not yet exist (shared with PW-7/PW-8, SET-8); report **generation** shall be independent of and not blocked by **delivery** |

**Error/edge conditions:** a period with sensor coverage gaps shall show the gap rather than interpolate across it (consistent with PW-3.x provenance rules); a report requested for a period with no monitored data shall produce a valid "no data for period" report, not a fabricated one.

### 3.24 PeakAssist — Help / Support System (→ PRD §5.22 PA-1–PA-7) *(added v2.0 — see Revision History)*

**Description:** The mandatory first-class help system — contextual, one-click, offline-via-Hub, cloud-synced — serving both HMI and cloud users. Seeded from the existing `sysadmin-guides/` and `user-guides/` corpus.

| ID | Requirement |
|---|---|
| PA-1.1 | The system shall present a Help affordance reachable in one click from every PeakView360 screen and every cloud page |
| PA-2.1 | Opening Help shall scope content to the current screen's declared help-context key, leading with that screen's guidance; global search and a full browsable index shall be at most one further click away |
| PA-3.1 | PeakAssist shall provide screen guides, step-by-step procedures, alarm explanations (deep-linked from an active alarm), troubleshooting guides, workflow playbooks, and a glossary |
| PA-4.1 | Every PeakLogic Hub shall carry a complete copy of PeakAssist; the full help system shall function on PeakView360 with the internet unavailable |
| PA-5.1 | The cloud PeakAssist CMS shall be the source of truth; each Hub shall pull content deltas in the background when connectivity exists and shall display the current content version to the user |
| PA-6.1 | The same PeakAssist content model shall serve HMI users (in PeakView360, offline via the Hub) and cloud users (browser, latest) |
| PA-7.1 | No screen shall ship without a declared PeakAssist help-context entry — enforced as a release gate, not left optional |

**Error/edge conditions:** a screen missing a help-context key shall fall back to the top-level index (never a dead Help button); a Hub that has never synced shall still serve the content bundled at install time, labeled with that version.

### 3.25 MooreView Feature Absorption (→ PRD §5.23 MV-1–MV-3) *(added v2.0 — see Revision History)*

**Description:** Governs how MooreView's capabilities are harvested into the sections above, per the disposition table in [`../business/unified-product-vision.md`](../business/unified-product-vision.md) §4.1.

| ID | Requirement |
|---|---|
| MV-1.1 | Preserved capabilities (operator screens, alarm model, historian, CMMS workflow, contextual help, reporting/ROI) shall be realized through §3.20–§3.24, not re-invented |
| MV-2.1 | Modernized capabilities shall follow the disposition: alarm UI floating→docked (PV-2.1), facility view 3D-default→2D-default (PV-5.1), PdM per-plant→fleet-central (§3.7/#34), historian store per-plant-Mongo→cloud-time-series (PV-3.1) |
| MV-3.1 | Retired/deferred capabilities: the single-tenant per-project file lifecycle is not reproduced; MV Draw (CAD) and raw PLC-tag programming are out of MVP scope |

---

## 4. External Interface Requirements

### 4.1 User Interfaces

- Web dashboard (React SPA): device add/view/manage, alerts, tickets, sites/assets — the only human-facing client at MVP (PRD §7). Detailed screen specs deferred to UX Wireframes (#8).

### 4.2 Hardware Interfaces

- Sensor hardware (temperature probe, pH/chlorine/TDS probe, gas sensor, flow meter, current/power meter) — read-only telemetry sources; no end-user-facing hardware interface beyond the browser.

### 4.3 Software Interfaces

| Component | Role | Notes |
|---|---|---|
| Azure IoT device connectivity (mechanism TBD) | Device connectivity | Outbound-only MQTT/TLS (CC-1.1); logic reconciled, Azure service selection is Device & Command Security Architecture's (#12) job *(corrected v1.7 — previously named AWS IoT Core)* |
| Serverless compute (mechanism TBD) | Compute | `peaklogic-ingest`, `peaklogic-api` logic; extended per §3.1–§3.3, host TBD per Infrastructure as Code (#16) *(corrected v1.7 — previously named AWS Lambda)* |
| Azure Database for PostgreSQL | Primary relational store | RLS-enforced (MT-1.1); RLS pattern itself is portable as-is *(corrected v1.7 — previously named AWS RDS)* |
| Identity provider (mechanism TBD) | Identity/auth | Reused by MCP server (MCP-2.1); concrete choice is Security Architecture's (#13) job *(corrected v1.7 — previously named AWS Cognito)* |
| API layer (mechanism TBD) | REST API surface | Azure service selection is Infrastructure as Code's (#16) job *(corrected v1.7 — previously named AWS API Gateway)* |
| CDN/static hosting (mechanism TBD) | Frontend hosting | Azure service selection is Infrastructure as Code's (#16) job *(corrected v1.7 — previously named AWS CloudFront/S3)* |
| MCP Server | AI/agent tool surface | **New** (§3.7); co-located with or adjacent to `peaklogic-api` |

### 4.4 Communication Interfaces

- Device-to-cloud: MQTT over TLS, outbound-initiated, port 443 preferred (CC-2.1).
- Client-server: HTTPS/TLS.
- MCP: transport and exact tool schema are subject to the API Specification (#11); this SRS constrains only observable behavior (MCP-1.1, MCP-2.1).

---

## 5. Non-Functional Requirements (elaborating PRD §6)

### 5.1 Performance

- A threshold-triggered alert shall be created within 30 seconds of the underlying telemetry ingest (PRD §6).

### 5.2 Security

- TLS in transit; encryption at rest (RDS, S3) — existing, reconciled.
- RBAC enforced server-side on every API and MCP call (AUTH-3).
- Detailed threat modeling and control selection belong to Security Architecture (#13) and Threat Model (#17); this SRS states the baseline those artifacts must at minimum satisfy.

### 5.3 Reliability / Availability

- 99.9% platform uptime as the v1 internal engineering target (PRD §6) — not yet a contractual SLA.

### 5.4 Data Integrity

- Alerts are never hard-deleted (status transitions only) — existing schema behavior, reconciled.
- Raw telemetry retained at full resolution for 90 days, then downsampled to hourly rollups retained 2 years; alerts/service tickets retained indefinitely (minimum 7 years) — per PRD §6, feeds the Database Schema artifact (#10) for implementation.

### 5.5 Portability

- Not a primary concern at MVP for this track — this fork commits to Azure *(corrected v1.7 — previously stated the implementation was AWS-committed)*. The portability principle that does apply: infrastructure must be defined via a real IaC tool (Bicep vs. Terraform — not yet chosen, Infrastructure as Code #16), so environment reproducibility doesn't depend on manual Azure Portal configuration, the same principle the AWS-native repo already applied via CDK.

### 5.6 Usability

- Device add/view/manage usable by a non-technical operator with no manual required — restates UX-1.1.

### 5.7 Extensibility

- New sensing modality addable via the device adapter contract without redeploying/forking core ingest — restates DA-1.1.

### 5.8 Data Retention

- See §5.4 — restated here per the PRD's NFR table structure for consistency with IronQuill's SRS format.

---

## 6. System Data Requirements (bounding note)

This SRS intentionally does not define entities, fields, or relationships beyond what's needed to specify behavior above (e.g., "an adapter declares required/optional metrics"). The authoritative entity/relationship model — including how Tenant, Site, Asset, Device, Adapter, Telemetry, Alert, ServiceTicket, and ChannelPartner relate — is the Domain Model's job (#4), which should be produced immediately following this SRS. The existing `docs/data-model.sql` is this artifact's starting input, not a competing source of truth once the Domain Model exists.

---

## 7. Verification Approach (principle, not procedure)

Every **shall** requirement in §3–§5 must be verifiable by an automated test, a manual test procedure, or (for a small number of structural/architectural requirements, e.g. DA-1.1) an architecture review checkpoint — decided per-requirement, not assumed. This SRS does not assign verification methods (that's Test Strategy, #18); it requires that every `shall` be phrased so a verification method *can* be assigned.

---

## 8. Traceability Matrix

| SRS section | PRD source | Notes |
|---|---|---|
| §3.1 Device Adapter Framework | PRD §5.1 (DA-1–DA-5) | 1:1 elaboration |
| §3.2 Sensing Modalities | PRD §5.2 (SN-1–SN-7) | 1:1 elaboration |
| §3.3 Alerting & Service Tickets | PRD §5.3 (AL-1–AL-3) | 1:1 elaboration |
| §3.4 Device Management UX | PRD §5.4 (UX-1–UX-3) | 1:1 elaboration |
| §3.5 Multi-Tenancy | PRD §5.5 (MT-1–MT-3) | 1:1 elaboration |
| §3.6 Device & Command Networking | PRD §5.6 (CC-1–CC-4) | 1:1 elaboration |
| §3.7 AI & MCP Orchestration | PRD §5.7 (MCP-1, MCP-2, AI-3, AI-4) | 1:1 elaboration |
| §3.8 Channel & Partner Support | PRD §5.8 (CH-1–CH-3, CH-3a) | 1:1 elaboration — extended v1.4, v1.5 |
| §3.9 Auth & Access Control | PRD §6 (Security baseline) | **SRS-new** — synthesized from cross-cutting PRD references |
| §3.10 Audit Logging | PRD §6 (Security baseline), CH-2.1 | **SRS-new** |
| §3.11 Portfolio & Route Reporting | PRD §5.9 (RP-1–RP-4) | 1:1 elaboration — added v1.1, extended v1.3 |
| §3.12 Partner Territory & Dispatch | PRD §5.10 (TR-1–TR-3) | 1:1 elaboration — added v1.5 |
| §3.16 Geospatial Site Portfolio Visualization | PRD §5.14 (GEO-1–GEO-6) | 1:1 elaboration — added v1.7 |
| §3.17 3D Facility Rendering | PRD §5.15 (3DR-1–3DR-3) | 1:1 elaboration — added v1.7, first-pass |
| §3.20 PeakView360 HMI/SCADA | PRD §5.18 (PV-1–PV-8) | 1:1 elaboration — added v2.0 |
| §3.21 PeakLogic Hubs | PRD §5.19 (HUB-1–HUB-7) | 1:1 elaboration — added v2.0 |
| §3.22 Built-in CMMS | PRD §5.20 (CM-1–CM-4) | 1:1 elaboration — added v2.0 |
| §3.23 Compliance Automation | PRD §5.21 (CP-1–CP-5) | 1:1 elaboration — added v2.0; CP-5.1 blocked |
| §3.24 PeakAssist Help System | PRD §5.22 (PA-1–PA-7) | 1:1 elaboration — added v2.0 |
| §3.25 MooreView Feature Absorption | PRD §5.23 (MV-1–MV-3) | 1:1 elaboration — added v2.0 |
| §5 Non-Functional Requirements | PRD §6 | 1:1 elaboration per category |

Where a future artifact (Domain Model, Database Schema, Security Architecture, etc.) forces a change to a requirement above, that change should be made explicitly in a revision to this document, per the governance rule carried from the Vision Document and PRD.

---

## 9. Open Issues Deferred to Later Artifacts

1. ~~**Threshold/reference values for new modalities** (SN-4.1 pool chemistry, SN-5.1 gas)~~ **Resolved 2026-07-11** — see SN-4.1/SN-5.1. Total chlorine (part of SN-4's original PRD wording) remains unimplemented, a disclosed gap, not a new open issue.
2. **Actuation/command security model** — CC-3/CC-4 establish that nothing ships at MVP; the full design (authorization, audit trail, fail-safe-locally behavior) is Device & Command Security Architecture's (#12) job.
3. **Entity/relationship formalization** — flagged throughout as the Domain Model's (#4) job. **Now includes, added v1.5:** Territory, technician, and route-assignment entities backing §3.12 — none exist yet in the Domain Model or `docs/data-model.sql`.
4. **SOC 2 control-level detail** — this SRS's Security baseline (§5.2) is a floor, not a control mapping; that's the Compliance & Certification Roadmap and SOC 2 Control Mapping & Evidence Plan's (#5/#20) job.
5. **Exact MCP tool schema and transport** — MCP-1.1/MCP-2.1 specify observable behavior only; the API Specification (#11) owns the exact contract.
6. **Channel-partner portal auth mechanism** (§2.5, added v1.5) — a new Cognito group vs. a new user pool, partner-scoped JWT claims, and how a partner-scoped cross-tenant read differs from today's single-tenant RLS model are all open, deferred to Security Architecture (#13) and Multi-Tenant Architecture (#14) amendments.
7. **Every Azure service selection this v1.7 amendment left as "mechanism TBD"** (§2.1, §2.4, §4.3) — IoT device connectivity, serverless compute host, identity provider, API layer, CDN/static hosting — deferred to Device & Command Security Architecture (#12), Security Architecture (#13), and Infrastructure as Code (#16) *(added v1.7)*.
8. **Mapping technology for §3.16** (Azure Maps vs. a third-party option) — deferred to UX Wireframes (#8)/API Specification (#11), per `azure-restructuring-plan.md` §4 *(added v1.7)*.
9. **3D rendering scope for §3.17** (file format, rendering approach, storage) — deliberately unresolved pending a dedicated scoping pass; not assumed by this SRS or any document downstream of it until that pass happens *(added v1.7)*.
10. **Unified-platform entities (§3.20–§3.24) do not yet exist in the Domain Model or `docs/data-model.sql`** *(added v2.0)* — PeakView360 screen/tag/alarm-view entities, the Hub-fleet entity, CMMS work-order/PM-schedule entities, compliance-report entities, and PeakAssist content/version entities are all deferred to the Domain Model (#4) and Database Schema (#10) amendments sequenced next in `unified-platform-integration-plan.md`. The PLC-driver, PeakView360-app, and PeakAssist-delivery subsystems are design-stage, not built.
11. **Outbound-delivery infrastructure (CP-5.1, and the shared PW-7/PW-8, SET-8 dependency)** *(added v2.0)* — compliance-report and other recurring delivery is blocked on an outbound email/hosted-report capability that does not exist anywhere in the codebase; it must be scoped as a prerequisite project before CP-5.1 can be met.

---

## 10. Review Log

Approved as-is at v1; no changes requested during that review. See Revision History below for the subsequent v1.1 amendment.

---

## Revision History

**v1.1 (2026-07-04)** — forced by the User Personas artifact (#6) and the PRD's own v1.1 amendment, per this document's rule (§8) that a downstream artifact surfacing a needed change must amend this document explicitly rather than silently diverging from it.

- **§3.11 added (RP-1.1, RP-2.1)**: elaborates the PRD's new §5.9 (Portfolio & Route Reporting), itself added because the User Personas artifact surfaced two persona needs (multi-site roll-up, route-prioritized view) that had no home in the original single-device-level UX-2.
- **AI-3.3 added**: baseline-analytics sensitivity must be configurable per adapter/category, elaborating the PRD's reworded AI-3 — the User Personas artifact made explicit that alert-fatigue tolerance drives product trust more than any single feature.

**v1.2 (2026-07-04)** — forced by the User Stories artifact (#7) confirming two open items rather than leaving them ambiguous, and the PRD's own v1.2 amendment.

- **RP-1.1 reworded**: the multi-site roll-up response must separately report `trend`/`anomaly`-type alerts from `threshold`-type alerts, not a single undifferentiated count.
- **RP-2.1 reworded**: each site's route-view entry must include its devices' actual adapter-specific readings, not just a health/alert summary.

**v1.3 (2026-07-04)** — forced by the Information Architecture artifact (#9) and the PRD's own v1.3 amendment, per this document's rule (§8) that a downstream artifact surfacing a needed change must amend this document explicitly rather than silently diverging from it.

- **RP-4.1 added**: elaborates the PRD's new RP-4 — a plain, address-sortable site directory, independent of RP-1.1's risk/health grouping — needed once Information Architecture found no requirement backing its "Sites" navigation item.

**v1.4 (2026-07-04)** — forced by the Information Architecture artifact (#9) and the PRD's own v1.4 amendment.

- **CH-1.2 added**: no tenant-facing path may set/change channel-partner attribution — internal-assignment only, tenant-facing read displays the supplier's actual name and never the generic term "channel partner." Corrects the approved UX Wireframes' §2.8, which showed a tenant-editable dropdown.

**v1.5 (2026-07-11)** — forced by a real business conversation about the pool-servicing channel-partner sales motion, and the PRD's own v1.5 amendment, per this document's rule (§8) that a downstream (here: business-context) finding forcing a change must amend this document explicitly rather than silently diverging from it.

- **SN-4.1/SN-5.1 resolved**: real, cited thresholds (CDC Model Aquatic Health Code for pH/free chlorine, industry-standard guidance for TDS) implemented in `backend/ingest/rules.ts`'s new `pool_chemistry` adapter; `gas_sensor` adapter implemented as a binary signal, structurally identical to `leak_sensor`. Closes Open Issue #1. Total chlorine remains unimplemented — a disclosed gap.
- **CH-3.1 revised, CH-3a.1 added**: elaborates the PRD's CH-3/CH-3a split — a scoped, operational-only partner portal for the pool-servicing vertical is now required at MVP; full tenant-management access, billing automation, and an in-house AI-routing engine remain explicitly out of scope.
- **§3.12 added (TR-1.1, TR-2.1, TR-3.1, TR-3.2)**: elaborates the PRD's new §5.10 — territory definition, technician assignment (reusing RP-2.1's urgency ranking), and an advisory AI-generated daily route suggestion via an external agent consuming the MCP server. TR-3.2 makes explicit that no in-house routing algorithm is built.
- **MCP-1.1 extended**: added territory/technician/site-status read tools needed for TR-3.1's external agent to have anything to consume.
- **§2.5 (Design/Implementation Constraints) amended**: flagged the channel-partner portal login as a genuinely new identity surface (deferred to Security Architecture), and clarified TR-3's external-agent-calls-in direction does not conflict with AI-4.1's external-call-out prohibition.
- **Explicitly not resolved in this pass** (§9 item 6, tracked in `mvp-roadmap.md` and project memory): the concrete partner-auth mechanism, the new cross-tenant read pattern a partner's portal requires, and the Territory/Technician/RouteAssignment entities' formal data model — all deferred to their respective downstream artifacts' own amendments.

**v1.6 (2026-07-12)** — forced by direct, hands-on product use surfacing three real gaps in the same sitting, and the PRD's own v1.6 amendment, per this document's rule (§8).

- **§2.3 (User Classes) extended**: two new internal-only roles, PeakLogic Superadmin and PeakLogic Account Manager.
- **§2.5 (Design/Implementation Constraints) amended again**: the Administration Console (§3.13) is flagged as a *third* new identity surface, materially harder than the channel-partner portal's — it needs cross-tenant **write**, not just read, across an explicitly assigned subset of accounts, and directly intersects the already-known gap that no non-owning application database role exists yet (Technical Debt Register TD-7).
- **§2.6 (Assumptions and Dependencies) extended**: PeakLogic staff users and account-manager-to-account assignments have no formal data model yet — Domain Model (#4) needs its own amendment, same pattern as every other entity this SRS has named loosely pending that artifact.
- **§3.13 added (IA-1.1–IA-8.1)**: a PeakLogic-staff-only identity surface — Superadmin-only tenant/channel-partner creation; Account Manager access structurally scoped (RLS or equivalent, not application-filtering alone) to an explicitly assigned subset of accounts; Superadmin as a strict superset, not a parallel role; every write audit-logged via a third actor type extending the existing dual-scope (AUD-1/AUD-2) model.
- **§3.14 added (SET-1.1–SET-8.1)**: a standard Settings page for the tenant-side app — password change, 12/24-hour clock format, a display-timezone preference kept explicitly distinct from `sites.timezone`, light/dark theme, MFA re-enrollment, and a Tenant-Admin Team/Users panel. SET-8.1 (notification preferences) explicitly conditioned on verifying real email-notification infrastructure exists, not assumed.
- **§3.15 added (NAV-1.1–NAV-5.1)**: Site → Asset → Device drill-down navigation and per-device telemetry detail. Confirms directly against `docs/data-model.sql` that `devices.asset_id` already permits multiple devices per asset (no schema change needed) and applies the same drill-down to the channel-partner portal. **NAV-5.1 documents a verified live defect**: `GET /v1/devices` reads its `_event` parameter as unused and returns every device unfiltered — real code, checked directly, not inferred.
- **Downstream artifacts requiring their own amendments as a result** (not done in this pass, same sequenced pattern as v1.5): Domain Model, Database Schema (the new cross-tenant-write RLS pattern for §3.13, and the `assetId`/`siteId` filter for §3.15), Security Architecture, Multi-Tenant Architecture, API Specification, User Personas, UX Wireframes.

**v1.7 (2026-07-17)** — the first amendment specific to the `PeakLogic-Azure` fork, mirroring the PRD's own v1.7 amendment, per this document's rule (§8) that a downstream (here: sibling) artifact change must be mirrored explicitly, not left to silently diverge.

- **§3.16 added (GEO-1.1–GEO-6.1)**: elaborates PRD §5.14 — a geospatial map view over existing `sites.lat`/`sites.lng`. **A real, pre-existing defect verified directly against `docs/data-model.sql`, not hypothesized**: those columns are nullable with no constraint, and were already silently load-bearing for the existing Territory-containment `ST_Contains` query (§2.7 in the Domain Model) — a site missing coordinates already failed territory assignment invisibly before this amendment; GEO-6.1 is the first requirement anywhere in this document to surface that condition to a user.
- **§3.17 added (3DR-1.1–3DR-3.1)**: elaborates PRD §5.15, deliberately kept at placeholder/first-pass specificity — no file format, rendering approach, or storage mechanism specified, per `azure-restructuring-plan.md`'s explicit instruction not to assume scope for this higher-uncertainty feature.
- **§2.1 system-context diagram, §2.4 Operating Environment, and §4.3 Software Interfaces corrected, not just extended**: all three previously named AWS services (IoT Core, Lambda, RDS, Cognito, API Gateway, CloudFront/S3) verbatim, accurate for the repo this was forked from but stale for this fork's own Azure track. Corrected to name the equivalent Azure-track role at each node while leaving the concrete Azure service "mechanism TBD," explicitly deferred to Device & Command Security Architecture (#12), Security Architecture (#13), and Infrastructure as Code (#16) — this SRS specifies behavior, not cloud-service selection, the same boundary it already held for AWS.
- **§5.5 Portability corrected**: no longer states the implementation is AWS-committed; states the Azure commitment and the still-open Bicep-vs-Terraform choice instead.
- **§2.5/§2.6 extended**: flagged the mapping-technology choice (§3.16) and the full 3D-rendering shape (§3.17) as open, undecided at this level — consistent with how this document has always flagged genuinely open items (e.g. v1.5's partner-auth-mechanism flag) rather than silently assuming an answer.
- **Downstream artifacts requiring their own amendments as a result** (tracked in `azure-restructuring-plan.md` §2): Domain Model (site-coordinate portability confirmation, new 3D-model-asset-reference entity once scoped), User Stories, UX Wireframes (new map/3D views, the mapping-technology evaluation), Information Architecture (new nav items), Database Schema, API Specification (map data + 3D asset delivery endpoints).

**v1.8 (2026-07-19)** — forced by direct, hands-on use of the Internal Administration Console prototype, mirroring the PRD's own v1.8 amendment, per this document's rule (§8).

- **§3.13 amended (IA-9.1 added)**: staff-performed device/site provisioning and threshold configuration (IA-5.1/IA-6.1) shall reuse the tenant's/partner's own provisioning and threshold screens and API contract via the existing act-as session, not a parallel staff-only form. **Explicitly flagged as only behaviorally resolved, not architecturally**: whether act-as embeds the tenant/partner frontend directly or the console calls the same tenant-facing API endpoints under its own UI is left open for a UX Wireframes/API Specification amendment.
- **§3.18 added (FW-1.1–FW-4.1)**: a Device & Firmware Version Catalog — elaborates PRD §5.16. Validates each device's reported firmware version against a per-product-type catalog of supported versions/channels, flags unmanaged versions, and specifies a fleet-wide drift view for §3.13's console. Whether the catalog also drives actual OTA image distribution, or is compatibility metadata only, is explicitly left to Domain Model/Database Schema/Device & Command Security Architecture.
- **Downstream artifacts requiring their own amendments as a result** (not done in this pass): Domain Model (a Firmware/Product Catalog entity and its relationship to `devices`), Database Schema, API Specification (catalog CRUD + drift-query endpoints; the act-as provisioning/threshold API shape per IA-9.1), UX Wireframes (fleet firmware-drift view; the act-as provisioning/threshold screens).

**v1.9 (2026-07-19)** — mirrors the PRD's own v1.9 amendment (a weekly, partner-branded pool water-quality report for the pool-servicing vertical), per this document's rule (§8).

- **§3.19 added (PW-1.1–PW-14.1)**: recurring per-site water-quality reporting, partner-managed scheduling, explicit sensed-vs-attested provenance, technician reagent-panel capture bound to a real route stop, services-performed listing without pricing, and audited reproducible reports.
- **Two dependencies verified against real code rather than assumed.** (1) `backend/ingest/rules.ts` implements only `ph`, `free_chlorine_ppm`, `tds_ppm` for `pool_chemistry` — total alkalinity, calcium hardness and cyanuric acid have no metric and no practical residential inline sensor, which is *why* PW-4.1/PW-5.1 specify a hybrid panel instead of claiming a fully automated water test. (2) No outbound email mechanism exists anywhere in `backend/` or `infra/`; the sole outbound path is the critical-alert webhook. PW-7.1/PW-8.1 are therefore written as **conditional and deferred**, the same treatment SET-8.1 already carries for the same missing dependency.
- **A limit recorded instead of designed around**: for the three reagent parameters the report carries an *attested* value, not a measured one. PW-12.1 (must bind to a checked-in `route_stops` row) and PW-13.1 (plausible-range challenge) raise the cost of a bad entry without changing that fact; only direct instrument integration would, and it is explicitly out of scope at this revision.
- **§2.4's technician gains a write responsibility** for the first time — previously read-only apart from ack/ticket/route-confirm. The water-test write path has no endpoint, entity, or schema today; flagged for Domain Model, Database Schema and API Specification rather than assumed to exist.
- **Downstream artifacts requiring their own amendments as a result** (not done in this pass): User Personas (§2.4), Domain Model + Database Schema + API Specification (the water-test entity, its `route_stops` binding, the technician write endpoint), iOS Application (#26 — capture screen and offline-queue extension), UX Wireframes (report layout and capture form), plus a new owner for outbound email infrastructure.

**Draft v2.0 (2026-07-25)** — mirrors the PRD's v2.0 **unified-platform reframe** (`../business/unified-product-vision.md`; `unified-platform-integration-plan.md`). First SRS amendment in the `PeakLogic-Azure-V2` merger repo; follows Vision Draft v2 and PRD Draft v2.0. Non-silent per §8.

- **Header/naming corrected** to canonical, retiring "PeakView Hub / PeakView 360."
- **§3.20 added (PV-1.1–PV-8.1)**: PeakView360 HMI/SCADA — real-time screens, alarm mgmt on the existing `alerts` pipeline, multi-pen historian, equipment dashboards, 2D-default facility viz, dual-source (Hub-local/cloud) rendering, supervisory-not-control boundary.
- **§3.21 added (HUB-1.1–HUB-7.1)**: PeakLogic Hubs — PLC/RTU acquisition, edge alarm eval, offline PeakView360 + PeakAssist serving, store-and-forward (reconciles PeakLogic Edge, re-scopes #25).
- **§3.22 added (CM-1.1–CM-4.1)**: built-in CMMS (reconciles `service_tickets`/`service_visits` + #32).
- **§3.23 added (CP-1.1–CP-5.1)**: compliance automation — DMR-first, operator-as-filer-of-record, audit-backed; **CP-5.1 blocked** on unbuilt outbound delivery.
- **§3.24 added (PA-1.1–PA-7.1)**: PeakAssist — one-click contextual help, offline-via-Hub, cloud-synced, no-screen-without-help gate.
- **§3.25 added (MV-1.1–MV-3.1)**: MooreView absorption disposition.
- **Traceability matrix + §9 open issues extended**: new items 10 (unified-platform entities absent from the Domain Model/schema — deferred to #4/#10) and 11 (outbound-delivery infra prerequisite).
- **Downstream artifacts** (sequenced by the integration plan): Domain Model, Database Schema, API Specification, Security Architecture, Multi-Tenant Architecture, User Personas/Stories, UX Wireframes, Information Architecture, AI Analytics, Reporting/KPI, Windows Endpoint App (→ Hubs), Platform Services, Target Reference Architecture, plus the net-new PeakView360 and PeakAssist design docs.
