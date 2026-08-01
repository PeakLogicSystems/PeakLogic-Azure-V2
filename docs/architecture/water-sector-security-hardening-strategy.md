# Water-Sector Security Hardening Strategy

**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Company:** PeakLogic
**Project codename:** Project Vantage
**Status:** Draft v0.1 — new artifact, triggered by an external incident, not a scheduled sequence item
**Depends on:** [Security Architecture](security-architecture.md), [Device & Command Security Architecture](device-command-security-architecture.md), [Threat Model](threat-model.md), [Technical Debt Register](technical-debt-register.md), [CI/CD Pipeline](cicd-pipeline.md), [Enterprise Audit 2026-07-19](enterprise-audit-2026-07-19.md)
**Last updated:** 2026-08-01

---

## 1. Introduction

### 1.1 Trigger

Starting the night of 2026-07-26/27, a coordinated cyberattack hit 30+ municipal water systems in Minnesota; by 2026-07-31, water/wastewater utilities in at least 7 US states had reported incidents to the FBI. CISA and the FBI issued a joint advisory (2026-07-30) describing "a significant increase in threat actors targeting programmable logic controllers (PLCs) in the Water and Wastewater Sector." U.S. officials are investigating a possible link to an Iran-affiliated group; no agency had officially attributed the attack as of the latest reporting. See §2 for full sourcing.

This document exists because the incident is directly relevant to PeakLogic on three independent grounds: (1) PeakLogic already targets the water/wastewater vertical (`wastewater` alert category, a modeled water reclamation facility site in the unified-platform demo — see [[project_peaklogic_next_steps]]); (2) the attack's TTPs are a real, concrete test case against PeakLogic's own device/command architecture, most of which is still design-only; (3) the timing is a genuine go-to-market opportunity the user identified — buyers in this exact sector are, right now, unusually attentive to exactly the architectural properties PeakLogic already claims to have.

### 1.2 Purpose

Three things, not one, which is why this doc has three distinct kinds of content instead of being a normal architecture artifact:
1. **A grounded vulnerability assessment** — map the actual attack TTPs onto PeakLogic's actual current code and design (not assumption), producing an honest built/design-only/gap inventory (§4).
2. **A prioritized hardening roadmap** (§5) — Tier 0 (do now), Tier 1 (hard gates before actuation ships), Tier 2 (turn existing architecture into an intelligence/detection advantage).
3. **A market-positioning read** (§6) — is "secure by design" a legitimate claim right now, and how to use it without overclaiming.

### 1.3 Scope & Methodology

Not a formal STRIDE pass (Threat Model already owns that) — this document is TTP-driven: take the specific, real techniques used in this specific incident and ask "does this apply to us, and if the analogous surface exists, is it hardened." Findings below are tagged exactly as researched: ✅ verified directly against current code, 📄 verified against current docs, 🔴 open gap.

**Audit method, disclosed:** an Explore-agent pass read every named file in full; where its findings conflicted with older project memory (audit logging call-site count), the discrepancy was resolved by direct `grep` against the real file before being written into this document (§4.3 item 1) — a concrete instance of this project's own "verify, don't trust a prior summary" discipline.

---

## 2. Incident Summary (sourced)

