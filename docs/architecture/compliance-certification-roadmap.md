# Compliance & Certification Roadmap

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1), [SRS](srs.md) (approved v1), [Domain Model](domain-model.md) (approved v1)
**Last updated:** 2026-07-04

---

## 1. Introduction

### 1.1 Purpose

Unlike the docs so far, this artifact needs real, externally verified information, not just internal product reasoning — the same distinction IronQuill draws for its Regulatory Requirements Matrix. This document scopes *what* certification target to pursue and roughly *when*, grounded in current (2026) SOC 2 practice and a real assessment of HIPAA applicability given the nursing-home vertical. It is not itself a control-by-control audit prep document — that's the **SOC 2 Control Mapping & Evidence Plan** (#20), which this roadmap feeds.

**Caveat that applies to this entire document:** it is grounded in web research current as of 2026-07-04, not a legal or audit-firm opinion. Before committing budget or making a customer-facing compliance claim, both the SOC 2 scope decision (§2) and the HIPAA applicability read (§3) should be confirmed with a real auditor/GRC platform and counsel, respectively — the same standing caveat IronQuill applies to its regulatory citations.

### 1.2 Scope

In scope: SOC 2 Trust Services Criteria selection, Type I/II sequencing, a rough certification timeline tied to the confirmed beachhead verticals, a HIPAA applicability read for the nursing-home vertical, and a high-level readiness gap assessment against the existing implementation.

