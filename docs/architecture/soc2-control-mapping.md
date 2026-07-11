# SOC 2 Control Mapping & Evidence Plan

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Approved v1
**Depends on:** [Compliance & Certification Roadmap](compliance-certification-roadmap.md) (approved v1), [Security Architecture](security-architecture.md) (approved v1), [Multi-Tenant Architecture](multi-tenant-architecture.md) (approved v1), [Threat Model](threat-model.md) (approved v1)
**Last updated:** 2026-07-11

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
| **CC4** — Monitoring Activities | Ongoing evaluation of control effectiveness | **Real gap found and fixed 2026-07-11** — see §4 | `infra/lib/monitoring-stack.ts`, CloudWatch Alarms/console |
| **CC5** — Control Activities | Policies and procedures that enforce the above | `cdk-nag` (automated, every synth — Infrastructure as Code §2), `NagSuppressions` with written reasons (documented risk-acceptance, not silent), RLS policies (`docs/data-model.sql`) | Infrastructure as Code §2, `docs/data-model.sql` |
| **CC6** — Logical & Physical Access Controls | Authentication, authorization, network segmentation | The best-covered criterion in this entire project: Cognito + MFA required (Security Architecture §2.2), RBAC server-enforced (`requireRole()`), RLS tenant isolation (Multi-Tenant Architecture), VPC network segmentation (isolated RDS subnet), device X.509 mutual TLS (Device & Command Security Architecture §2). Physical access controls are AWS's responsibility under the shared-responsibility model — AWS's own SOC 2 report covers this, referenced not reproduced | Security Architecture, Multi-Tenant Architecture, Device & Command Security Architecture; AWS SOC 2 report (obtained during the real Type I engagement, not held today) |
| **CC7** — System Operations | Incident detection/response, vulnerability management, backup | Incident response — see §5 (new, this document). Vulnerability management — `cdk-nag` + `npm audit` (tracked findings, e.g. the esbuild/Vite CORS advisory in `CHANGELOG.md`). Backup — RDS automated backups (Deployment Architecture §3.2, RPO ≤5min/RTO ≤4hr targets stated, not yet drilled) | §5 (this doc), `CHANGELOG.md`, Deployment Architecture §3.2 |
| **CC8** — Change Management | Controlled, documented change process | `CLAUDE.md`'s Release Process and Git Discipline sections — SemVer, Conventional Commits, Keep a Changelog, mandatory commit-and-push discipline. Formalized as evidence in §7 | `CLAUDE.md` → "Version Control Standards", "Git Discipline"; git history itself |
| **CC9** — Risk Mitigation | Vendor/subprocessor risk, business continuity | Vendor management — see §6 (new, this document). Business continuity — Deployment Architecture's rollback procedure and multi-stage environment separation | §6 (this doc), Deployment Architecture §4.2, §2 |
| **A1** — Availability | Capacity planning, backup, disaster recovery | Deployment Architecture: stage-conditional Multi-AZ for prod (§3.1), RPO/RTO targets (§3.2), rollback procedure (§4.2 — written but not yet drilled against a real deploy, a standing caveat repeated across many artifacts) | Deployment Architecture §2–§4 |
| **C1** — Confidentiality | Protecting confidential/tenant data specifically | RLS (Multi-Tenant Architecture — including the real telemetry-RLS bug found and fixed), encryption at rest/in transit (Security Architecture §4), Secrets Manager + rotation (Infrastructure as Code §2.3), SSRF guard preventing internal data exposure via webhooks (Threat Model §4.2) | Multi-Tenant Architecture, Security Architecture §4, Infrastructure as Code §2.3, Threat Model §4.2 |

---

## 4. CC4 Real Gap: No Active Monitoring Existed — Fixed

Checked directly (grepped every CDK stack for `Alarm`): **zero CloudWatch Alarms existed anywhere in this codebase**, despite extensive logging already built (Lambda logs, API Gateway access logs, VPC Flow Logs — Security Architecture §6, Infrastructure as Code §2.1). Every one of those log sources was something a human *could* look at after the fact; nothing actively watched any of them or notified anyone. That's precisely what CC4 asks about, and it was a real, unaddressed gap, not a documentation nit.

**Fixed:** `infra/lib/monitoring-stack.ts` (commit `993a554`) — 5 CloudWatch Alarms per stage (API Lambda errors, ingest Lambda errors, API Gateway 5xx, RDS CPU, RDS free storage), one SNS topic per stage. Email notification is optional CDK context (`-c alarmEmail=...`), deliberately not hardcoded — this document doesn't have authority to pick a real address. **Currently unconfigured, by the user's own choice (2026-07-11)** — alarms fire and are visible in the CloudWatch console regardless, but nobody is actively notified yet. Tracked as an explicit open item (§10), not silently assumed configured.

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
| **AWS** | Primary cloud infrastructure (Lambda, RDS, Cognito, IoT Core, S3/CloudFront, Secrets Manager) | AWS's own SOC 2 Type II report (obtainable during a real Type I engagement) — the entire shared-responsibility model this project's architecture already assumes |
| **GitHub** | Source control, CI/CD (new subprocessor role since CI/CD Pipeline, #17) | GitHub's own SOC 2 report; access already scoped via OIDC federation, no long-lived credentials (CI/CD Pipeline §4) |

**No other subprocessors identified** — no billing/payment processor (PRD explicitly scopes billing out of MVP), no email/SMS provider beyond Cognito's own (AWS-internal), no third-party analytics or logging SaaS. **This list should be re-checked, not assumed static, the next time a new external dependency is added** — the review basis is "what does this project actually depend on," not a one-time snapshot.

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
4. **The vendor list (§6) has no scheduled re-review cadence** — "re-check when something changes" is weaker evidence for an auditor than a dated periodic review; consider an explicit cadence (e.g., quarterly) once this is closer to a real engagement.

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