| Fact | Detail | Source |
|---|---|---|
| Timeline | Attacks began night of 2026-07-26 into 2026-07-27 across 30+ Minnesota utilities; utilities in ≥7 states total had reported incidents to the FBI by 2026-07-31 | [CISA](https://www.cisa.gov/news-events/alerts/2026/07/30/cisa-urges-water-and-wastewater-systems-sector-protect-ot-against-activity-targeting-plcs), [FBI](https://www.fbi.gov/investigate/cyber/alerts/2026/malicious-cyber-actors-targeting-water-and-wastewater-sector-internet--facing-programmable-logic-controllers-causing-operational-disruptions) |
| Target hardware | Internet-facing Rockwell Automation/Allen-Bradley PLCs, specifically MicroLogix 1100/1400 series; also HMIs | [SecurityWeek](https://www.securityweek.com/cisa-urges-water-sector-to-protect-ot-after-coordinated-attacks-on-plcs/), [Dark Reading](https://www.darkreading.com/ics-ot-security/minnesota-water-utility-attacks-expose-sector-cyber-risks) |
| Exploited weakness | CVE-2021-22681 (critical, effectively unpatchable authentication bypass in Rockwell Logix controllers, disclosed 2021 — four-plus years old at time of exploitation) plus, per CISA's own historical-pattern note, controllers left on default/never-changed passwords (mirrors the 2023 IRGC-affiliated playbook against water utilities) | [Tech Times](https://www.techtimes.com/articles/322059/20260729/iranian-hackers-exploited-unpatchable-plc-flaw-breach-30-minnesota-water-systems.htm), [CBS News](https://www.cbsnews.com/news/us-investigating-iran-cyberattack-minnesota-water-systems/) |
| Technique | Attackers connected to internet-facing PLCs from foreign-hosted infrastructure using the **same legitimate vendor engineering software** real operators use — not custom malware aimed at a novel vulnerability class, but ordinary tooling aimed at an exposed port | [The Hacker News](https://thehackernews.com/2026/07/coordinated-cyberattack-targets-30.html) |
| Actions on objective | Changed device IP addresses and passwords to lock operators out of monitoring/control; in some cases exfiltrated PLC project files | [Cybersecurity Dive](https://www.cybersecuritydive.com/news/us-authorities-escalation-attacks-water-system-devices/826715/) |
| Impact | Boil-water notices, forced sustained manual operation, one plant taken offline, reported pressure drops; no confirmed water contamination | [CNN](https://www.cnn.com/2026/07/31/politics/sweeping-cyberattack-us-water-systems), [MPR News](https://www.mprnews.org/story/2026/07/28/30-minnesota-municipal-water-systems-targeted-cyberattack) |
| Attribution | Suspected Iran-affiliated (CyberAv3ngers/IRGC Cyber-Electronic Command lineage cited by researchers); not officially confirmed by any US agency as of the latest reporting reviewed | [Tenable](https://www.tenable.com/blog/coordinated-cyberattack-on-minnesota-water-utilities-what-you-need-to-know) |
| Official guidance | CISA/FBI: remove PLCs and other OT from direct internet exposure; if remote access is operationally required, place it behind a VPN or gateway device, not a bare exposed port | [CISA](https://www.cisa.gov/news-events/alerts/2026/07/30/cisa-urges-water-and-wastewater-systems-sector-protect-ot-against-activity-targeting-plcs) |
| Regulatory shift | CIRCIA now makes water-sector cyber-incident reporting **mandatory** in 2026 (72-hour significant-incident reporting, 24-hour ransom-payment reporting) — a compliance driver, not just a security one | [Tenable](https://www.tenable.com/blog/water-utilities-cybersecurity-regulatory-compliance) |

---

## 3. TTP-to-Architecture Mapping

| Attacker TTP in this incident | PeakLogic analog | Verdict |
|---|---|---|
| PLC engineering interface reachable directly from the internet | PeakLogic Hubs and devices connect **outbound-only** (MQTT/TLS) on both the shipped AWS path and the designed Azure path — no inbound port, VPN hole, or engineering interface is ever exposed on a customer network | ✅ **Structurally not applicable** — the specific exposure class doesn't exist in this architecture |
| Default/never-rotated device passwords | Device and Hub identity is per-unit X.509 mutual TLS — shipped (AWS: `scripts/provision-devices.ts`, `infra/lib/iot-stack.ts`'s scoped `PeakLogicDevicePolicy`) and designed-but-unbuilt (Azure: `device-command-security-architecture.md` §2, `hub-enrollment-and-identity-design.md`). There is no password-based device credential to leave at a default anywhere in the design | ✅ **Structurally not applicable** |
| Attacker uses the *same legitimate engineering tooling* real operators use, from remote infrastructure | PeakLogic has no remote command/actuation channel at all — CLAUDE.md's "Future: Command & Control Architecture" section still reads *"Actuation... is on the roadmap but not built."* There is no device-facing "engineering tool" equivalent to abuse today | ✅ **Not built, therefore not exposed** — see §5 Tier 1 for what must be true before this changes |
| Attacker locks the legitimate operator out (IP/password change) | Direct analog: PeakLogic has **no session/credential revocation tooling** (TD-4) and device/Hub decommissioning **only flips a DB status flag** — never revokes the underlying cloud identity. A compromised admin session or a "decommissioned" device certificate both stay live exactly the way a legitimate operator locked out of a hijacked PLC stays locked out — just the failure is inverted (attacker keeps access, not that PeakLogic can't regain it) | 🔴 **Real gap** — §5 Tier 0 items 2, 5 |
| Attacker exfiltrates PLC project files (control-logic recon) | No direct equivalent exists today (no control logic to steal), but the closest analog — tenant configuration, rule thresholds, the PeakAssist/desired-state bundle — is protected by RLS that is "not provably complete" per three independent audit passes (TD-8) | 🔴 **Adjacent, partially mitigated, not provably complete** |
| Loss of monitoring/control caused the operational disruption (boil-water notices, manual fallback) | PeakLogic's closest equivalent failure is **silent loss of telemetry monitoring** — and there is currently **no alert for ingest rate dropping to zero or Function error-rate spiking** (`monitoring.bicep`'s own disclosed gap). Device-silence detection catches one dead sensor; it was never built to catch a correlated, platform-wide disruption event | 🔴 **Real gap** — §5 Tier 0 item 3 |
| A five-year-old CVE (2021) remained exploitable in the field in 2026 | The direct lesson: unpatched *known* vulnerabilities in dependencies survive for years if nothing is watching for them. PeakLogic's CI (`ci.yml`, wired 2026-08-01) has no dependency/SCA scanning step today | 🔴 **Real gap** — §5 Tier 0 item 4 |
| (Novel to PeakLogic, no direct incident analog) A compromised cloud identity reaching the platform's own fleet-management control plane | PeakLogic has already built a desired-state reconciler and PeakAssist bundle-sync mechanism for OTA/fleet management (Platform Control Center). This is architecturally the same *leverage point* the Minnesota attackers got via the PLC engineering port — control over what every fielded unit does — just reached through Entra/Azure credentials instead of a PLC login. No MFA, Conditional Access, or session revocation exists yet on the Azure track to defend it (Entra work is 0% implemented for this fork) | 🔴 **New surface this incident surfaces by analogy, not previously named in this framing** — see §5 Tier 0 item 2, Tier 2 item 1 |

---

## 4. Current-State Inventory (verified against real files, not memory)

### 4.1 Already built / mitigated

- **Outbound-only device/Hub networking** on both cloud tracks — no inbound exposure of any kind (shipped AWS, designed Azure).
- **Per-device X.509 mutual TLS** — shipped on AWS (`provision-devices.ts`, `.NET` hub client does real mTLS), designed for Azure DPS/IoT Hub (unbuilt, see §4.2).
- **No actuation/command channel exists** — CC-3.1/CC-4.1 enforced as a hard MVP gate; verified via grep, no `device_commands` table, no publish-side code anywhere.
- **SSRF fixed** (`backend/shared/webhook.ts`, commit `11d6dba`) — HTTPS-only, rejects private/loopback/link-local ranges.
- **Telemetry sanitization wired in** — `sanitizeMetrics()` drops non-finite values before SQL/rule evaluation; poison messages durably logged (`poison-messages.ts`); duplicate delivery handled via unique-index + `ON CONFLICT DO NOTHING`.
- **RLS-based multi-tenant isolation is real and load-bearing** — `FORCE ROW LEVEL SECURITY`, `withTenant()`/`withChannelPartner()`/`withStaffActingOnTenant()` transaction-scoped session variables, suspended-tenant checks.
- **Auth fails closed** — 401/403 on missing/invalid claims, no silent default role; a prior fail-open bug was found and fixed, not left in the register.
- **Least-privilege IoT Hub service policy** (`iot.bicep`) — `ingestConnect` scoped to `ServiceConnect` only, not the all-powerful default `iothubowner`.
- **Basic OT-relevant safety thresholds are real and enforced today** (`rules.ts`'s `RULES_BY_CATEGORY`) — pressure, pool chemistry, gas/leak, refrigeration, energy — independent of the AI layer.
- **Basic statistical anomaly detection is shipped** (`baseline.ts` EWMA + `anomaly.ts` z-score, `AI_ANALYTICS_ENABLED`-gated, capped at `warning`).
- **Device-silence detection is shipped** — catches one device going dark; not designed for correlated/fleet-wide disruption (see §4.3 item 3).
- **Audit-log infrastructure exists and is correct where used** (`backend/shared/audit.ts`'s `writeAuditLog()` — prior/new value diffing, tenant *and* channel-partner scope, actor-vs-staff-actor distinction) — ✅ **verified 2026-08-01 via direct grep, correcting an initial agent misreport of "zero call sites"**: it is called from exactly 4 sites, all in `admin-tenant-actions.ts`. A fresh count of every exported mutating handler across `backend/api/routes/` found **~35 mutating handlers total, 4 audited (~11%)** — materially unchanged since the Enterprise Audit's 2026-07-19 "~10% of mutations" finding.

### 4.2 Design-only / not built

- **The entire Azure device/Hub identity and provisioning mechanism** — DPS enrollment, IoT Hub device identities, certificate generation/rotation, decommission-revocation. Only the AWS-native path is real, shipped code, and `infra/` is no longer the active deploy target.
- **Everything actuation-related** — 100% design (`device-command-security-architecture.md` §4); explicit pre-conditions named before this can be scheduled: audit logging must exist for real (it doesn't, at scale — see §4.3), and the Tenant-Admin/Ops-Leader role-overlap question must be consciously resolved (it isn't).
- **MFA/Conditional Access mechanism for Azure** — requirement decided, concrete mechanism unresolved, zero Entra tenant/app-registration/auth code exists for this fork.
- **Session/credential revocation** — Graph API's `revokeSignInSessions` is the verified mechanism; nothing calls it.
- **Certificate rotation ownership** — an orphaned item between two documents (TD-9).

### 4.3 Open / known gaps (in what exists or is about to)

1. **Audit logging covers ~11% of mutating routes** (updated count, §4.1) — the single most cross-referenced missing prerequisite in the whole document set (blocks credible incident reconstruction, blocks CIRCIA's 72-hour reporting mandate, blocks actuation).
2. **No session/credential revocation** (TD-4) and **decommission doesn't revoke cloud identity** — the direct analog of "attacker locks the operator out," just inverted.
3. **No ingest-rate-zero / Function-error-rate alerting** — a coordinated disruption could go undetected until a customer notices.
4. **No dependency/SCA scanning in CI** — the direct lesson of a 5-year-old CVE surviving in production.
5. **APIM rate limiting has a disclosed bypass** — no static outbound IP on Consumption tier means the Function App's raw hostname skips the limiter entirely.
6. **DNS rebinding on the SSRF fix not fully closed** (TD-2) — check-time, not connection-time validation.
7. **RLS coverage "not provably complete"** (TD-8) — three independent audit passes each found something the last missed.
8. **No non-owning DB role** (TD-7) — `FORCE ROW LEVEL SECURITY` is the only backstop against a compromised app credential with schema privileges.
9. **Tenant-Admin/Ops-Leader role granularity too coarse** — named pre-actuation blocker, currently silently unresolved.
10. **No WAF / no Front Door edge protection** — a reasoned, revisitable decision (Threat Model §6), not an oversight, but a real gap vs. typical OT/ICS perimeter hardening expectations.
11. **Zero real-world validation of the entire Azure security posture** — nearly every Azure-side control in this document is "verified against Microsoft's documentation," never against a live subscription. This is the largest single caveat on everything else in this document.

---

## 5. Hardening Roadmap

Status column is a live tracker — update in place as items ship, per this project's own convention (mirrors Technical Debt Register / MVP Roadmap status tracking), rather than leaving this document static after today.

### Tier 0 — cheap, closes the exact gap class this incident exploited, start immediately

| # | Item | Why this tier | Status |
|---|---|---|---|
| 0.1 | Extend `writeAuditLog()` coverage from ~11% to all mutating routes | Foundational for incident reconstruction, CIRCIA compliance, and the actuation pre-condition named in `device-command-security-architecture.md` §5 | 🟢 Done, 2026-08-01 (commit `e6fdb69`) — ~35 of ~37 mutating handlers now audited (settings.ts's self-service preference update and admin-staff.ts's staff creation deliberately not, see doc body); surfaced and fixed two wrong "RLS already revokes this" comments (TD-45) and a nested-transaction bug (TD-46) along the way |
| 0.2 | Session/credential revocation (Graph `revokeSignInSessions`) admin capability | Direct mirror of "attacker locks the operator out" — PeakLogic needs the equivalent ability to lock a compromised actor out instantly | 🟢 Done, 2026-08-01 — `shared/identity.ts`'s `revokeUserSessions()`, wired at `POST /v1/settings/team/{userId}/revoke-sessions` as a tenant admin's own immediate self-service action (not staff-only — a real incident needs this available without a support ticket). TD-45 found while scoping this: force-logout only stops *new* token issuance, doesn't retroactively invalidate an already-issued access token (this backend validates JWTs offline, no Continuous Access Evaluation) — real defense-in-depth, honestly not a complete fix on its own |
| 0.3 | Real device/Hub identity revocation on decommission (not just a DB flag) | Closes the "credential outlives intended access" gap the incident exploited in reverse | 🟢 Done, 2026-08-01 (commit `e6fdb69`) — `iot.bicep`'s new `registryReadWrite` policy + `backend/shared/device-identity.ts`'s `disableDeviceIdentity()`, wired into `devices.ts`'s decommission handler. Honestly a no-op until DPS enrollment (unbuilt) creates real device identities to revoke |
| 0.4 | Ingest-rate-zero / Function-error-rate alerting | So a coordinated disruption is detected in minutes, not discovered by a customer's boil-water notice | 🟢 Done, 2026-08-01 — new `ingest-alerts.bicep` module (deployed separately from `monitoring.bicep` to avoid a circular module dependency), wired into `main.bicep`. `Http5xx` (Function App) and `d2c.telemetry.ingress.success` (IoT Hub, verified via Microsoft Learn) metric names — both thresholds are disclosed placeholders, no real fleet exists yet to tune against. Not validated against a real subscription — no Azure CLI available anywhere in this environment |
| 0.5 | Close the APIM rate-limit bypass (shared-secret header) | Already scoped and documented as a gap; cheap to close now | 🟢 Done, 2026-08-01 — `apim.bicep`'s policy injects `X-PeakLogic-Apim-Secret`; `backend/shared/apim-guard.ts` + `api/handler.ts` validate it before auth/routing. Deliberately enforce-only-if-configured (`apimSharedSecret` defaults empty end-to-end) — this is defense-in-depth on top of mandatory Entra JWT auth, not a sole gate, so an unconfigured stage isn't broken by this shipping |
| 0.6 | Dependency/SCA scanning in `ci.yml` | Direct lesson of CVE-2021-22681 surviving 5 years unpatched — closes the equivalent risk class in PeakLogic's own dependency tree | 🟢 Done, 2026-08-01 — `npm audit --omit=dev --audit-level=high` across backend/frontend/scripts. Immediately found two real, previously-undisclosed findings: TD-44 (azure-iothub → uuid, moderate, added by Tier 0.3's own new dependency) and TD-47 (scripts' node-pg-migrate → glob, high, upstream-unfixable today) — the `scripts-dependency-audit` CI job is expected to stay red until upstream ships a fix, disclosed rather than hidden by loosening the threshold further |

### Tier 1 — hard gates before actuation is ever built (already named in this project's own docs; restated here for visibility, not newly invented)

- Resolve the Tenant-Admin vs. Ops-Leader role-overlap question (device-command-security-architecture.md §7 item 5).
- Assign real ownership of device/Hub certificate rotation policy (TD-9).
- Full command-channel audit trail + verified local fail-safe behavior, once audit logging (Tier 0.1) is actually complete.

### Tier 2 — turn existing architecture into a detection/intelligence advantage

1. **Repurpose the desired-state reconciler as a tamper-detection signal.** `PeakLogicEdge.Core.Reconciliation.DesiredStateReconciler` already categorizes device drift as InSync/Behind/Ahead/Missing/**Unexpected**. Wire an alert when "Unexpected" drift has no corresponding cloud-issued change — a real intrusion/tamper signal built almost entirely on infrastructure that already exists for OTA fleet management, at near-zero incremental cost.
2. **Extend the anomaly layer beyond single-metric z-score to fleet/connection-behavior anomalies** — unusual DPS re-enrollment spikes, repeated cert-handshake failures, a device reconnecting with an unexpected fingerprint — same `AI_ANALYTICS_ENABLED` framework, a new signal class.
3. **Wire PSRule for Azure into `ci.yml`** — already flagged as a gap from the CI/CD wiring work; an automated infra security-policy gate, not just compile validation.
4. **Turn the audit trail + incident-response plan into exportable, always-current compliance evidence** — satisfies CIRCIA's new mandatory-reporting posture and doubles as enterprise-sales collateral.

---

## 6. Market & Positioning Implications

**The opportunity is real.** PeakLogic already has an active wastewater vertical (demo-modeled Riverside Water Reclamation Facility, real `wastewater` alert category) at the exact moment buyers in this sector are unusually attentive to exactly the properties PeakLogic's architecture already has: no exposed engineering interface, no inbound network requirement, certificate-based device identity instead of passwords, no remote-actuation surface to abuse. This is a true, differentiated, and currently newsworthy contrast to what just failed nationally.

**The caution is equally real, and specific:** almost none of the Azure-side security posture described as "designed" in this document has ever run against a real subscription (§4.3 item 11). Making a public security claim this bold, in a market this alert to ICS security right now, is exactly the kind of claim that gets tested — by a prospect's security questionnaire, by a real incident, or by a competitor's due diligence. **Recommended sequencing: close Tier 0 for real first, then go loud.** The "architecture-first, disclosed gaps, nothing claimed until verified" discipline this project already practices internally is itself part of the pitch — it's a genuinely credible enterprise-security narrative on its own, not just marketing copy layered on top.

Concrete follow-on work (not started here, flagged for a deliberate go/no-go with the user before building): a security-first technical one-pager contrasting PeakLogic's outbound-only/cert-based model against this incident's PLC-exposure pattern; accelerating the SOC 2 Type I timeline given CIRCIA's new mandatory-reporting posture; and a direct conversation with existing pool/QSR channel partners about the wastewater angle, given a real modeled site already exists in the demo.

---

## 7. Traceability

| Section | Traces to |
|---|---|
| §3 TTP mapping | Device & Command Security Architecture §2/§4, Threat Model §2–4, CLAUDE.md "Future: Command & Control Architecture" |
| §4.1/§4.2/§4.3 | Security Architecture, Technical Debt Register (TD-2, TD-4, TD-7, TD-8, TD-9, TD-14), Enterprise Audit 2026-07-19 §2 finding 2.1 |
| §5 Tier 0 | Directly executed as real code/infra changes starting 2026-08-01 — see each item's own commit once shipped |
| §5 Tier 1 | Device & Command Security Architecture §5/§7 item 5 (pre-existing gates, not newly invented here) |
| §6 | [[project_peaklogic_next_steps]] (wastewater vertical, demo site), SOC 2 Control Mapping |

---

## 8. Open Questions

1. Should this document's Tier 0 tracker be the permanent home for these items, or should each one graduate into the Technical Debt Register / relevant architecture doc once shipped, leaving this document as a point-in-time incident response record? **Not decided** — leaning toward the latter (mirrors how Enterprise Audit's findings were later absorbed into TD register entries) but not acted on yet.
2. Should `docs/architecture/README.md`'s artifact table be brought back into sync generally (it has fallen behind several recent artifacts, not just this one)? Out of scope for this document — flagged, not fixed.
3. Timing and ownership of the market-positioning follow-on work (§6) — genuinely the user's call, not pre-decided here.

---

## 9. Review Log

**v0.1 (2026-08-01), initial version.** Triggered by the 2026-07-26/27 water-sector cyberattacks. Real-world incident facts sourced from 8 independent outlets/agencies (§2). Codebase findings verified by a dedicated Explore-agent pass against actual files, with one agent-reported finding (audit-log call-site count) caught as wrong and corrected via direct `grep` before being written here — the count is 4 call sites / ~11% coverage, not zero. Tier 0 items 0.1–0.6 started same day.
