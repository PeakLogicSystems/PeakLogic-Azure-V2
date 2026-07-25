# Compliance & Certification Roadmap

**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Company:** PeakLogic
**Project codename:** Project Vantage
**Status:** Draft v1.1 (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1 until v1.1 is approved)
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (Draft v1.7, pending), [SRS](srs.md) (Draft v1.7, pending), [Domain Model](domain-model.md) (Draft v1.4, pending)
**Last updated:** 2026-07-17
**Fork note (v1.1):** the first amendment specific to the `PeakLogic-Azure` fork — substitutes real, researched Azure equivalents for the AWS-specific evidence sources this document originally cited (`azure-restructuring-plan.md` item 5). SOC 2's actual scope/sequencing decisions (§2) are cloud-agnostic and unchanged. See Revision History.

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

### 3.4 Cloud-vendor BAA availability on Azure — confirmed, not a blocker *(added v1.1)*

**Verified via research, not assumed**: Microsoft offers a HIPAA BAA for Azure at no additional cost, automatically included through the Microsoft Product Terms/Online Services Terms and Data Protection Addendum — no separate contract negotiation is required, the same "included by default, not a paid add-on" posture the AWS-native repo's compliance work already assumed for AWS. Hundreds of Azure services are covered, including the categories this platform would realistically use (compute, storage, managed databases, messaging/integration, Key Vault). This confirms the Azure pivot does not introduce a *new* HIPAA blocker relative to AWS — §3.1–§3.3's applicability read (does PeakView's data even constitute ePHI in the first place) is unchanged and remains the real open question, not cloud-vendor BAA availability. Whether the *specific* Azure services eventually selected (Infrastructure as Code, #16) fall within Microsoft's HIPAA-covered service list should be re-confirmed once those choices are made, the same "verify the specific service, don't assume the platform-wide claim covers it" discipline used elsewhere in this project.

Sources: [Azure HIPAA BAA — Online Services Terms](https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-hipaa-us), [Microsoft HIPAA/HITECH compliance offering](https://learn.microsoft.com/en-us/compliance/regulatory/offering-hipaa-hitech)

---

## 4. Readiness Gap Assessment (high-level)

Against the recommended Security + Availability + Confidentiality scope, checking existing implementation and already-approved SRS requirements against what a SOC 2 readiness assessment would typically look for:

| Area | Status |
|---|---|
| Encryption in transit/at rest | Already reconciled (SRS §5.2) — TLS; at-rest encryption via the eventual Azure Database for PostgreSQL + Blob Storage/CDN choice *(corrected v1.1 — previously named RDS/S3; exact Azure service TBD, Infrastructure as Code #16)* |
| Access control / RBAC | Already reconciled (SRS §3.9, AUTH-1–3) — identity-provider-issued tokens, server-enforced roles *(corrected v1.1 — previously named Cognito specifically; concrete Azure identity provider TBD, Security Architecture #13)* |
| Tenant data isolation | Already reconciled (SRS §3.5, MT-1–3) — structural RLS, not app-level filtering; the RLS pattern itself is standard Postgres, portable to Azure Database for PostgreSQL as-is |
| Audit logging (application-level) | Specified, not yet implemented (SRS §3.10, AUD-1–2) — needs to actually ship before an auditor can observe it operating; unaffected by the cloud choice, this is application-layer, not infra-layer |
| Audit logging (infrastructure-level) *(added v1.1)* | **Verified via research, not assumed**: the AWS-side evidence sources this document didn't originally name explicitly but the SOC 2 Control Mapping (#20) will need — CloudTrail (control-plane audit trail) and CloudWatch (metrics/alarms/log aggregation) — have real, distinct Azure equivalents, not a 1:1 rename: **Azure Activity Log** (subscription-level control-plane operations, the closer CloudTrail analogue) and **Azure Monitor** (metrics, alerting, Log Analytics, the closer CloudWatch analogue). A real difference worth flagging: Azure additionally splits authentication/identity audit evidence into separate **Entra ID Sign-in Logs** and **Entra ID Audit Logs**, where Cognito's audit trail on the AWS side was consolidated into CloudTrail — SOC 2 Control Mapping (#20) should account for a third evidence source here, not assume a straight two-way swap |
| MFA | Enforcement mechanism TBD pending the concrete identity-provider choice (Security Architecture, #13); the **policy decision** itself (required, not just available) carries over unchanged from the AWS-side document — not re-litigated by the cloud switch |
| Incident response plan | **Not yet written** — a real gap, unaffected by cloud choice; SOC 2 Security criterion expects a documented, tested plan |
| Vendor/subprocessor management | **Not yet formalized** — **Microsoft Azure** is the subprocessor for this track *(corrected v1.1 — previously named AWS)*; a documented vendor-risk process is expected regardless of which cloud vendor or how short the list is. Note for whoever formalizes this: if the Azure track and the AWS-native repo both reach production, the vendor/subprocessor list itself may need to name both, not just whichever repo is currently active |
| Change management process | **Not yet formalized** — git/PR discipline exists informally (per `CLAUDE.md`) but isn't yet a documented, evidenced control; unaffected by cloud choice |
| Named compliance owner | **Not yet assigned** — typical early-stage practice is a technical leader with dedicated time, not a full-time hire; unaffected by cloud choice |

This table is a starting gap list for the SOC 2 Control Mapping & Evidence Plan (#20), not the plan itself. **Most rows are unaffected by the AWS→Azure switch** — SOC 2 evaluates the *organization's* controls, not a specific cloud vendor; only the rows citing a specific AWS service by name needed correcting.

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
- **Open item, added v1.1 — §4's Azure evidence-source mapping (Activity Log/Monitor/Entra ID logs) should be re-verified once Infrastructure as Code (#16) and Security Architecture (#13) pick concrete Azure services.** This amendment confirms the *category* of evidence source changes correctly; it does not confirm the exact log schema/retention/export mechanism for whichever specific services get chosen — that re-verification is SOC 2 Control Mapping's (#20) job when it's amended.

---

## 7. Review Log

Approved as-is; no changes requested during review. See Revision History below for the subsequent v1.1 amendment.

---

## Revision History

**v1.1 (2026-07-17)** — the first amendment specific to the `PeakLogic-Azure` fork, forced by this document's own AWS-specific evidence-source references going stale the moment this repo forked for an Azure track (`azure-restructuring-plan.md` item 5), per the same non-silent-amendment discipline used throughout this project.

- **§3.4 added**: confirmed via real research (not assumed) that Microsoft offers a HIPAA BAA for Azure at no additional cost, the same "included by default" posture AWS has — the Azure pivot does not introduce a new HIPAA blocker. §3.1–§3.3's applicability read (does PeakView's data constitute ePHI at all) is unchanged and remains the actual open question.
- **§4 corrected, not just extended**: encryption/access-control/audit-logging/vendor-management rows previously named AWS services (RDS/S3, Cognito, AWS-as-subprocessor) verbatim — accurate for the repo this was forked from, stale for this fork. Corrected to generalized Azure-track language, with concrete service selection explicitly deferred to Infrastructure as Code (#16) and Security Architecture (#13), the same boundary this document already held for AWS.
- **A new infrastructure-audit-logging row added, not just relabeled**: real research found Azure's evidence sources are not a clean 1:1 rename of AWS's — **Azure Activity Log** (≈ CloudTrail) and **Azure Monitor** (≈ CloudWatch) are the two closest analogues, but Azure additionally splits authentication/identity audit evidence into separate **Entra ID Sign-in Logs** and **Entra ID Audit Logs**, which Cognito's AWS-side audit trail didn't separate out. Flagged explicitly so SOC 2 Control Mapping (#20) doesn't assume a simple two-way swap when it's amended.
- **§6 open item added**: this amendment confirms the evidence-source *category* mapping; the exact log schema/retention/export mechanism for whichever concrete Azure services get chosen still needs re-verification once Infrastructure as Code (#16)/Security Architecture (#13) land — SOC 2 Control Mapping's (#20) job, not resolved here.
- **Unchanged, confirmed cloud-agnostic**: §2 (SOC 2 Trust Services Criteria selection, Type I/II sequencing) and most of §4 — SOC 2 evaluates organizational controls, not a specific cloud vendor, so only AWS-service-specific rows needed correction.
