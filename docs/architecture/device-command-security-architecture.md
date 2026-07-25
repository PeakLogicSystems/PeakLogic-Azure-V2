# Device & Command Security Architecture

**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Company:** PeakLogic
**Project codename:** Project Vantage
**Status:** Draft v2.0 — full rewrite for Azure (amendment pending review/approval — see Revision History, end of document; base document remains Approved v1 — AWS-native — until v2.0 is approved)
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (Draft v1.7, pending), [SRS](srs.md) (Draft v1.7, pending), [Domain Model](domain-model.md) (Draft v1.4, pending), [Database Schema](database-schema.md) (Draft v1.4, pending), [API Specification](api-specification.md) (Draft v1.4, pending)
**Last updated:** 2026-07-17
**Fork note (v2.0):** the first `PeakLogic-Azure`-specific rewrite of this document — `azure-restructuring-plan.md` item 12 flagged this as 🟣 **full rewrite required**, not a 🔵 amendment, since the entire device-identity/provisioning mechanism (AWS IoT Core "Thing" + `CreateKeysAndCertificateCommand`) has no direct Azure analogue — Azure's equivalent (IoT Hub + Device Provisioning Service) is structured differently, not just renamed. **Bumped to v2.0, not v1.1, to signal a structural rewrite** rather than an incremental amendment, mirroring how this project has treated major version jumps elsewhere (e.g. MVP Roadmap's v0.x→v1.0 on approval). The AWS-native `PeakLogic-AWS` repo's own Approved v1 is unaffected and continues to describe that platform correctly. Every cloud-specific mechanism below was re-derived from real, current (2026-07-17) Microsoft documentation, not assumed by analogy to the AWS design — see Revision History and §8 Review Log for what was verified and what changed as a result.

---

> **⚡ Unified Platform (v2.0) amendment — 2026-07-25.** The unified platform adds a **secure command path from PeakView360 / the partner portal back to the device** (e.g. a remote valve shutoff on leak detection) — this document's command/actuation model governs it. Unchanged guarantees: outbound-only device connection (no inbound firewall hole), gated + fully-audited command issuance, and **safety-critical actuation fails safe locally** (the device/Hub trips off its own reading, never dependent on a cloud round-trip). PeakLogic remains **above** safety-rated PLC control. Design-stage (actuation not built). Full plan: [`unified-platform-integration-plan.md`](unified-platform-integration-plan.md).

## 1. Introduction

### 1.1 Purpose

