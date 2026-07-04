# Software Requirements Specification (SRS)

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1.1 (amended — see Revision History, end of document)
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.1)
**Last updated:** 2026-07-04

---

## 1. Introduction

### 1.1 Purpose

The PRD says *what* we are building and in what priority order. This SRS says *how the system must behave* — precise enough that (a) engineering can implement against it without re-deriving intent, and (b) a future Test Strategy artifact (#18) can write a test per `shall`-statement without ambiguity. Every requirement here traces to a PRD requirement ID; where this document adds detail the PRD didn't specify, it's marked **(SRS-new)** and must not contradict PRD scope or priority.

This SRS covers the **MVP** horizon only, matching the PRD's horizon. Enterprise-roadmap items (actuation, active electrical load conditioning, a self-service adapter marketplace, MCP-client behavior) are referenced only where the architecture must not preclude them later.

### 1.2 Scope

In scope: the device-adapter framework, the sensing modalities and alerting pipeline, device-management UX, multi-tenancy, device/command networking (outbound-only, no actuation), the MCP server and baseline analytics, and lightweight channel-partner attribution — as bounded by PRD §4.

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
| **Channel partner** | A reseller/supplier (e.g. a pool-chemical supplier) whose customers' tenants/devices are attributed to them for revenue-share purposes |
| **Commands topic** | The per-device MQTT topic already scoped in the IoT device policy for future actuation; unused at MVP (CC-3) |
| MVP requirement IDs (`DA-`, `SN-`, `AL-`, `UX-`, `MT-`, `CC-`, `MCP-`, `AI-`, `CH-`) | Defined in [PRD](prd.md) §5; reused verbatim in this SRS as the traceability key |

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
AWS IoT Core (existing)                            CloudFront/S3 (existing)
        │  Topic Rule                                            │
        ▼                                                        ▼
peaklogic-ingest Lambda (existing, extended)        API Gateway + Cognito authorizer (existing)
        │                                                        │
        ├── Device Adapter Registry (new — formalizes            ▼
        │   existing RULES_BY_CATEGORY, §3.1)         peaklogic-api Lambda (existing, extended)
        ├── Alert / Ticket pipeline (existing)                    │
        └── Baseline Analytics (new, §3.7)                        ├── router.ts → routes/*.ts (existing)
                                                                   ├── requireRole() → withTenant() RLS (existing)
                                                                   └── MCP Server (new, §3.7)
                                                                              │
                                                          External AI/Agent Consumer (new integration surface)

RDS PostgreSQL (existing, RLS-enforced) ── tenants, users, sites, assets, devices, telemetry, alerts, service_tickets
Cognito (existing) ── auth/RBAC
```

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

### 2.3 User Classes and Characteristics

Reused from PRD §3 (full personas deferred to artifact #6):

| Role | Technical sophistication | Primary environment |
|---|---|---|
| Facility Operator | Low; time-pressured, non-technical | Web dashboard, on-site |
| Tenant Admin | Moderate-to-high (configures sites/devices/users) | Web dashboard, office |
| Service Partner | Moderate | Web dashboard, on-site/mobile browser |
| Channel Partner / Reseller | Low-to-moderate (attribution only at MVP) | N/A — no dedicated UI at MVP |
| External AI/Agent Consumer *(system actor, not a login role)* | N/A | Queries MCP server programmatically |

### 2.4 Operating Environment

- **Backend/cloud**: AWS (IoT Core, Lambda, RDS PostgreSQL, Cognito, API Gateway, CloudFront/S3), provisioned via existing CDK stacks — reconciled, not re-platformed.
- **Client**: responsive web dashboard (React SPA) only; no native mobile app at MVP (PRD §7).
- **Device firmware**: outbound-only MQTT/TLS; port 443 preferred over 8883 for new firmware (CC-2).

### 2.5 Design and Implementation Constraints

- The device adapter contract (§3.1) must be addable without modifying core ingest dispatch logic — no new sensing modality may require forking `backend/ingest/handler.ts`'s dispatch flow, only adding a new adapter definition.
- Multi-tenant isolation must remain structural (Postgres RLS via `withTenant()`), not an application-level filter alone — new modalities inherit this automatically via the existing `assets`/`devices` foreign-key model (MT-3).
- The per-device `commands` MQTT topic, already scoped in the IoT device policy, must remain unpublished-to at MVP (CC-3) — no code path may send a command to a device.
- The MCP server must authenticate through the existing Cognito-issued tokens — no parallel auth system (MCP-2).

### 2.6 Assumptions and Dependencies

- Domain Model (#4) will formalize entity/relationship structure this SRS refers to loosely (Device, Asset, Adapter, Telemetry, Alert, Tenant, etc.); where this SRS names an entity, it is a placeholder pending that artifact.
- **Threshold/reference values for new sensing modalities are placeholders pending real verified input.** Pool-chemistry safe ranges (pH, chlorine, TDS) and gas-detection thresholds need real, verified safety-standard citations before production use — this SRS specifies the *mechanism* (adapter contract, alert pipeline), not authoritative threshold content, the same way IronQuill's SRS separates mechanism from the Regulatory Requirements Matrix's content. Flagged as Open Issue #1, §9.
- Device & Command Security Architecture (#12) will define the actuation/command model when that work is scheduled; this SRS only guarantees the `commands` topic exists and stays unused (CC-3/CC-4).

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
| SN-4.1 | A new `pool_chemistry` adapter shall evaluate pH, free/total chlorine, and dissolved solids (TDS) against threshold rules — **threshold values are placeholders pending real verified pool-safety standards** (Open Issue #1, §9), not to be treated as production-ready as first implemented |
| SN-5.1 | A new `gas_sensor` adapter shall evaluate a binary gas-leak-detected signal identically in structure to SN-3.1 (immediate critical alert, no warning tier) |
| SN-6.1 | Ambient and product-probe temperature shall continue to be evaluated per the existing `hvac`/`refrigeration`/`pool_system` adapters, unchanged |
| SN-7.1 | A new `air_quality` adapter shall evaluate at least one representative metric (e.g. CO2 ppm) against a threshold rule; additional pollutant metrics are a content addition to this adapter later, not a re-architecture |

**Error/edge conditions:** a `pool_chemistry` or `gas_sensor` reading arrives before verified threshold values are available (system shall still store telemetry and may evaluate against placeholder thresholds, but any alert produced shall be understood as provisional until Open Issue #1 is resolved — this is a content-accuracy caveat, not a system defect).

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
| MCP-1.1 | The system shall expose an MCP server offering, at minimum, tools to: list devices/alerts for a tenant, fetch telemetry for a device within a time range, and fetch alert detail — read-only at MVP, no tool shall mutate state |
| MCP-2.1 | MCP tool calls shall authenticate using the same Cognito-issued tokens as the REST API, and shall enforce the same tenant scoping (`withTenant()`, MT-1.1) — no separate auth or authorization path |
| AI-3.1 | Baseline analytics shall compute, for each device/metric pair with sufficient history, a trailing-window statistical baseline (e.g. mean/standard-deviation over a rolling period) and shall flag a reading whose deviation from that baseline exceeds a configured threshold, independent of the adapter's static threshold rules |
| AI-3.2 | A trend/anomaly flag from AI-3.1 shall be surfaced through the existing alert pipeline (AL-1.1) as its own `type` (distinct from `threshold`), so it is visually and functionally distinguishable from a static-threshold alert |
| AI-3.3 | The deviation threshold that triggers an AI-3.1 flag shall be configurable at minimum per adapter/category *(added — see Revision History)* — a hardcoded, one-size-fits-all sensitivity is not acceptable given how directly alert-fatigue tolerance drives whether a Site-Level Facility Operator keeps trusting the product (User Personas §6 item 3) |
| AI-4.1 | No code path shall exist at MVP where PeakLogicSystems' AI/analytics layer initiates a call to an external MCP server — this is a hard MVP boundary, not a performance target |

**Error/edge conditions:** a device/metric pair has insufficient history for a trailing-window baseline (AI-3.1 shall not fire a flag until a minimum history threshold is met — no flag is preferable to a flag computed on too little data).

### 3.8 Channel & Partner Support (→ PRD §5.8 CH-1–CH-3)

| ID | Requirement |
|---|---|
| CH-1.1 | A tenant record shall support an optional channel-partner reference (identifying which reseller/supplier relationship the tenant came through) |
| CH-2.1 | The system should provide a queryable report of tenants/devices grouped by channel-partner reference, for manual/offline revenue-share calculation — not an automated billing/payout feature |
| CH-3.1 | No self-service partner portal, automated revenue-share calculation, or co-branded/white-label dashboard view shall exist at MVP |

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

### 3.11 Portfolio & Route Reporting (→ PRD §5.9 RP-1–RP-3) *(added — see Revision History)*

| ID | Requirement |
|---|---|
| RP-1.1 | The system shall provide a query/view returning aggregate status (site count by health state, open-alert count) across every Site a Tenant Admin or Corporate/Regional Ops Leader is authorized to see, scoped by the existing tenant/RLS model (MT-1.1) — not a per-device query repeated by the client |
| RP-2.1 | The system shall provide a query/view returning a Service Partner's assigned sites for the current day, ordered by a defined urgency ranking (e.g. open critical alerts first, then trending-toward-threshold per AI-3.1, then healthy) |

**Error/edge conditions:** a Tenant Admin/Ops Leader has zero sites, or a Service Partner has zero assigned stops for the day (RP-1.1/RP-2.1 shall return an empty, valid result — not an error state).

---

## 4. External Interface Requirements

### 4.1 User Interfaces

- Web dashboard (React SPA): device add/view/manage, alerts, tickets, sites/assets — the only human-facing client at MVP (PRD §7). Detailed screen specs deferred to UX Wireframes (#8).

### 4.2 Hardware Interfaces

- Sensor hardware (temperature probe, pH/chlorine/TDS probe, gas sensor, flow meter, current/power meter) — read-only telemetry sources; no end-user-facing hardware interface beyond the browser.

### 4.3 Software Interfaces

| Component | Role | Notes |
|---|---|---|
| AWS IoT Core | Device connectivity | Outbound-only MQTT/TLS (CC-1.1); existing |
| Lambda (ingest + API) | Compute | `peaklogic-ingest`, `peaklogic-api`; existing, extended per §3.1–§3.3 |
| RDS PostgreSQL | Primary relational store | RLS-enforced (MT-1.1); existing |
| Cognito | Identity/auth | Existing; reused by MCP server (MCP-2.1) |
| API Gateway | REST API surface | Existing |
| CloudFront/S3 | Frontend hosting | Existing |
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

- Not a primary concern at MVP — the existing implementation is already AWS-committed (IoT Core, Lambda, RDS, Cognito). The portability principle that does apply: infrastructure is defined via CDK (existing), so environment reproducibility doesn't depend on manual console configuration.

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
| §3.8 Channel & Partner Support | PRD §5.8 (CH-1–CH-3) | 1:1 elaboration |
| §3.9 Auth & Access Control | PRD §6 (Security baseline) | **SRS-new** — synthesized from cross-cutting PRD references |
| §3.10 Audit Logging | PRD §6 (Security baseline), CH-2.1 | **SRS-new** |
| §3.11 Portfolio & Route Reporting | PRD §5.9 (RP-1–RP-3) | 1:1 elaboration — added v1.1 |
| §5 Non-Functional Requirements | PRD §6 | 1:1 elaboration per category |

Where a future artifact (Domain Model, Database Schema, Security Architecture, etc.) forces a change to a requirement above, that change should be made explicitly in a revision to this document, per the governance rule carried from the Vision Document and PRD.

---

## 9. Open Issues Deferred to Later Artifacts

1. **Threshold/reference values for new modalities** (SN-4.1 pool chemistry, SN-5.1 gas) are placeholders pending real, verified safety-standard citations — needs domain-expert or regulatory-source input before production use. This is analogous to IronQuill's separation of mechanism (this SRS) from authoritative content (a future reference-data task).
2. **Actuation/command security model** — CC-3/CC-4 establish that nothing ships at MVP; the full design (authorization, audit trail, fail-safe-locally behavior) is Device & Command Security Architecture's (#12) job.
3. **Entity/relationship formalization** — flagged throughout as the Domain Model's (#4) job.
4. **SOC 2 control-level detail** — this SRS's Security baseline (§5.2) is a floor, not a control mapping; that's the Compliance & Certification Roadmap and SOC 2 Control Mapping & Evidence Plan's (#5/#20) job.
5. **Exact MCP tool schema and transport** — MCP-1.1/MCP-2.1 specify observable behavior only; the API Specification (#11) owns the exact contract.

---

## 10. Review Log

Approved as-is at v1; no changes requested during that review. See Revision History below for the subsequent v1.1 amendment.

---

## Revision History

**v1.1 (2026-07-04)** — forced by the User Personas artifact (#6) and the PRD's own v1.1 amendment, per this document's rule (§8) that a downstream artifact surfacing a needed change must amend this document explicitly rather than silently diverging from it.

- **§3.11 added (RP-1.1, RP-2.1)**: elaborates the PRD's new §5.9 (Portfolio & Route Reporting), itself added because the User Personas artifact surfaced two persona needs (multi-site roll-up, route-prioritized view) that had no home in the original single-device-level UX-2.
- **AI-3.3 added**: baseline-analytics sensitivity must be configurable per adapter/category, elaborating the PRD's reworded AI-3 — the User Personas artifact made explicit that alert-fatigue tolerance drives product trust more than any single feature.
