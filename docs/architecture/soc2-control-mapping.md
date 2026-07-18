# SOC 2 Control Mapping & Evidence Plan

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v1.1 (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1 — AWS-native — until v1.1 is approved)
**Depends on:** [Compliance & Certification Roadmap](compliance-certification-roadmap.md) (Draft v1.1, pending), [Security Architecture](security-architecture.md) (Draft v2.0, pending), [Multi-Tenant Architecture](multi-tenant-architecture.md) (Draft v1.4, pending), [Threat Model](threat-model.md) (Draft v1.1, pending)
**Last updated:** 2026-07-17
**Fork note (v1.1):** the first amendment specific to the `PeakLogic-Azure` fork — swaps AWS-specific evidence sources for their real, already-researched Azure equivalents (Compliance & Certification Roadmap §4's own v1.1 amendment). SOC 2's actual control requirements are cloud-agnostic and unchanged. See Revision History.

---

## 1. Introduction

### 1.1 Purpose

Compliance & Certification Roadmap (#5) has pointed here since the project's first week — it scoped *what* to pursue (Security + Availability + Confidentiality, Type I then Type II) and roughly *when*; this document does the control-by-control mapping that roadmap explicitly deferred, and closes the specific gaps its own §4 readiness table flagged as unimplemented or unformalized: audit logging (now built — Security Architecture), MFA enforcement (now decided — Security Architecture §2.2), incident response plan (§5), vendor/subprocessor management (§6), change management evidence (§7), named compliance owner (§8).

### 1.2 Scope

In scope: mapping AICPA's 2017 Trust Services Criteria (Common Criteria CC1–CC9, plus Availability A1 and Confidentiality C1 — the three criteria Compliance & Certification Roadmap §2.1 recommended) to the controls already built across 19 prior approved artifacts, with real evidence citations, not just a checklist. Closing the specific organizational gaps that table flagged.

Out of scope: Processing Integrity and Privacy criteria (Compliance & Certification Roadmap §2.1 — not yet needed, Privacy pending the HIPAA legal review that document's §3 flagged as still outstanding); a full audit-ready evidence *repository* (screenshots, exported logs, signed policies) — this document maps controls to their evidence *source*, it doesn't collect the evidence itself, which is normally done during the actual Type I engagement.

---

## 2. Control Framework

AICPA's 2017 Trust Services Criteria, Common Criteria (CC1–CC9) apply regardless of which optional criteria are in scope — every SOC 2 report includes them. Availability (A1) and Confidentiality (C1) add a small number of criteria-specific points on top. This document doesn't reproduce the full AICPA text (it's a licensed framework); each row below names the criterion by its standard ID and states what it's actually asking in plain terms.

---

## 3. Control Mapping

| Criterion | Asks | Control | Evidence source |
|---|---|---|---|
| **CC1** — Control Environment | Governance, org structure, integrity/ethics commitment, accountability | **Partial — see §9.** Architecture-first governance (`docs/architecture/`, this project's entire discipline) is real evidence of a documented decision-making process; a formal code of conduct, background-check policy, and org chart are not | `docs/architecture/README.md`'s own governance model; §9 for what's still missing |
| **CC2** — Communication & Information | Internal/external communication of security policies and incidents | CLAUDE.md (every operational policy in one place, version-controlled), CHANGELOG.md (user-facing change communication), this entire `docs/architecture/` tree | `CLAUDE.md`, `CHANGELOG.md`, `docs/architecture/` |
| **CC3** — Risk Assessment | Identify and analyze risks to objectives | **Threat Model (#19)**, approved v1 — a real STRIDE-per-surface pass that found and fixed two live vulnerabilities, not a template exercise | `docs/architecture/threat-model.md` |
| **CC4** — Monitoring Activities | Ongoing evaluation of control effectiveness | **Real gap found and fixed on AWS; Azure equivalent verified, not yet implemented for this fork** — see §4 *(corrected v1.1)* | `infra-azure/modules/monitoring.bicep` *(not yet written)*, Azure Monitor Alerts/console |
| **CC5** — Control Activities | Policies and procedures that enforce the above | **PSRule for Azure** *(corrected v1.1 — previously named `cdk-nag`)* (automated, every Bicep build — Infrastructure as Code §4), suppressions with written reasons, RLS policies (`docs/data-model.sql`, confirmed portable — Database Schema §4.7) | Infrastructure as Code §4, `docs/data-model.sql` |
| **CC6** — Logical & Physical Access Controls | Authentication, authorization, network segmentation | **Corrected v1.1**: Entra External ID + MFA required (Security Architecture §2.1/§2.2), RBAC server-enforced (`requireRole()`, unchanged application logic), RLS tenant isolation (Multi-Tenant Architecture, verified portable), Azure VNet network segmentation, device X.509 mutual TLS via IoT Hub/DPS (Device & Command Security Architecture §2). Physical access controls are **Microsoft's** responsibility under Azure's shared-responsibility model — Microsoft's own SOC 2/ISO reports cover this | Security Architecture, Multi-Tenant Architecture, Device & Command Security Architecture; Microsoft's own compliance reports (obtained during a real Type I engagement, not held today) |
| **CC7** — System Operations | Incident detection/response, vulnerability management, backup | Incident response — see §5. Vulnerability management — PSRule for Azure + `npm audit` (unaffected by cloud switch — an npm-ecosystem concern). Backup — **corrected v1.1**: Azure Database for PostgreSQL automated backups (Deployment Architecture §3.2, RPO ≤5min/RTO ≤4hr targets, verified via real Azure documentation — same targets, not yet drilled) | §5 (this doc), `CHANGELOG.md`, Deployment Architecture §3.2 |
| **CC8** — Change Management | Controlled, documented change process | `CLAUDE.md`'s Release Process and Git Discipline sections — unaffected by the cloud switch, a pure process control. Formalized as evidence in §7 | `CLAUDE.md` → "Version Control Standards", "Git Discipline"; git history itself |
| **CC9** — Risk Mitigation | Vendor/subprocessor risk, business continuity | Vendor management — see §6 *(corrected v1.1 — Microsoft replaces AWS)*. Business continuity — Deployment Architecture's rollback procedure and resource-group-per-stage separation | §6 (this doc), Deployment Architecture §4.2, §2 |
| **A1** — Availability | Capacity planning, backup, disaster recovery | **Corrected v1.1**: Deployment Architecture's stage-conditional zone-redundant HA for prod (§3.1, Azure Database for PostgreSQL's real HA feature, verified), RPO/RTO targets (§3.2, verified via real Azure backup documentation), rollback procedure (§4.2 — written but not yet drilled, same standing caveat) | Deployment Architecture §2–§4 |
| **C1** — Confidentiality | Protecting confidential/tenant data specifically | RLS (Multi-Tenant Architecture — the telemetry-RLS-class bug class carries forward as a lesson, not yet re-verified against Azure), encryption at rest/in transit (Security Architecture §4), **Azure Key Vault** + rotation *(corrected v1.1 — previously named AWS Secrets Manager)* (Security Architecture §4.3), SSRF guard (Threat Model §4.2 — verified to also cover Azure's own IMDS at the identical address) | Multi-Tenant Architecture, Security Architecture §4, Threat Model §4.2 |

---

## 4. CC4: Active Monitoring — AWS gap and fix carry forward as a lesson, Azure implementation not yet built

**The AWS finding (zero CloudWatch Alarms existed anywhere) is restated as a standing requirement for this fork, not a live finding** — no Azure infrastructure exists yet to check. The lesson carries forward unconditionally: whoever writes `infra-azure/modules/monitoring.bicep` must build active alerting from the start, not merely extensive-but-unwatched logging.

**Azure design, mirroring the AWS version's shape, verified mechanism**: **Azure Monitor Alerts** (metric alerts on API/ingest Function errors, API 5xx, database CPU/storage) plus an **Action Group** per stage — the direct structural analogue of CloudWatch Alarms + SNS topic. Email notification should remain an optional, explicit parameter (mirroring the AWS version's `-c alarmEmail=` context value, not hardcoded) — this document doesn't have authority to pick a real address any more than the AWS version did. **Not yet implemented** — no `infra-azure/` modules exist yet (Infrastructure as Code §8).

---

## 5. Incident Response Plan

Compliance & Certification Roadmap §4 flagged "no documented, tested incident response plan" as a real gap; Security Architecture §6 built the *technical* skeleton (what a responder can actually do — revoke a device, the audit log, CloudWatch/Flow Logs as forensic sources) and explicitly deferred the *process* here. This is that process, for the first time.

### 5.1 Severity Levels

| Level | Definition | Example |
|---|---|---|
| **SEV1 — Critical** | Active data breach, cross-tenant data exposure, or full outage | The telemetry-RLS bug (Multi-Tenant Architecture §2.2) or the ticket-webhook SSRF (Threat Model §4.2), had either been discovered via an actual exploit rather than internal review |
| **SEV2 — High** | Significant degradation, a contained security finding, or a single tenant's data at risk | A CloudWatch alarm firing for sustained 5xx errors or RDS exhaustion |
| **SEV3 — Low** | Minor bug, no data/availability impact | The telemetry-value-validation gap (Threat Model §4.1) — real, but narrow blast radius |

### 5.2 Roles (as of 2026-07-11)

**Compliance owner and incident commander: the user** (per direct decision, 2026-07-11) — matches Compliance & Certification Roadmap §6's own "a technical leader with dedicated time, not a full-time hire" expectation for this project's current stage. Re-evaluate this pairing (owner and commander as one person) once team size grows past what one person can reasonably hold during a real incident.

### 5.3 Process

1. **Detection** — a CloudWatch Alarm (§4), a manual report, or (once configured) the SNS email notification.
2. **Triage** — assign a severity level (§5.1) within 1 hour of detection for SEV1/2, same business day for SEV3.
3. **Containment** — for a security finding specifically, follow this project's own established pattern from this session: stop other work, fix the specific vulnerability first (not a broader refactor), verify the fix, then resume. This isn't a new invention — it's exactly what happened for the telemetry RLS bug, the SSRF, and the telemetry validation gap, formalized here as the actual documented procedure rather than an ad hoc pattern.
4. **Communication** — SEV1 affecting tenant data: notify affected tenant(s) directly. No specific breach-notification timeline is committed here — most US state breach-notification laws and any future BAA (Compliance & Certification Roadmap §3) would set a real one; this document doesn't invent a number without that legal input.
5. **Post-incident review** — for SEV1/SEV2, a written record of what happened, root cause, and fix — this project's own git commit messages already do this in practice (see e.g. commit `11d6dba`'s message for the SSRF fix) — continue that discipline explicitly for incidents, not just bug fixes.

### 5.4 What this plan does not cover

A real breach-notification legal obligation analysis (needs counsel, same caveat Compliance & Certification Roadmap §3 already states for HIPAA), and a formal RPO/RTO drill (Deployment Architecture §3.2's targets are stated, not tested against a real deploy — same standing gap repeated across this project).

---

## 6. Vendor & Subprocessor Management

**Confirmed subprocessors, checked against actual project dependencies, not assumed:**

| Subprocessor | Role | Review basis |
|---|---|---|
| **Microsoft Azure** *(corrected v1.1 — previously AWS)* | Primary cloud infrastructure (Azure Functions, Azure Database for PostgreSQL, Entra External ID, IoT Hub, static hosting/CDN, Key Vault) | Microsoft's own SOC 2 Type II / ISO 27001 reports (obtainable during a real Type I engagement) — the shared-responsibility model this fork's architecture already assumes; confirmed via Compliance & Certification Roadmap §3.4 that Microsoft also offers a HIPAA BAA at no extra cost, same posture as AWS |
| **GitHub** | Source control, CI/CD | Unchanged — GitHub's own SOC 2 report; access scoped via Entra Workload Identity Federation, no long-lived credentials (CI/CD Pipeline §4) |

**No other subprocessors identified**, same conclusion as the AWS version for the same reasons (billing out of MVP scope, no third-party analytics/logging SaaS) — unaffected by the cloud switch. **If both the AWS-native and Azure tracks ever reach production simultaneously, this list may need to name both clouds, not just whichever repo is currently active** — a real consideration Compliance & Certification Roadmap §4 already flagged, restated here for this document's own vendor table.

---

## 7. Change Management Evidence

Not a new process — `CLAUDE.md`'s existing "Version Control Standards" and "Git Discipline" sections already are this control; this section formalizes them *as* SOC 2 evidence rather than leaving them purely as internal engineering practice:

- **SemVer + Conventional Commits** — every change is typed (`feat:`/`fix:`/`docs:`/etc.) and versioned predictably.
- **Mandatory commit-and-push discipline** — "after completing any meaningful unit of work... commit and push immediately" (`CLAUDE.md`) — the git history itself is the audit trail, not a separate change-log system.
- **Keep a Changelog `[Unreleased]` section** — every pending change is visible before it ships, including security-relevant ones (e.g., the esbuild/Vite advisory has sat there, tracked, since v1.0.0).
- **Release process** (`CLAUDE.md` → "Release Process") — a fixed, ordered checklist (typecheck → changelog → merge → tag → sysadmin guide) executed the same way every time, not ad hoc.

**Evidence for an auditor:** the git history itself (`git log`), `CHANGELOG.md`, and this project's own architecture-doc discipline (every non-trivial decision has a written record with a *why*, per this document's own citations throughout).

---

## 8. Compliance Owner

**The user**, decided directly 2026-07-11 — matches Compliance & Certification Roadmap §6's expectation that this role starts as "a technical leader with dedicated time," not a hire. Named here so a future Type I engagement has a real point of contact from day one, not a gap discovered during the engagement itself.

---

## 9. What This Document Cannot Fix — CC1 Control-Environment Gaps

Several CC1 (Control Environment) points-of-focus are fundamentally organizational/HR, not architectural — no amount of code or documentation closes them:

- A formal, signed code of conduct / acceptable-use policy.
- Background-check policy for anyone with production access.
- A documented org chart / reporting structure (trivial at current team size, but auditors still expect it written down).

**Not gaps this document was positioned to close** — flagged honestly as pre-Type-I-engagement prerequisites, the same way Compliance & Certification Roadmap §6 already flagged "named compliance owner" before this document resolved that one specifically.

---

## 10. Traceability

| Section | Traces to |
|---|---|
| §3 Control Mapping | Compliance & Certification Roadmap §2.1 (scope decision), every prior approved artifact cited inline |
| §4 CC4 monitoring gap | New finding — already fixed (commit `993a554`) |
| §5 Incident Response Plan | Compliance & Certification Roadmap §4 (open item), Security Architecture §6 (technical skeleton this builds on) |
| §6 Vendor Management | Compliance & Certification Roadmap §4 (open item) |
| §7 Change Management | Compliance & Certification Roadmap §4 (open item), `CLAUDE.md` (existing practice, formalized here) |
| §8 Compliance Owner | Compliance & Certification Roadmap §4/§6 (open item) — resolved by direct user decision 2026-07-11 |

---

## 11. Open Questions

1. **CloudWatch alarm email notifications remain unconfigured** (§4) — the user's explicit choice for now, not an oversight; alarms are visible in the console regardless. Revisit before relying on this for real incident detection.
2. **§5's incident response plan has no tested RPO/RTO or breach-notification legal review behind it** — both are standing gaps repeated from Deployment Architecture §3.2 and Compliance & Certification Roadmap §3 respectively, not new to this document.
3. **§9's CC1 organizational gaps have no owner or timeline** — they're correctly out of this document's scope, but someone (likely the newly-named compliance owner, §8) needs to actually schedule closing them before a real Type I engagement starts.
4. **The vendor list (§6) has no scheduled re-review cadence** — unchanged from the AWS version's own open item.
5. **New, added v1.1: none of §4's CC4 monitoring design has been implemented for this fork** — Azure Monitor Alerts/Action Groups are named as the verified target mechanism, not shipped code. A materially bigger gap than the AWS version's own "alarms exist but email is unconfigured" state.
6. **New, added v1.1: this document's evidence citations throughout assume Azure infrastructure that doesn't exist yet** — every "Security Architecture §X" / "Multi-Tenant Architecture §Y" citation points at real design decisions, but the underlying code/infrastructure those sections describe is, per those documents' own honest disclosure, not yet implemented for this fork. A future Type I engagement against this track would need real, running Azure infrastructure first — this document maps controls to their intended evidence source, not to evidence that currently exists.

---

## 12. Review Log

Reviewed 2026-07-11. Every checkable claim re-verified directly against the actual source rather than trusted from memory; none needed correction.

- Both cited commit hashes (`11d6dba`, `993a554`) confirmed against `git log` to actually be the commits described.
- `CLAUDE.md`'s "Version Control Standards" and "Git Discipline" section names (§7) confirmed to exist verbatim via `grep`.
- Deployment Architecture §3.2's RPO/RTO section title confirmed to exist as cited.
- The "billing scoped out of MVP" claim (§6, ruling out a payment-processor subprocessor) confirmed directly against PRD §8's actual text, not assumed from memory.
- Threat Model §4.1/§4.2 section identity (telemetry validation vs. SSRF, respectively) confirmed against that document's actual headers — a citation-drift class of error found repeatedly in prior artifacts' reviews, checked specifically here and held up.
- The zero-CloudWatch-Alarms claim (§4) was verified before writing, not after — confirmed via `grep` across every stack prior to implementing the fix, per the commit message.

No corrections made — first artifact since Multi-Tenant Architecture where the draft held up completely on re-check.

---

## Revision History

**v1.1 (2026-07-17)** — the first amendment specific to the `PeakLogic-Azure` fork, forced by this document's own AWS-specific evidence-source citations going stale the moment this repo forked for an Azure track.

- **§3 corrected throughout**: CC4–CC9, A1, C1 all had at least one AWS-service-specific citation swapped for its real, already-researched Azure equivalent (PSRule for Azure, Entra External ID, Azure VNet, Azure Database for PostgreSQL, Azure Key Vault) — not a blanket find-and-replace, each swap traces to the specific Azure-track document that made the real decision.
- **§4 restated as a standing lesson, not a live AWS finding**: Azure Monitor Alerts + Action Groups named as the verified target mechanism for CC4, not yet implemented.
- **§6 corrected**: Microsoft Azure replaces AWS as the primary subprocessor; GitHub unchanged.
- **§11 gained 2 new items (5–6)**: explicit disclosure that this document's evidence citations point at real decisions, not yet real running infrastructure — a materially bigger gap than the AWS version had at the equivalent point in its own history.
- **Unchanged, confirmed cloud-agnostic**: §5 (incident response process/severity levels), §7 (change management — pure git/process discipline), §8 (compliance owner), §9 (CC1 organizational gaps) — SOC 2's actual control requirements don't change with the cloud vendor; only AWS-service-named evidence sources needed correction.