SRS §3.6 (CC-1–CC-4) and PRD §5.6 both point here for the actuation/command security model, and API Specification §1.2 explicitly carved the actuation endpoint out of its own scope in favor of this document. CC-3.1/CC-4.1 are unambiguous: **no command ships at MVP** — no code path may publish to a device's `commands` topic, and no shutoff/actuation endpoint may exist. This document is not clearing that gate. Its job is the one CLAUDE.md's "Future: Command & Control Architecture" section already flagged: design the command channel *now*, on paper, so that when actuation is actually scheduled (Enterprise Roadmap, #23), the team is implementing a reviewed design instead of relitigating fail-safe behavior, authorization, and audit trail under deal pressure.

### 1.2 Scope

In scope: the device identity/authentication model (mostly reconciling what already exists), device lifecycle and certificate-revocation gaps found while reviewing that model, and the full future command-channel design — authorization, transport/ack pattern, audit trail, and the fail-safe-locally principle CLAUDE.md already commits to.

Out of scope: general application security controls not specific to devices/commands (→ Security Architecture, #13), formal attack-tree/threat-level analysis (→ Threat Model, #19), and SOC 2 control evidence (→ SOC 2 Control Mapping & Evidence Plan, #20). This document produces a design; it does not itself ship code — CC-3.1/CC-4.1 remain in force until a future artifact (this doc's own §5) explicitly lifts them.

---

## 2. Device Identity & Authentication (rewritten for Azure IoT Hub + DPS)

**Full rewrite, not a reconciliation** — unlike the AWS-native version of this section (which formalized existing `infra/lib/iot-stack.ts`/`scripts/provision-devices.ts` code), no Azure code exists yet for this track. This section is a real design, verified against current Microsoft documentation, for what that code should become.

- **Provisioning service: Azure IoT Hub Device Provisioning Service (DPS), individual X.509 enrollment.** DPS is the Azure-native equivalent of `CreateKeysAndCertificateCommand` + manual Thing creation — it exists specifically to provision a device's identity and assign it to an IoT Hub instance at first connection, rather than the application code creating the identity directly. **Individual enrollment** (one enrollment entry per physical device) is the correct mode here, not group enrollment — it mirrors the existing per-device provisioning model (`provision-devices.ts` already creates one Thing/cert per device, not a shared batch credential), and PeakLogic's device counts (design-partner-tenant scale, PRD §8) don't need group enrollment's fleet-scale convenience.
- **Identity:** one IoT Hub **device identity** per physical device — the direct analogue of an AWS IoT "Thing." **Verified via Microsoft documentation, not assumed**: for X.509 individual enrollment, the device's leaf certificate must carry the device's serial (e.g. `PLG-0001`) as its **Subject Common Name (CN)**, which becomes the DPS **registration ID** — capped at 64 characters by the CN field itself, which the existing `PLG-XXXX` naming scheme clears with room to spare. The device ID in the resulting IoT Hub identity can be set explicitly in the enrollment entry, or defaults to this same registration ID if left unset — recommend leaving it unset and letting it default, so there is exactly one place (the certificate CN) that names the device, not two that could drift apart. `devices.thing_name` (`docs/data-model.sql`) remains the DB-side pointer, unchanged in shape — it stores this same identifier, just sourced from a different provisioning flow.
- **Authentication:** mutual TLS via a per-device X.509 certificate, generated at provisioning time and registered with DPS as an individual enrollment — structurally identical intent to the AWS design (one cert per device, no shared secret, compromising one device's key doesn't expose another's), different mechanism. **A real, disclosed difference worth flagging**: AWS's `CreateKeysAndCertificateCommand` is a single API call that generates and registers a cert in one step; Azure's DPS flow separates certificate *generation* (still the provisioning script's job, using the same X.509 tooling) from *enrollment* (a separate DPS API/portal step registering that cert's public identity before a device can attest with it) — `scripts/provision-devices.ts`'s Azure equivalent needs both steps, not a 1:1 drop-in replacement of one SDK call for another.
- **Authorization (device-side): structurally simpler than AWS's policy-language model, not equivalent-but-renamed.** AWS IoT Core requires a separate, hand-written policy document (`PeakLogicDevicePolicy`) to scope what a Thing may publish/subscribe to. Azure IoT Hub has no equivalent policy-authoring step for this case — a device's MQTT topic access is **inherently scoped to its own device identity by the platform itself**: a device authenticated as `PLG-0001` can only publish to `devices/PLG-0001/messages/events` (telemetry) and can only receive cloud-to-device traffic addressed to `PLG-0001` — there is no separate ACL document to write, review, or keep in sync, because the topic namespace itself is derived from the authenticated identity. This is a genuine simplification, not a gap — flagged explicitly in §8 Review Log so it isn't mistaken for an incomplete design.
- **Network model:** outbound-only, persistent MQTT/TLS session (CC-1.1) — the requirement itself is cloud-agnostic and unaffected by this rewrite; Azure IoT Hub supports the identical connection shape (device-initiated, outbound, persistent MQTT over TLS). CC-2.1's "prefer port 443 over 8883" firmware default carries over unchanged — Azure IoT Hub's MQTT endpoint is likewise reachable over port 8883 or, via MQTT-over-WebSockets, port 443, so the same firewall-compatibility reasoning applies without modification.

---

## 3. Device Lifecycle & Certificate Management (rewritten for Azure)

### 3.1 Provisioning (redesigned — see §2)

`provision-devices.ts`'s Azure equivalent generates the X.509 cert (unchanged tooling), registers it as a DPS individual enrollment, then writes the DB row (`status: 'provisioning'`) and the same gitignored `device-certs/{serial}/` local cert material as today — the operational shape (generate → enroll → write DB row → hand cert to operator) is preserved, only the middle step's concrete API calls change (a DPS enrollment API, not `CreateKeysAndCertificateCommand`+manual Thing creation). A device only becomes tenant-scoped later, at claim time — this part of the design (`devices.claim` bypassing `withTenant()` since the device has no `tenant_id` yet) is unaffected by the cloud switch; API Specification §2.3 already reconciled this to run inside `withTenant()` via a narrowly-scoped RLS policy instead, which likewise carries over unchanged since it's a data-layer concern, not a device-identity one.

### 3.2 Decommissioning — the same class of gap AWS's version found, re-verified for Azure's actual mechanism

**The gap, restated for this platform**: a decommissioning handler that only sets `status = 'decommissioned'` in Postgres, without also revoking the device's actual network-level capability, is exactly as real a gap on Azure as it was on AWS — the specific bug depends on what "revoke" means for this cloud, not on the cloud itself. **Verified via Microsoft documentation, not assumed by analogy**: Azure IoT Hub separates "can this device connect at all" (the device identity's own enabled/disabled status in the IoT Hub device registry) from "is this device allowed to (re-)provision itself" (the DPS enrollment entry's own enabled/disabled status) — these are two independent controls, not one combined concept the way AWS's certificate-`INACTIVE`-plus-Thing-detach pair effectively was.

**Recommendation (design, not yet implemented, same MVP-appropriate scoping as the AWS version):** decommissioning should, in the same handler that sets `status = 'decommissioned'`:
1. **Disable the device's IoT Hub device identity** (not delete it outright — disabling preserves the device twin/telemetry history for forensic reference, matching this project's general "don't destroy evidence" instinct already seen in `audit_log_entries`' append-only design, Database Schema §4.3) — an authenticated connection attempt from a disabled identity is rejected by IoT Hub.
2. **Disable the device's DPS individual enrollment entry** — so a decommissioned device's still-valid certificate cannot be used to *re-enroll* and get assigned a new (or the same) IoT Hub identity later, closing the path a disabled-but-not-fully-revoked AWS Thing/cert pair could otherwise leave open.
- **A real, disclosed timing caveat, not previously named for the AWS version either**: disabling a device identity does not guarantee an *already-connected* device's live MQTT session drops instantaneously — same category of caveat the AWS version's cert-`INACTIVE` mechanism carried, just newly stated explicitly here since it's directly relevant to how quickly a "decommissioned" device actually stops being able to publish.

### 3.3 Certificate rotation — not designed, flagged for Security Architecture (#13), unchanged disposition

No rotation policy exists today (certs are long-lived, created once at provisioning) — this was already true and unaddressed on the AWS side (Technical Debt Register, AWS repo), and remains a general device-security-hygiene question rather than one specific to the cloud platform or the command channel. Still intentionally left for Security Architecture (#13) to design, not solved here. **One real, Azure-specific wrinkle worth flagging for that future work**: DPS supports rolling an enrollment's expected certificate ahead of the device's actual cert expiring (a documented "roll certificates" operation), which has no direct 1:1 precedent in how the AWS version of this document left rotation scoped — Security Architecture (#13) should treat this as a real Azure-native capability worth using, not just re-derive a rotation policy from scratch as if DPS offered nothing beyond what AWS IoT Core does.

---

## 4. Command Channel Design (future — nothing in this section ships at MVP)

Everything below is a reviewed design for when actuation is actually scheduled (Enterprise Roadmap, #23). CC-3.1/CC-4.1 stay in force until then; see §5.

### 4.1 Authorization: who may issue a command

**Decision: command issuance requires the `admin` role, not `operator`.** This mirrors the existing pattern where the other consequential device action — `DELETE /v1/devices/{deviceId}` (decommission, `backend/api/routes/devices.ts` `remove()`) — already calls `requireRole(auth, 'admin')` only, while the lower-stakes `update()` handler allows `admin`/`operator` both. A remote shutoff is at least as consequential as decommissioning a device, and there is no current requirement asking for broader access. If a real customer need for `operator`-level command issuance surfaces later, that's a deliberate role-model change to make then, not a default to assume now.

**Caveat found on review: `admin` is not just Tenant Admin.** API Specification §4.1 records that both **Tenant Admin and Corporate/Regional Ops Leader** map to the same `admin` Cognito group today — API Specification §7 item 5 already flagged this as an open question worth revisiting "as more role-gated endpoints appear." This document is exactly that: as written, this decision would also let a Corporate/Regional Ops Leader (a portfolio-oversight persona, per User Personas, not an on-site operator) remotely trigger a single site's valve shutoff. That may be acceptable, but it hasn't been decided — it's inherited silently from the Cognito group collapse, not chosen deliberately. Flagged in §7 below rather than resolved here, since resolving it means either splitting the Cognito group (a change bigger than this document's scope) or accepting the overlap explicitly.

### 4.2 Fail-safe-locally (restated from CLAUDE.md, binding on future firmware/API design)

The cloud command channel is for **remote override, reset, or manual control, and for audit logging — never the sole trigger path for a safety-critical action.** A leak shutoff must trip from the device's own sensor reading immediately, with no dependency on a cloud round trip; the network can be down, IoT Core can be unreachable, and the shutoff must still happen. This isn't a new decision — it's already committed in CLAUDE.md — restated here because it constrains §4.3's design: the command API is explicitly *not* the thing that makes shutoff safe, so its availability/latency requirements are relaxed accordingly (see §4.5).

### 4.3 Transport & delivery-confirmation pattern (rewritten — a genuine simplification, not a lateral swap)

**Decision: Azure IoT Hub Direct Methods, not a custom ack topic and not Cloud-to-Device (C2D) messages.**

**Verified via Microsoft documentation, not assumed by analogy to the AWS design**, three real options exist on Azure:
- **Direct Methods** — a synchronous request/response call: the cloud invokes a named method on a specific, currently-connected device; the device's handler runs and returns a result; the cloud call itself blocks and receives that result (or a failure) within a configurable timeout (**documented range: 5–300 seconds, default 30**). If the device isn't connected right now, the call fails immediately — there is no queuing.
- **Cloud-to-Device (C2D) messages** — one-way, queued, at-least-once delivery: IoT Hub holds the message until the device connects and picks it up (subject to a TTL). No built-in acknowledgment path — a device would need to publish a separate device-to-cloud message to confirm receipt, the same shape the AWS design's custom `command-acks` topic built by hand.
- **Device-side handler polling a queue** — not a real Azure primitive, included only to note it was considered and dismissed as unnecessary complexity given the two options above already cover the need.

**Recommendation: Direct Methods.** This is a genuine architectural improvement over the AWS design, not just an equivalent renamed — **the AWS version had to build its own request/response/ack/timeout machinery by hand** (a custom `command-acks` topic, a `device_commands.status` state machine tracking `pending → delivered → acked`, and a separately-implemented timeout check) precisely because AWS IoT Core's topic-based pattern has no native synchronous RPC concept. **Azure IoT Hub's Direct Methods provide that exact request/response/ack/timeout shape natively** — the cloud-side API call itself *is* the acknowledgment wait, with a platform-enforced timeout, not something PeakLogic's own code needs to construct and maintain. This also fits §4.2's fail-safe-locally principle unusually well: because a Direct Method call fails immediately (not "queued, pending" indefinitely) when a device is offline, the issuing admin gets an honest, immediate "this override did not reach the device" signal rather than a custom-built system's ambiguous in-between state — better aligned with "the cloud channel is for override/reset/audit, never the sole safety trigger" than a queued-and-hope-it-lands design would have been.

### 4.4 Command lifecycle & audit trail (simplified as a direct consequence of §4.3's transport choice)

**Decision: a `device_commands` table still exists, but its lifecycle collapses from AWS's five states to three, because Direct Methods resolve synchronously.** `audit_log_entries` (Database Schema §4.3, AUD-1/AUD-2) is still the wrong fit for the same reason the AWS version gave — it models a single append-only fact, not a process — but that process is now shorter: a Direct Method call either succeeds (with the device's response) or fails/times out, both known **within the same request**, not learned later via a separate ack message arriving asynchronously.

Sketch (for the future Database Schema amendment that would actually create this — not created now):

| Column | Notes |
|---|---|
| `id`, `tenant_id`, `device_id`, `issued_by` (user id) | Standard identity/ownership columns, RLS-scoped like every other tenant table — unchanged from the AWS version |
| `command_type`, `payload` (JSONB) | e.g. `valve_shutoff`, `{ "valve_id": "..." }` — unchanged |
| `status` | `succeeded` / `failed` / `device_unreachable` — **three states, not five**; there is no separate `pending`/`delivered` state to track, since the Direct Method call has already resolved to a known outcome by the time this row is ever written |
| `issued_at`, `resolved_at` | **Two timestamps, not three** — `resolved_at` is set in the same write as `issued_at` (or a few hundred milliseconds later, bounded by the method timeout), collapsing AWS's separate `delivered_at`/`acked_at` distinction, which only existed because that design's confirmation was a second, asynchronous event |
| `device_response` (JSONB, nullable) | New — Direct Methods return an optional response payload from the device's own handler; AWS's ack-topic design had no equivalent structured field for this, since a custom MQTT ack message's payload shape was never specified this precisely |

A **separate** `audit_log_entries` row (action: `issue_command`) should still be written at issuance time, alongside the new row — unchanged reasoning from the AWS version (evidentiary append-only fact vs. operational record, still shouldn't be collapsed into one table).

**Caveat found on review, same substance as the AWS version, re-confirmed rather than assumed still true**: this still piggybacks on a mechanism that doesn't exist yet. No code anywhere in this fork's `backend/` writes to `audit_log_entries` (nothing has been implemented for this track at all yet) — AUD-1/AUD-2 remain specified-not-implemented, same standing gap as the AWS side. This section's design still depends on AUD-1 actually being built, whichever cloud ships it, not something this document can wave through for either platform.

### 4.5 Timeout & failure handling (now a concretely bounded decision, not fully open)

**A real constraint the AWS version didn't have**: Direct Methods enforce a platform timeout of 5–300 seconds (default 30) — whatever value PeakLogic picks must fall inside that range, a genuine Azure-specific bound this document can now state precisely rather than leaving entirely open. The *exact* value within that range remains an implementation-time tuning decision, not an architectural one — per §4.2, nothing about device safety depends on which specific number is chosen, only that a value exists and is honestly enforced. A `device_unreachable` result (the device wasn't connected to receive the call at all) and a `failed` result (the device's own handler ran and reported failure) are two distinguishable outcomes Direct Methods surface separately — worth preserving as separate `device_commands.status` values (already reflected in §4.4's table) rather than collapsing both into one generic "failed," since they mean different things to an issuing admin (no device presence at all, vs. a device that tried and couldn't comply).

---

## 5. What Ships at MVP: Nothing (restated, unchanged disposition)

This section exists so a future reader doesn't have to reconstruct the gate from CC-3.1/CC-4.1 by cross-referencing the SRS — the gate itself is cloud-agnostic and carries over from the AWS version unchanged. **As of this document, MVP ships:**
- §2 and §3.1 (device identity, provisioning) — a real design for this fork, but **not yet implemented anywhere in `backend/`/`scripts/`** (unlike the AWS version, where this section formalized already-shipped code). Implementing it is real follow-up work, not done in this pass.
- §3.2's decommission-revocation fix — recommended as MVP-appropriate follow-up work, same framing as the AWS version, once real Azure device-provisioning code exists to fix it in.

**MVP explicitly does not ship:** any part of §4 (Direct Method handler, `device_commands` table, or any code path invoking a command against a device). CC-3.1/CC-4.1 remain in force, cloud-agnostic as written. This document becomes the starting design when a future artifact or roadmap decision explicitly schedules actuation — at that point §4 should be re-reviewed for staleness (Azure service offerings, Direct Methods' own timeout/pricing/feature set may have changed) before implementation begins, not implemented verbatim without a re-check — the same discipline the AWS version already applied to its own design.

**Pre-implementation gate — command issuance (§4.1) may not be built until §7 item 5 is explicitly decided.** Restructuring the Cognito role model now, for a feature with no ship date, would be disproportionate — so this document deliberately does not do that. But shipping command issuance by implementing this design verbatim, without anyone having consciously decided whether a Corporate/Regional Ops Leader should hold single-site actuation authority, would let that scope creep in by accident rather than by choice. Whoever picks up actuation must resolve §7 item 5 first — either by splitting the `admin` Cognito group or by explicitly accepting the overlap — before `device_commands`/`command-acks` are implemented. Same gate applies to §7 item 6 (AUD-1 must actually exist, not just be assumed).

---

## 6. Traceability

| Section | Traces to |
|---|---|
| §2 Device Identity *(rewritten v2.0)* | CC-1.1, CC-2.1; Azure DPS/IoT Hub mechanism verified via Microsoft Learn documentation, 2026-07-17 |
| §3.2 Decommission gap | Same finding as the AWS version, re-verified for Azure's actual dual disable-identity/disable-enrollment mechanism |
| §4.1 Command Authorization | CC-4 (PRD), existing `admin`/`operator` role model (AUTH-2); Ops Leader caveat traces to API Specification §4.1/§7 item 5 — unchanged, cloud-agnostic |
| §4.2 Fail-safe-locally | CLAUDE.md → "Future: Command & Control Architecture" — unchanged, cloud-agnostic principle |
| §4.3 Transport *(rewritten v2.0)* | CC-3.1 (command channel stays unused at MVP); Azure IoT Hub Direct Methods vs. C2D messages verified via Microsoft Learn documentation, 2026-07-17 |
| §4.4 Audit Trail *(simplified v2.0)* | AUD-1, AUD-2, Database Schema §4.3 — depends on AUD-1 actually being implemented (currently not, for either cloud track) |
| §5 MVP Gate | CC-3.1, CC-4.1 — unchanged, cloud-agnostic |

---

## 7. Open Questions

1. **§3.2's decommission-revocation fix is recommended but not yet scheduled as actual implementation work.** It's a real, exploitable gap in shipped code, independent of the command channel — worth prioritizing rather than only remembering it when actuation is scheduled.
2. **§3.3 certificate rotation policy is unaddressed** — deliberately left to Security Architecture (#13).
3. **§4.4's `device_commands` table is a sketch, not a schema.** When actuation is actually scheduled, it needs a real Database Schema amendment (indexes, exact constraints, retention policy) before implementation, the same way every other new entity in this project has gone through that artifact first.
4. **Exact ack timeout duration (§4.5)** is deliberately left as an implementation-time decision.
5. **§4.1's Ops Leader/Tenant Admin identity-group overlap is unresolved — gated in §5, carried over unchanged.** Whether a Corporate/Regional Ops Leader should be able to issue a single-site command is a real product decision, not a cloud-platform question — it remains exactly as open on Azure as it was on AWS, since Security Architecture (#13) hasn't yet decided how tenant roles map onto whatever Entra ID/identity-provider group model this fork adopts.
6. **AUD-1/AUD-2 are unimplemented today, for either cloud track** — §4.4's audit-trail design assumes they exist by the time the command channel ships. Still gated in §5.
7. **New, added v2.0: none of §2/§3/§4's Azure design has ever run against a real Azure subscription or DPS instance.** Every claim here is verified against current Microsoft documentation (§8), the same "sound reasoning, unverified against a real instance" caveat this project applies consistently on the AWS side too (e.g. Database Schema §6 items 6/8/11) — not proof, until a real Azure account exists and this is actually exercised.
8. **New, added v2.0: the DPS individual-enrollment-vs-group-enrollment choice should be revisited if device counts ever grow past design-partner-tenant scale.** Individual enrollment was the right call for today's scale (mirrors AWS's per-device provisioning shape, §2) — flagged here so a future fleet-scale push doesn't silently inherit a provisioning model sized for a much smaller device count.

---

## 8. Review Log

Reviewed 2026-07-06. Three issues found and fixed; one substantive open item (§7 item 5) surfaced by the review is left deliberately unresolved, not papered over.

1. **§4.1 citation error**: attributed the "decommission is admin-only" fact to "API Specification §3" — checked, and that table has no role column at all; role enforcement exists only in `backend/api/routes/devices.ts`. Corrected to cite the code directly.
2. **§4.1 missed a real consequence of an already-known gap**: API Specification §7 item 5 flagged that Tenant Admin and Corporate/Regional Ops Leader share the same `admin` Cognito group, "worth confirming that stays true as more role-gated endpoints appear" — this document *is* that next role-gated endpoint, and it silently inherited the overlap (an Ops Leader could remotely trigger a site's valve shutoff, which was never a deliberate choice). Added as an explicit caveat in §4.1 and as open item §7.5, rather than either quietly accepting it or resolving it unilaterally.
3. **§4.4 overstated an existing pattern that doesn't exist**: the first draft framed "write an audit_log_entries row at command issuance" as reusing an established mechanism. Checked `backend/` for any existing writer to `audit_log_entries` — there are none; AUD-1/AUD-2 are specified and the table exists, but Compliance & Certification Roadmap §4 already lists audit logging as unimplemented. Reframed §4.4 to say this design depends on AUD-1 actually being built, rather than implying it already works.

Not changed: §2/§3.1 (device identity, provisioning) were re-checked against `iot-stack.ts`/`provision-devices.ts` and hold up as written. §3.2's decommission-revocation gap was re-verified directly against `devices.ts` — confirmed real.

**v2.0 (2026-07-17), the `PeakLogic-Azure` full rewrite — reviewed same session.** Every Azure-specific claim below was checked against real, current Microsoft Learn documentation via live web search, not assumed by analogy to the AWS design, per this project's own standing discipline.

1. **DPS individual enrollment X.509 requirements verified, not assumed**: confirmed the leaf certificate's Subject Common Name becomes the DPS registration ID (max 64 characters), and that the resulting device ID defaults to that same value unless explicitly overridden — checked directly against Microsoft's X.509 attestation documentation, confirming the existing `PLG-XXXX` naming scheme fits without modification.
2. **A real, positive architectural finding, not just a mechanical swap**: confirmed via documentation that Azure IoT Hub Direct Methods provide a synchronous request/response/timeout pattern natively (5–300s, default 30s), which the AWS design had to construct by hand (a custom MQTT ack topic plus a five-state `device_commands` lifecycle). This is disclosed explicitly in §4.3/§4.4 as a genuine simplification the Azure platform offers, not invented to make the rewrite look better than it is — the collapse from five `device_commands` states to three is a direct, traceable consequence of this verified platform difference, not a stylistic choice.
3. **Confirmed Azure IoT Hub's per-device topic authorization model needs no equivalent to AWS's hand-written `PeakLogicDevicePolicy`** — a device's topic access is inherently scoped to its authenticated identity by the platform. Flagged explicitly in §2 as a real simplification rather than left implicit, so a future reader doesn't go looking for an Azure "device policy" document that has no reason to exist.
4. **Checked whether Direct Methods' "fails immediately if offline, no queuing" behavior was a regression versus AWS's queued ack-topic design — concluded it's an improvement, not a gap, and said so explicitly (§4.3).** This required actually reasoning about the fail-safe-locally principle (§4.2) rather than assuming "more queuing is always better" — an immediate, honest failure signal fits this product's own stated principle (the cloud channel is never the safety trigger) better than an ambiguous queued state would have.
5. **Decommissioning's Azure mechanism (§3.2) verified as two independent controls (device-identity disable, DPS-enrollment disable), not assumed to be one combined AWS-style action** — checked against Microsoft's device lifecycle documentation rather than assumed structurally identical to AWS's certificate-`INACTIVE`-plus-Thing-detach pair.
6. **What did NOT change, confirmed deliberately rather than left unexamined**: §4.1 (command authorization role gate), §4.2 (fail-safe-locally principle), and §5 (MVP ships nothing) are all cloud-agnostic product/security decisions — re-read each one against this rewrite's new mechanism sections and confirmed none of them depend on anything AWS-specific that would need to change.