Out of scope: control-by-control mapping and evidence collection (→ SOC 2 Control Mapping & Evidence Plan, #20), detailed technical security controls (→ Security Architecture, #13), and threat-level analysis (→ Threat Model, #17).

---

## 2. SOC 2 Scope Decision

### 2.1 Trust Services Criteria

SOC 2 evaluates against five Trust Services Criteria; **Security is mandatory**, the rest are elected based on what customers actually need assurance about:

| Criterion | Recommended for PeakView v1? | Rationale |
|---|---|---|
| **Security** | Required (mandatory) | No decision to make — every SOC 2 report includes it |
| **Availability** | **Yes** | The core product pitch is real-time alerting before a loss occurs (Vision §12) — an availability failure directly undermines the thing being sold. Enterprise buyers in this category will ask about uptime. |
| **Confidentiality** | **Yes** | Tenant operational data (site layouts, device inventories, business configuration) has real confidentiality value, and multi-tenant isolation is already a first-class architectural theme (MT-1–MT-3) — this criterion is close to "free" given work already done. |
| **Processing Integrity** | Not yet | Relevant to alert/analytics accuracy, but not typically a first-ask from customers at this stage; add if a specific enterprise deal requires it. |
| **Privacy** | Not yet, pending §3 | PeakView's core data is equipment/facility telemetry, not personal data — Privacy isn't clearly needed *unless* the nursing-home vertical's data flows turn out to touch resident-identifiable information (see §3). |

**Recommendation:** scope the initial SOC 2 report to **Security + Availability + Confidentiality**. Revisit Privacy explicitly once §3 is resolved with real legal input.

### 2.2 Type I vs. Type II Sequencing

- **Type I** — assesses control *design* at a point in time. No observation period required; achievable in roughly 4–12 weeks, typically $5K–$25K.
- **Type II** — assesses control design *and* operating effectiveness over an observation window (auditors typically want at least 3 months, commonly 6); full process runs roughly 9–14 months end-to-end, commonly $30K–$50K+ in the first year with a GRC platform.

**Recommendation, following common early-stage SaaS practice:** pursue **Type I first** to unblock early enterprise conversations quickly, and begin the **Type II observation period immediately after** (or in parallel, once controls are stable) rather than treating them as sequential, unrelated efforts. Given the confirmed beachhead verticals (pool servicing, QSR/gas-station-convenience) are not necessarily enterprise-scale buyers on day one, there's some real runway before Type II is *required* by a deal — but starting the observation period early, well before the industrial-pumping-station (next vertical) or true enterprise conversations mature, avoids the common failure mode of scrambling for it under deal pressure.

---

## 3. HIPAA Applicability Assessment (Nursing-Home Vertical)

### 3.1 The real question

Nursing homes are HIPAA **covered entities** — they must comply with HIPAA's Privacy, Security, and Breach Notification Rules. Any vendor whose platform "creates, receives, maintains, or transmits" electronic Protected Health Information (ePHI) on a covered entity's behalf becomes a **Business Associate**, requiring a signed Business Associate Agreement (BAA) with obligations around encryption, access control, audit logging, and breach notification.

### 3.2 Current read, not a final answer

PeakView's core telemetry for the nursing-home vertical (per Vision §6/PRD §8: leak detection, equipment health, energy usage) is **facility- and equipment-condition data, not patient health information** — a leak sensor tripping in a utility closet or a cooler's temperature reading does not, on its face, describe an identifiable resident's health condition. On that basis, PeakView's *current* scoped functionality likely sits **outside** HIPAA's Business Associate definition.

**This is not something to assume and move on from, though** — it should be explicitly reconfirmed, with counsel, before any nursing-home deployment, because it's easy to drift into Business Associate territory without a deliberate decision: a service ticket or alert that incidentally includes a resident's name or room-specific health-adjacent context, an integration that pulls in occupancy/census data, or a future MCP tool that exposes more context than intended could all change this answer. The device-adapter and MCP frameworks (SRS §3.1, §3.7) should treat "does this touch ePHI" as a standing design question for anything built specifically for the nursing-home vertical, not a one-time determination.

### 3.3 Recommendation

- Do **not** sign a BAA or make a HIPAA-compliance claim until a real legal review of the actual nursing-home data flows has occurred — this document sets the working assumption, not a certification.
- Keep facility/equipment telemetry and anything resident-identifiable structurally separate by design, so the answer to "do we touch ePHI" stays "no" by architecture, not by accident.

---

## 4. Readiness Gap Assessment (high-level)

Against the recommended Security + Availability + Confidentiality scope, checking existing implementation and already-approved SRS requirements against what a SOC 2 readiness assessment would typically look for:

| Area | Status |
|---|---|
| Encryption in transit/at rest | Already reconciled (SRS §5.2) — TLS, RDS/S3 encryption |
| Access control / RBAC | Already reconciled (SRS §3.9, AUTH-1–3) — Cognito, server-enforced roles |
| Tenant data isolation | Already reconciled (SRS §3.5, MT-1–3) — structural RLS, not app-level filtering |
| Audit logging | Specified, not yet implemented (SRS §3.10, AUD-1–2) — needs to actually ship before an auditor can observe it operating |
| MFA | Present at the Cognito layer per existing infra; **enforcement policy** (is it required, not just available) needs an explicit decision — not yet made |
| Incident response plan | **Not yet written** — a real gap; SOC 2 Security criterion expects a documented, tested plan |
| Vendor/subprocessor management | **Not yet formalized** — AWS is the only subprocessor today, but a documented vendor-risk process is expected regardless of how short the list is |
| Change management process | **Not yet formalized** — git/PR discipline exists informally (per `CLAUDE.md`) but isn't yet a documented, evidenced control |
| Named compliance owner | **Not yet assigned** — typical early-stage practice is a technical leader with dedicated time, not a full-time hire |

This table is a starting gap list for the SOC 2 Control Mapping & Evidence Plan (#20), not the plan itself.

---

## 5. Certification Roadmap (indicative timeline)

Tied to the confirmed beachhead verticals and MVP sequencing, not calendar dates (which depend on when engineering capacity is available):

1. **Now → MVP ship**: close the readiness gaps in §4 that are cheap regardless of SOC 2 (audit logging, MFA enforcement decision) as part of normal MVP work, not a separate compliance project.
2. **Post-MVP**: formalize incident response plan, vendor management process, and change management evidence — the genuinely new-effort items in §4.
3. **Pursue SOC 2 Type I** once §4's gaps are closed — fast, unblocks early enterprise conversations.
4. **Begin Type II observation window** shortly after Type I, targeting completion before the industrial-pumping-station vertical (or true enterprise deals) is actively being sold, per §2.2's reasoning.
5. **Revisit HIPAA (§3) explicitly** before any nursing-home deployment, independent of the SOC 2 timeline.

---

## 6. Key Risks & Open Items

- **Risk — SOC 2 pricing/process guidance changes.** §2.2's cost/timeline figures are current as of 2026-07-04 web research; get real quotes before budgeting, not this document's numbers.
- **Risk — HIPAA read in §3 is a working assumption, not a legal conclusion.** Treat it as provisional until reviewed by counsel against actual nursing-home data flows.
- **Open item — named compliance owner not yet assigned.** Needs a decision before the Type I engagement starts, since auditors expect a real point of contact.
- **Open item — Privacy criterion (§2.1) depends on §3's resolution.** If the HIPAA review surfaces any resident-identifiable data flow, Privacy should be added to scope, not treated as a later add-on.

---

## 7. Review Log

Approved as-is; no changes requested during review.
