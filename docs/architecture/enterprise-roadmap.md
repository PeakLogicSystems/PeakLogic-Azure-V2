# Enterprise Roadmap

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v1.1 (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1.0 — AWS-native — until v1.1 is approved)
**Depends on:** Every Azure-track artifact amended/rewritten as of this fork's 2026-07-17 restructuring pass — this document is still a synthesis, not new analysis
**Last updated:** 2026-07-17
**Fork note (v1.1):** the first amendment specific to the `PeakLogic-Azure` fork — `azure-restructuring-plan.md` item 23 flagged this 🔵 amendment: "mostly carries over; revisit sequencing once merger terms are clearer." Almost every initiative here is a product/business-strategy decision, unaffected by which cloud hosts the platform — only the AWS-specific infrastructure references (§3.3, §6) needed real correction. See Revision History.

---

## 1. Introduction

### 1.1 Purpose

Every prior artifact deliberately kept a list of things it decided **not** to build, and pointed at this document as where that list would eventually get sequenced — MVP Roadmap (#22) did the same synthesis job for MVP-scoped gaps; this document does it for everything beyond MVP. It exists so scope isn't accidentally designed out of reach now (PRD §1's own stated reason for naming Enterprise Roadmap items at all) and so a future push into any of these areas starts from a reviewed, cited plan instead of relitigating decisions this project has already made carefully, more than once in several cases (WAF alone was deferred three separate times, each with its own explicit trigger condition).

### 1.2 Scope

**In scope:** every initiative explicitly named across Vision, PRD, SRS, Device & Command Security Architecture, Compliance & Certification Roadmap, Deployment Architecture, Multi-Tenant Architecture, Security Architecture, Threat Model, Infrastructure as Code, Domain Model, User Personas, User Stories, and MVP Roadmap as "Enterprise Roadmap," "post-MVP," or a MoSCoW "Won't (MVP)" item — sequenced by real dependency and named trigger condition, not a calendar date (the same discipline MVP Roadmap §7 item 3 already established: "not a target date, tied to when engineering capacity is available").

**Out of scope:** smaller, already-disclosed implementation gaps and hardening shortcuts in *already-shipped* MVP code (WAF, the residual DNS-rebinding SSRF gap, per-role MFA granularity, session-revocation tooling, CloudWatch log retention length, the `IngestFn` DLQ gap, decommission not revoking IoT certs, SOC 2 CC1 organizational-control gaps, casing/pagination reconciliation, non-atomic Cognito/DB writes, stale `types.ts`, per-tenant resource quotas). These are real, but they're bugs and shortcuts to fix in something that already exists, not new capability to build — §6 explains the split in more detail and hands them to the Technical Debt Register (#24, the next artifact after this one) rather than duplicating them here.

The channel-partner-portal feature (territory drawing, technician dispatch, white-label branding) is **not** in this document — it was moved *into* MVP scope by the PRD/SRS v1.5 amendment (2026-07-11) and is tracked as implementation-pending work in MVP Roadmap §5 item 4, not deferred work here. Only the narrower carve-out PRD kept excluding even after that amendment — CH-3a (full partner tenant management, automated billing, an in-house AI-routing engine) — belongs in this document (§3.8).

---

## 2. The North Star This Roadmap Serves

Vision Document §11 names five concrete 3–5 year markers. Every initiative below maps to at least one of them, which is the actual organizing principle of this document — not artifact-number order, not alphabetical, but "what does landing this actually move":

1. Remote actuation live in production, fail-safe-locally proven — §3.1.
2. SOC 2 Type II attested, cited by enterprise buyers as a real purchase factor — §3.2.
3. An enterprise deployment live with zero special firewall/VLAN exceptions granted — already true of MVP's outbound-only device model; this roadmap's job is proving it at enterprise scale (multi-account isolation, §3.3) and enterprise contract terms (SLA tier, §3.12).
4. Active electrical load conditioning, partnership-first — §3.7.
5. A self-service third-party device marketplace — §3.4.

Two more initiatives below aren't named in Vision §11 directly but are load-bearing for the same "enterprise-sellable" goal `CLAUDE.md` states as this whole project's purpose: formal compliance breadth beyond SOC 2 (ISO 27001, HIPAA — folded into §3.2), and the next confirmed vertical (industrial pumping stations, §3.9) that Vision §6/PRD §8 already name as coming after MVP.

---

## 3. Initiatives

Each initiative states what it is, why it's deferred rather than built now, the concrete condition that should trigger picking it up (not a date), and what it depends on.

### 3.1 Remote Actuation & Command Channel

**What:** Publishing shutoff/control commands (starting with leak and gas valve shutoff) down the already-scoped, currently-unused `commands` MQTT topic on each device's IoT policy. Device & Command Security Architecture (#12) already did the hard design work: command authorization (§4.1), the fail-safe-locally principle (§4.2 — a device must trip off its own sensor reading immediately, never wait on a cloud round trip for safety-critical cases), a custom `command-acks` topic pattern (§4.3), and a `device_commands` audit table sketch (§4.4). Building this is implementing a reviewed design, not designing from scratch.

**Why deferred:** MVP is detection and alerting, not actuation (Vision §5, CC-3.1/CC-4.1). Actuation is also meaningfully more consequential to get wrong than anything shipped so far — a false-positive alert is an annoyance, a false-positive shutoff is an operational incident at the customer's site.

**Trigger to revisit:** Device & Command Security Architecture §5 sets a **hard pre-implementation gate, not a suggestion** — command issuance may not be built until both:
- (a) Someone explicitly decides whether Corporate/Regional Ops Leader should retain single-site actuation authority, since API Specification §7 item 5 found both Tenant Admin and Ops Leader currently share the same `admin` Cognito group — unresolved, tracked in `project-peaklogic-pending-decisions` item 3.
- (b) AUD-1 audit logging is wired into command issuance specifically. **Partially true as of 2026-07-11**: `writeAuditLog()` exists (`backend/shared/audit.ts`, shipped with Security Architecture v1.1) but has zero call sites anywhere in `backend/` — the function existing is not the same as it being wired in. Gate (b) is closer than it was, but not met.

**Depends on:** Both gate conditions above; a decommissioned-device cert-revocation fix (Device & Command Security Architecture §3.2 — tracked in Technical Debt Register, §6) becomes materially more important once a live command topic exists to receive on.

### 3.2 Formal Compliance Certification (SOC 2 Type II, ISO 27001, HIPAA)

**What:** Completing an actual SOC 2 Type I engagement, then a Type II observation window (Compliance & Certification Roadmap §2.2: Type I ~4–12 weeks/$5–25K; Type II ~9–14 months end-to-end/$30–50K+ first year). Separately, a real legal review of nursing-home data flows to resolve HIPAA/BAA applicability (Compliance & Certification Roadmap §3.3 — "do not sign a BAA or make a HIPAA-compliance claim" until this happens), and — contingent on that review's outcome — possibly adding the Privacy Trust Services Criterion to SOC 2 scope. ISO 27001 is named in PRD §4 alongside SOC 2 but has no dedicated readiness assessment anywhere yet; treat it as a later, second certification once SOC 2 Type II is attested, not a parallel effort.

**Why deferred:** SOC 2 Control Mapping (#20, Draft v1.1 for this fork) already built the control mapping and evidence sources with real, verified Azure citations — this is architectural readiness, deliberately distinct from actual attestation, which requires a real audit engagement against a real running system. No Azure deploy exists yet for this fork (MVP Roadmap Blocker #1, restated for Azure), so no engagement can meaningfully start — same standing gate as the AWS version, different cloud.

**Trigger to revisit:** Compliance & Certification Roadmap §6 recommends starting the Type II observation window "targeting completion before the industrial-pumping-station vertical (§3.9) or true enterprise deals is actively being sold" — i.e., the trigger is a real next-vertical or enterprise sales motion becoming active, not a fixed date. **Prerequisite, not yet closed**: SOC 2 Control Mapping §9/§11 flags CC1 organizational-control gaps (a formal code of conduct, background-check policy, documented org chart) with no owner or timeline yet — someone (the user, already named compliance owner per §8) needs to schedule these before a real Type I engagement, independent of when the engagement itself starts.

**Depends on:** A real AWS deploy (MVP Roadmap Blocker #1) — an auditor needs a real running system to assess, not architecture docs alone.

### 3.3 Multi-Subscription Azure / Enterprise Infrastructure Isolation *(corrected v1.1 — previously "Multi-Account AWS")*

**What:** Splitting `dev`/`staging`/`prod` (currently one Azure subscription, resource-group-per-stage — Deployment Architecture §2.1) into genuinely separate Azure subscriptions — full blast-radius isolation, **Microsoft's own recommended best practice** (verified, Deployment Architecture §2.1 — a stronger, more explicit recommendation than AWS ever made for multi-account separation).

**Why deferred:** Resource-group-per-stage is deliberately the cost-conscious MVP posture — a disclosed, deliberate deviation from Microsoft's own recommended default (Deployment Architecture §2.1), mirroring the same proportionality judgment the AWS version already made for its own account-separation question.

**Trigger to revisit, corrected v1.1:** Deployment Architecture §2.1 states this explicitly — the same "SOC 2 Type II or enterprise customer" trigger as the AWS version. **The AWS version's sharper, sooner trigger (the shared MQTT topic namespace forcing single-stage-at-a-time) no longer applies at all** — Device & Command Security Architecture §2's verified finding is that Azure IoT Hub's per-stage resource isolation structurally closes that risk by construction, not by an operational rule. This means Azure's version of this initiative has **one fewer forcing trigger than the AWS version had** — a real, disclosed reduction in urgency, not an oversight.

**Depends on:** §3.2's SOC 2 Type II trigger and this initiative's own trigger are the same real-world event — unchanged reasoning.

### 3.4 Self-Service Third-Party Device Adapter Marketplace

**What:** A true runtime plugin model where third parties register a new device adapter without PeakLogic engineering deploying code — distinct from today's MVP model, where every adapter (`RULES_BY_CATEGORY` in `backend/ingest/rules.ts`) is added by PeakLogic engineering through a code change (PRD DA-3, SRS DA-3.1).

**Why deferred:** The adapter-contract abstraction (Vision §10's "extensibility... built on two layers, deliberately kept distinct") is already real and adapters are already cheap to add internally — a runtime registration/marketplace UX is a materially larger, separate product surface (review, versioning, third-party trust) not justified until internal adapter velocity is itself a bottleneck.

**Trigger to revisit:** Not stated as a specific external trigger in any prior doc — this is the one initiative in this roadmap without a named condition, flagged honestly in §7 rather than inventing one.

**Depends on:** A real architectural prerequisite is already identified and waiting: Domain Model §6.2/§4 item 2/§8 item 2 all flag that `DeviceAdapter` must move from code into a real, versioned database entity before a marketplace can exist — "no action needed now; noting it so future work doesn't have to rediscover this transition point."

### 3.5 MCP-Client Behavior

**What:** PeakLogic's own AI/analytics layer initiating calls *out* to external MCP servers — e.g., consuming a third-party data source or tool via MCP rather than only exposing PeakLogic's own MCP server for others to consume.

**Why deferred:** AI-4.1 (SRS §3.7) is a hard MVP boundary, not a performance target — "no code path shall exist at MVP where PeakLogicSystems' AI/analytics layer initiates a call to an external MCP server." Distinct and *not* in conflict with the channel-partner-portal's AI dispatch feature (TR-3, now MVP scope): that's an external agent calling *into* PeakLogic's MCP server, the opposite direction (SRS §2.5's explicit clarification note, re-verified during MVP Roadmap's review pass).

**Trigger to revisit:** "Deferred until a specific integration need justifies the cost" (Vision §10, PRD AI-4) — demand-driven, not scheduled.

**Depends on:** Nothing architectural blocks this independently; it's purely a business-justification gate.

### 3.6 ML-Trained Predictive Analytics

**What:** Custom-trained predictive-maintenance models, distinct from MVP's baseline analytics (AI-3: rate-of-change/trend detection and simple statistical anomaly detection, both computed directly over stored telemetry, "no ML training/model infrastructure required" per PRD §5.7).

**Why deferred:** Baseline analytics already deliver the core "proactive risk detection" pitch without the cost/complexity of a training pipeline, model versioning, and drift monitoring — proportionate for a small number of design-partner tenants.

**Trigger to revisit:** No specific trigger named in any prior doc — likely tied to having enough accumulated real telemetry history across enough tenants for a trained model to outperform the statistical baseline meaningfully, but this document doesn't invent that threshold; flagged in §7.

**Depends on:** A real AWS deploy and real accumulated telemetry (can't train on data that doesn't exist yet).

### 3.7 Active Electrical Load Conditioning

**What:** Actively managing/conditioning current draw so devices don't overdraw a circuit — distinct from passive energy *monitoring*, which is already in MVP scope.

**Why deferred:** Vision §5/§13 are explicit and unusually blunt about this one: it's "meaningfully more regulated... UL/NEC-adjacent electrical safety... could pull the company toward the same kind of regulatory burden §4.6 deliberately avoids for fire/life-safety." This is a real-consequence, not-lightly-reversed scope boundary, not a resourcing decision.

**Trigger to revisit:** Vision §11 states the expected shape directly: "if pursued, the expectation is a partnership with an already-certified electrical-control hardware maker rather than in-house development." The trigger is finding that partner, not building in-house capability to justify the idea.

**Depends on:** Nothing else in this roadmap; it's the most independent initiative here.

### 3.8 Full Channel-Partner Tenant Management, Automated Billing, and In-House AI Routing (CH-3a)

**What:** The narrower carve-out PRD kept explicitly excluded even after the pool-servicing channel-partner portal (CH-3) was pulled into MVP scope (2026-07-11 amendment): a partner managing a tenant's own settings/billing/users directly, automated revenue-share/billing calculation, and a proprietary in-house AI-routing/optimization engine (replacing today's "external agent consumes PeakLogic's MCP server" design).

**Why deferred:** PRD CH-3a states the reasoning directly — "the scoped dispatch portal (CH-3) proves the channel relationship's value without taking on full self-service administration or billing automation." Each of the three pieces here was also a locked decision from the original channel-partner-portal scoping session (`project-peaklogic-channel-partner-portal` memory), each explicitly recorded as a "future desired improvement," not a permanently closed door.

**Trigger to revisit:** Not named with a specific condition in any prior doc. The most likely real trigger, inferred but not asserted as fact: the current MCP-based external-agent AI dispatch (once actually implemented, MVP Roadmap §5 item 4) proving valuable enough that an in-house routing engine becomes worth the build cost instead of depending on an external agent — but this document doesn't decide that, only names it as the plausible shape (§7).

**Depends on:** MVP Roadmap §5 item 4 (the currently-unimplemented channel-partner-portal MCP server, frontend, and dispatch UI) shipping first — there's no in-house routing engine to build until the external-agent version exists to be compared against.

### 3.9 Next Verticals: Industrial Pumping Stations; Gas-Station Fuel Dispensers & UST Leak Detection

**What:** Two distinct expansions named in PRD §8:
- **Industrial (water/wastewater) pumping stations** — "the next vertical after MVP," building on the already-existing `pump` sensing category, not a new adapter type from scratch.
- **Gas-station fuel-dispenser monitoring and underground storage tank (UST) leak detection** — for the already-confirmed gas-station/convenience-store beachhead vertical, but explicitly *not* part of that vertical's MVP scope. UST leak detection specifically is "a separate, heavily regulated EPA UST compliance program (financial responsibility rules, etc.) — a materially larger and distinct product decision" than anything else in this roadmap, closer in kind to §3.7's electrical-conditioning caution than to a routine adapter addition.

**Why deferred:** MVP's two confirmed beachhead verticals (pool servicing, QSR/gas-station-convenience) are enough to prove the product thesis and support the active sales motions already in progress; a third vertical and a heavily-regulated compliance program are both real scope expansions, not incremental adapter work.

**Trigger to revisit:** Compliance & Certification Roadmap §6 item 4 already ties SOC 2 Type II completion timing to "before the industrial-pumping-station vertical... is actively being sold" — meaning this vertical's launch is the trigger for §3.2, not the other way around. UST leak detection has no named trigger; flagged in §7 given its regulatory weight.

**Depends on:** Nothing blocks pumping-station adapter work technically (the `pump` category already exists) — this is a go-to-market decision more than an architectural one. UST leak detection would need its own EPA-compliance research pass before any architecture work starts, similar in spirit to how the pool-chemistry thresholds needed real CDC citations before shipping.

### 3.10 Native Mobile App

**What:** A native Android/iOS app, distinct from MVP's responsive web dashboard.

**Why deferred:** PRD §4 states plainly that a native app "is not required to prove the product thesis" — the responsive web dashboard already serves every MVP persona, including the Route-Based Service Technician's on-the-go usage pattern.

**Trigger to revisit:** No specific trigger named. A reasonable candidate, not asserted as decided: real usage data showing the responsive web experience is a genuine adoption blocker for field-based personas (technicians, on-site operators) rather than an assumed one — flagged in §7.

**Depends on:** Nothing else in this roadmap.

### 3.11 Portfolio-Level ROI / Aggregate Savings Reporting (RP-3)

**What:** An aggregate savings/avoided-loss dollar figure across a Corporate/Regional Ops Leader's whole portfolio (e.g., "total alerts that likely prevented a larger incident," PRD RP-3) — distinct from RP-1/RP-2's presence/status roll-ups, which are in MVP scope.

**Why deferred:** PRD RP-3 states the real reason directly: "a defensible ROI dollar figure requires real usage data this PRD's horizon doesn't yet have." This isn't a build-complexity deferral, it's a data-availability one — the feature can't be built credibly before enough real alert/outcome history exists to compute a defensible number from.

**Trigger to revisit:** Sufficient real usage history across enough tenants and enough time for an aggregate figure to be statistically credible, not engineering-effort-driven. User Stories §2.1 (US-3) already preserves this need on record for exactly this reason — "included here so the need is on record even though it isn't being built now."

**Depends on:** A real AWS deploy and enough elapsed operating time — the same underlying dependency as §3.6 (ML models), for the same reason (both need real accumulated data, not more engineering time).

### 3.12 Enterprise SLA Tier

**What:** A contractual uptime SLA above MVP's 99.9% internal engineering target — PRD §6 names "99.95%+... expected for a future enterprise offering" directly.

**Why deferred:** PRD §6 (echoed in SRS §5.3, Deployment Architecture §3.2) is explicit that 99.9% today is "an internal engineering target, not yet a contractual SLA" — no customer has been sold a number that needs enforcing yet, and Deployment Architecture's single-region posture (no cross-region backup replication) is consistent with that: it's deferred specifically until a contractual SLA requires it, not indefinitely.

**Trigger to revisit:** A real enterprise contract negotiation that asks for a specific committed uptime number — the same kind of concrete, deal-driven trigger used for WAF and the DNS-rebinding SSRF gap (Technical Debt Register territory, §6), but elevated here because committing to an SLA number is a business/legal decision with real financial consequences (credits, penalties), not a technical hardening task.

**Depends on:** §3.3's multi-account/infrastructure-isolation work and cross-region backup replication are the most likely concrete architecture changes a real 99.95%+ SLA would require — sequence after or alongside §3.3, not independently.

---

## 4. Trigger Conditions Summary

| Initiative | Concrete trigger | Named in prior doc? |
|---|---|---|
| §3.1 Actuation | Both Device & Command Security Architecture §5 gate conditions resolved (Ops Leader authority decision + AUD-1 wired to command issuance) | Yes — explicit gate |
| §3.2 Compliance certification | Next vertical or a true enterprise deal becoming actively sold; CC1 org-control gaps closed first | Yes — Compliance & Certification Roadmap §6 |
| §3.3 Multi-account AWS | SOC 2 Type II engagement or a specific enterprise customer requiring that isolation level; forced sooner if `dev`/`prod` ever need simultaneous real devices in one account | Yes — Deployment Architecture §2.1/§2.2 |
| §3.4 Adapter marketplace | Not named | No — flagged open, §7 |
| §3.5 MCP-client behavior | A specific integration need that justifies the cost | Yes — Vision §10, PRD AI-4 |
| §3.6 ML-trained analytics | Not named (inferred: sufficient accumulated telemetry history) | No — flagged open, §7 |
| §3.7 Electrical load conditioning | Finding an already-certified electrical-control hardware partner | Yes — Vision §11 |
| §3.8 Full partner portal (CH-3a) | Not named (inferred: external-agent dispatch proving valuable enough to justify in-house routing) | No — flagged open, §7 |
| §3.9 Next verticals | Pumping stations: go-to-market timing, ties §3.2's trigger. UST: not named, flagged given regulatory weight | Partially — Compliance Roadmap §6 for pumping stations only |
| §3.10 Native mobile app | Not named (inferred: field-persona adoption data) | No — flagged open, §7 |
| §3.11 Portfolio ROI reporting (RP-3) | Sufficient real usage/outcome data to compute a defensible figure | Yes — PRD RP-3 |
| §3.12 Enterprise SLA tier | A real enterprise contract negotiation requiring a committed uptime number | Yes — PRD §6 (implied "not yet a contractual SLA") |

Five of twelve initiatives have no trigger condition named anywhere in the 22 prior artifacts — genuinely open, not overlooked. See §7.

---

## 5. Sequencing Notes

- **§3.2 (compliance) and §3.3 (multi-account) share a trigger** and should be planned together, not independently — both fire on the same real-world event (SOC 2 Type II engagement / enterprise customer demand).
- **§3.2's trigger is itself downstream of §3.9's pumping-station vertical** going to active sale (Compliance Roadmap §6 item 4) — meaning a realistic path through this roadmap is: next vertical goes to market → compliance certification work starts → multi-account infrastructure follows.
- **§3.1 (actuation) is gated by two decisions, not by engineering capacity** — resolving Device & Command Security Architecture §5's gate is cheap (a decision, not code) and could happen well before actuation is actually scheduled, the same way this project resolved other standing decisions (technician login, cross-tenant RLS mechanism) well ahead of when they were strictly needed.
- **§3.6 (ML models) and §3.11 (portfolio ROI) share the same real dependency**: elapsed real-world operating time with real data, not more engineering effort. Neither should be scheduled by sprint planning; both are gated on the AWS deploy blocker (MVP Roadmap Blocker #1) *plus* calendar time after that.
- **§3.8 (full partner portal) explicitly depends on MVP Roadmap §5 item 4 shipping first** — there's no meaningful "in-house AI routing" decision to make before the external-agent version exists to compare it against.
- **§3.4 (adapter marketplace) has one already-identified prerequisite** independent of its own undefined trigger: `DeviceAdapter` moving from code to a real DB entity (Domain Model §6.2). That migration could reasonably happen earlier than the marketplace itself, as general architectural cleanup, if it ever becomes a blocker for something else.

---

## 6. What This Roadmap Deliberately Does Not Cover

The following are real, disclosed, already-documented gaps — not new capability, just things that could be done better in what already exists (or, for this fork, what's designed but not yet built). They belong in the **Technical Debt Register (#24)**:

- WAF not attached to the API layer (Security Architecture §3.3 — Azure Front Door/Application Gateway WAF named but not adopted, same reasoning and trigger as the AWS version)
- The disclosed DNS-rebinding gap in the SSRF fix (Threat Model §4.2/§7 — confirmed still applicable and, if anything, more relevant given Azure's own IMDS shares the identical `169.254.169.254` address)
- Per-role MFA enforcement, and Azure's own genuinely less-settled MFA mechanism question (Security Architecture §2.2, a real, disclosed uncertainty the AWS version didn't have)
- No admin-facing session-revocation tooling (Security Architecture §6 — Graph API `revokeSignInSessions` verified as the mechanism, not yet wired into anything)
- Azure Monitor/Log Analytics retention length (Security Architecture §8 — same standing concern as the AWS version's CloudWatch item)
- **Corrected v1.1**: Azure Functions has **no native DLQ support at all** for IoT Hub/Event Hub triggers (Threat Model §4.1) — a materially bigger gap than the AWS version's "flip an existing config flag" item, since it requires real custom-logic design from scratch
- Device decommission doesn't revoke the IoT identity (Device & Command Security Architecture §3.2's redesigned Azure mechanism — disable the IoT Hub identity + DPS enrollment)
- SOC 2 CC1 organizational-control gaps — unaffected by the cloud switch (SOC 2 Control Mapping §9/§11)
- API casing/pagination reconciliation, non-atomic Cognito/DB writes *(now Entra/DB writes)* in partner user creation, stale `backend/shared/types.ts` (API Specification §7)
- No per-tenant resource quota/rate limit (Multi-Tenant Architecture §4/§6, Threat Model §4.5)
- No cross-region/geo-redundant backup replication (Deployment Architecture §3.2 — Azure's real ~1-hour-RPO geo-redundant restore option named but not adopted)
- **New, added v1.1**: neither Bicep nor Terraform can fully automate Entra External ID tenant creation (Infrastructure as Code §2.2) — a real, disclosed operational gap with no AWS-side equivalent to compare against

This split matters: an initiative in §3 needs a strategic decision (is this worth building, and when) — an item in this list needs someone to just do it, the design/decision is already made. Keeping them separate means the Technical Debt Register doesn't have to relitigate strategy, and this document doesn't get cluttered with a dozen small, already-decided fixes.

---

## 7. Open Questions

1. **Five initiatives (§3.4, §3.6, §3.8, §3.9's UST piece, §3.10) have no trigger condition named anywhere in the 22 prior artifacts.** For three of these (§3.4, §3.6, §3.8) this document names a plausible candidate trigger in its own text, explicitly marked as inferred rather than sourced — not invented false precision, just a reasonable guess flagged as one. §3.9's UST piece and §3.10 got no candidate at all, given in the UST case how much the eventual trigger likely depends on real regulatory research this document isn't positioned to do. Whoever picks up strategic planning next should decide whether any of these five need a real trigger defined now or can stay open until circumstances force the question.
2. **ISO 27001 has no dedicated readiness assessment anywhere** — PRD §4 names it alongside SOC 2 as a compliance certification goal, but Compliance & Certification Roadmap (#5) only ever scoped SOC 2 in depth. Worth a dedicated pass if/when SOC 2 Type II is underway, not before.
3. **The `tenants.plan` enum already includes `enterprise` as a value** (Domain Model §2.1) but no code anywhere gates behavior by plan tier — every tenant gets identical feature access regardless of plan today. This roadmap doesn't resolve whether any of §3's initiatives should become plan-gated features (vs. universally available once built) — a real product decision, not an architecture one, deliberately left to whoever scopes each initiative when it's actually picked up.
4. **This document's own initiative boundaries are a judgment call, not a rediscovery of some existing canonical grouping.** The 22 prior artifacts named these items scattered across dozens of sections, in inconsistent groupings — the 12 initiatives in §3 are this document's own synthesis of what belongs together, and a future revision might reasonably group them differently (e.g., splitting §3.2's SOC 2/ISO/HIPAA threads into separate initiatives once real work starts on any one of them).

---

## 8. Traceability

| Initiative | Primary source(s) |
|---|---|
| §3.1 Actuation | Vision §5/§11, PRD §4/§5.6, SRS §3.6, Device & Command Security Architecture §4/§5, `project-peaklogic-pending-decisions` item 3 |
| §3.2 Compliance certification | PRD §4, Vision §11, Compliance & Certification Roadmap §2.2/§3.3/§6, SOC 2 Control Mapping §8/§9/§11 |
| §3.3 Multi-account AWS | MVP Roadmap §1.2/§6, Deployment Architecture §2.1/§2.2, Multi-Tenant Architecture §6 item 6 |
| §3.4 Adapter marketplace | PRD §4/§5.1, SRS §3.1, Domain Model §6.2/§4/§8 |
| §3.5 MCP-client behavior | Vision §10, PRD §4/§5.7, SRS §3.7/§2.5, MVP Roadmap §6 |
| §3.6 ML-trained analytics | PRD §4/§5.7, MVP Roadmap §6 |
| §3.7 Electrical load conditioning | Vision §5/§11/§13, PRD §4 |
| §3.8 Full partner portal (CH-3a) | PRD §4/§5.8, User Personas §2.6, API Specification §5, `project-peaklogic-channel-partner-portal` memory |
| §3.9 Next verticals | PRD §8, Vision §6, User Personas §1.2/§2.1, Compliance & Certification Roadmap §6 item 4 |
| §3.10 Native mobile app | PRD §4 |
| §3.11 Portfolio ROI reporting | PRD §5.9 (RP-3), User Personas §6 item 1, User Stories §2.1 (US-3) |
| §3.12 Enterprise SLA tier | PRD §6, SRS §5.3, Deployment Architecture §3.2 |
| §6 Technical debt hand-off | Security Architecture §2.2/§3.3/§6/§8, Threat Model §4.1/§4.2/§4.5/§6/§7, Device & Command Security Architecture §3.2, SOC 2 Control Mapping §9/§11, API Specification §7, Multi-Tenant Architecture §4/§6, Deployment Architecture §3.2, Infrastructure as Code §2.2/§6 |

---

## 9. Review Log

**v0.1, reviewed 2026-07-12.** This document was compiled via a dedicated research pass across all 22 prior artifacts (an Explore agent tasked with exhaustively finding every "Enterprise Roadmap," "post-MVP," "Won't (MVP)," and trigger-gated deferral, reporting exact quotes and citations, not paraphrases) — every citation used in §3/§4/§6 above was spot-checked against the agent's reported quotes before being incorporated, and a sample were re-verified directly against the source files rather than trusted from the research pass alone:

1. **Re-verified directly**: `domain-model.md`'s `tenants.plan` enum actually includes `trial / starter / professional / enterprise` (§7 item 3's claim) — grepped the live file, confirmed exact wording.
2. **Re-verified directly**: the actuation pre-implementation gate's current status — read `project-peaklogic-pending-decisions` item 3 directly rather than trusting the research pass's summary, and found it needed a more precise statement than "not yet met": `writeAuditLog()` now exists (shipped with Security Architecture v1.1, after the original gate was written) but has zero call sites, so gate condition (b) is accurately "closer, not met," not simply "not started." §3.1 reflects this precisely.
3. **Re-verified directly**: SOC 2 Type I engagement status and the compliance-owner question — checked `soc2-control-mapping.md` directly rather than the older `compliance-certification-roadmap.md` (approved 2026-07-04, predates the compliance-owner decision), since the newer document is the current source of truth on that specific point. Confirmed the user was named compliance owner 2026-07-11, but CC1 organizational gaps still have no owner/timeline — both facts incorporated precisely in §3.2.
4. **Deliberately not verified further in this pass, flagged as a limitation**: the "channel-partner-portal is now MVP scope, not Enterprise Roadmap" boundary stated in §1.2 relies on the research agent's own explicit note to that effect, plus this document's author's independent knowledge from having done that amendment work directly earlier in this project — not re-derived from scratch a third time in this review, since it was already verified twice during that amendment's own approval process.
5. **A genuine judgment call, not a finding**: which items belong in §3 (strategic initiatives) vs. §6 (handed to Technical Debt Register) required drawing a line prior artifacts didn't draw explicitly themselves — documented the reasoning for that split directly in §6's closing paragraph rather than presenting it as an uncontroversial, pre-existing categorization.

**Approved v1.0, 2026-07-12** — user-approved without requested changes. Bumped out of `v0.x` draft numbering into `v1.0` on approval, the same convention MVP Roadmap (#22) followed.

---

## Revision History

**v0.1 (2026-07-12)** — initial draft. Synthesizes every Enterprise Roadmap-relevant deferral across the 22 prior artifacts (#1–22) into 12 sequenced initiatives with named or explicitly-flagged-as-missing trigger conditions, and hands off a separate list of smaller implementation/hardening gaps to the Technical Debt Register (#24, not yet started).

**v1.1 (2026-07-17)** — the first amendment specific to the `PeakLogic-Azure` fork, per `azure-restructuring-plan.md` item 23: a 🔵 amendment, confirming most content is cloud-agnostic rather than rewriting it.

- **§3.3 corrected, not just renamed**: multi-subscription Azure replaces multi-account AWS, with a real, disclosed difference — Microsoft's own recommendation for subscription separation is stronger/more explicit than AWS's, but Azure's version of this initiative has **one fewer forcing trigger** than the AWS version, since IoT Hub's per-stage resource isolation (Device & Command Security Architecture §2) structurally closes the shared-MQTT-namespace risk that used to force the AWS version's hand.
- **§3.2 corrected**: "no AWS deploy" restated as "no Azure deploy," same standing gate.
- **§6 corrected**: every AWS-specific technical-debt item swapped for its real Azure equivalent, with two real, disclosed severity changes flagged explicitly, not silently carried over — the Azure Functions DLQ gap is structurally bigger than its AWS counterpart, and a new item (Entra External ID tenant creation not IaC-automatable) has no AWS-side equivalent to compare against at all.
- **Unchanged, confirmed cloud-agnostic**: §3.1 (actuation), §3.2's certification scope/reasoning, §3.4–§3.12 (adapter marketplace, MCP-client, ML analytics, electrical conditioning, full partner portal, next verticals, native mobile, portfolio ROI, enterprise SLA) — all product/business-strategy decisions, re-read against this rewrite's infrastructure changes and confirmed none needed re-deciding.
