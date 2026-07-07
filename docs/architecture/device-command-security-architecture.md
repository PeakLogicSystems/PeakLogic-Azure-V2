# Device & Command Security Architecture

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1
**Depends on:** [Vision Document](vision-document.md) (approved v1), [PRD](prd.md) (approved v1.4), [SRS](srs.md) (approved v1.4), [Domain Model](domain-model.md) (approved v1), [Database Schema](database-schema.md) (approved v1), [API Specification](api-specification.md) (approved v1)
**Last updated:** 2026-07-06

---

## 1. Introduction

### 1.1 Purpose

SRS §3.6 (CC-1–CC-4) and PRD §5.6 both point here for the actuation/command security model, and API Specification §1.2 explicitly carved the actuation endpoint out of its own scope in favor of this document. CC-3.1/CC-4.1 are unambiguous: **no command ships at MVP** — no code path may publish to a device's `commands` topic, and no shutoff/actuation endpoint may exist. This document is not clearing that gate. Its job is the one CLAUDE.md's "Future: Command & Control Architecture" section already flagged: design the command channel *now*, on paper, so that when actuation is actually scheduled (Enterprise Roadmap, #23), the team is implementing a reviewed design instead of relitigating fail-safe behavior, authorization, and audit trail under deal pressure.

### 1.2 Scope

In scope: the device identity/authentication model (mostly reconciling what already exists), device lifecycle and certificate-revocation gaps found while reviewing that model, and the full future command-channel design — authorization, transport/ack pattern, audit trail, and the fail-safe-locally principle CLAUDE.md already commits to.

Out of scope: general application security controls not specific to devices/commands (→ Security Architecture, #13), formal attack-tree/threat-level analysis (→ Threat Model, #19), and SOC 2 control evidence (→ SOC 2 Control Mapping & Evidence Plan, #20). This document produces a design; it does not itself ship code — CC-3.1/CC-4.1 remain in force until a future artifact (this doc's own §5) explicitly lifts them.

---

## 2. Device Identity & Authentication (existing, reconciled)

No changes proposed here — this section formalizes what `infra/lib/iot-stack.ts` and `scripts/provision-devices.ts` already do, per CC-1.1/CC-2.1.

- **Identity:** one AWS IoT Core "Thing" per physical device, named from its serial (`thingName()` in `provision-devices.ts`, e.g. `PLG-0001` → `plg-0001`). The Thing is the unit of identity — `devices.thing_name` (`docs/data-model.sql`) is the DB-side pointer to it.
- **Authentication:** mutual TLS via a per-device X.509 certificate, generated at provisioning time (`CreateKeysAndCertificateCommand`) and attached to exactly one Thing. There is no shared device secret or API key — compromising one device's private key does not expose any other device's credentials.
- **Authorization (device-side):** `PeakLogicDevicePolicy` (`iot-stack.ts`) scopes every device identically and narrowly — connect as itself, publish only to its own `.../telemetry` topic, subscribe/receive only on its own `.../commands` topic. A device cannot publish to another device's topic or to its own `commands` topic (receive-only), which is what makes CC-3.1's "topic exists but stays unused" claim actually true today rather than just asserted.
- **Network model:** outbound-only, persistent MQTT/TLS session (CC-1.1) — reconciled and correct as-is; nothing here should change when the command channel is eventually built, per CLAUDE.md's "extend it, don't replace it" note. CC-2.1 (port 443 over 8883) is a firmware/provisioning default, not an architectural change, and is unaffected by this document.

---

## 3. Device Lifecycle & Certificate Management

### 3.1 Provisioning (existing, reconciled)

`provision-devices.ts` creates the Thing, cert, and DB row (`status: 'provisioning'`) together, then writes cert material to `device-certs/{serial}/` — gitignored, operator-side, never committed. A device only becomes tenant-scoped later, when a customer claims it via the onboarding wizard (`devices.claim`, the one endpoint that intentionally bypasses `withTenant()` per API Specification §2.3, since the device has no `tenant_id` yet at the moment of claiming). No gap found here.

### 3.2 Decommissioning — real gap found

**The gap:** `DELETE /v1/devices/{deviceId}` (`backend/api/routes/devices.ts`) only runs `UPDATE devices SET status = 'decommissioned'`. It never calls IoT Core to detach or deactivate the device's certificate. A "decommissioned" device, by this system's own database, still holds a **live, active X.509 certificate** that can reconnect, resubscribe to its `commands` topic, and publish telemetry indefinitely — the DB status is a UI/reporting label, not a security boundary.

This matters more once the command channel in §4 exists: a decommissioned-but-not-revoked device sitting on someone's network is a live receiver on a topic that will, post-MVP, carry shutoff/actuation commands. It's a real gap today too, independent of actuation — a stolen or physically repurposed device can keep sending fabricated telemetry into a tenant's data indefinitely after being marked decommissioned.

**Recommendation (design, not yet implemented):** decommissioning should call AWS IoT Core to (a) detach `PeakLogicDevicePolicy` from the certificate, (b) set the certificate `INACTIVE` via `UpdateCertificateCommand`, and (c) optionally detach the certificate from the Thing — all in the same handler that sets `status = 'decommissioned'`, so the DB state and the actual network-level capability change together instead of drifting. This is scoped as an MVP-appropriate fix (it doesn't touch the command channel), not a post-MVP item — recommend filing it as follow-up implementation work against the existing `devices.ts` route rather than deferring it to whenever actuation ships.

### 3.3 Certificate rotation — not designed, flagged for Security Architecture (#13)

No rotation policy exists today (certs are long-lived, created once at provisioning). This is a general device-security-hygiene question, not specific to the command channel, so it's flagged here but intentionally left for Security Architecture (#13) rather than solved in this document.

---

## 4. Command Channel Design (future — nothing in this section ships at MVP)

Everything below is a reviewed design for when actuation is actually scheduled (Enterprise Roadmap, #23). CC-3.1/CC-4.1 stay in force until then; see §5.

### 4.1 Authorization: who may issue a command

**Decision: command issuance requires the `admin` role (Tenant Admin), not `operator`.** This mirrors the existing pattern where the other consequential device action — `DELETE /v1/devices/{deviceId}` (decommission) — is already `admin`-only (API Specification §3), while lower-stakes device reads/updates allow `operator` too. A remote shutoff is at least as consequential as decommissioning a device, and there is no current requirement asking for broader access. If a real customer need for `operator`-level command issuance surfaces later, that's a deliberate role-model change to make then, not a default to assume now.

### 4.2 Fail-safe-locally (restated from CLAUDE.md, binding on future firmware/API design)

The cloud command channel is for **remote override, reset, or manual control, and for audit logging — never the sole trigger path for a safety-critical action.** A leak shutoff must trip from the device's own sensor reading immediately, with no dependency on a cloud round trip; the network can be down, IoT Core can be unreachable, and the shutoff must still happen. This isn't a new decision — it's already committed in CLAUDE.md — restated here because it constrains §4.3's design: the command API is explicitly *not* the thing that makes shutoff safe, so its availability/latency requirements are relaxed accordingly (see §4.5).

### 4.3 Transport & delivery-confirmation pattern

**Decision: a custom `command-acks` MQTT topic, not AWS IoT Device Shadow.**

Two real options exist for delivery confirmation:
- **Device Shadow** — AWS IoT Core's built-in desired/reported state document per Thing. Handles diffing automatically but introduces a second AWS IoT paradigm (shadow documents) alongside the topic-based pattern (`telemetry`, `commands`) this system already uses everywhere else.
- **Custom ack topic** — the device publishes to `peaklogic/{thingName}/command-acks` after processing a command, mirroring the existing `telemetry` ingestion pattern exactly (an IoT Topic Rule → Lambda, the same shape `iot-stack.ts`'s `TelemetryRule` already uses).

**Recommendation: the custom ack topic.** It keeps one architectural style throughout instead of introducing Shadow's separate API surface and mental model, and it reuses infrastructure/patterns already proven in production (`TelemetryRule`) rather than adopting a new one for a single feature. Concretely: `PeakLogicDevicePolicy` already grants each device `iot:Publish` only on its own `telemetry` topic (§2) — extending that grant to `.../command-acks` is a one-line policy change when this ships, not a redesign.

### 4.4 Command lifecycle & audit trail

**Decision: a new `device_commands` table, separate from `audit_log_entries`.** `audit_log_entries` (Database Schema §4.3, AUD-1/AUD-2) models a single append-only fact — actor, action, target, prior/new value — which fits a config change but not an async, multi-state process. A command has real states over time (`pending → delivered → acked → failed/timed_out`) that need to be updated as delivery confirmations arrive, which conflicts with `audit_log_entries`'s deliberate UPDATE/DELETE-rejecting trigger (§4.3's append-only enforcement exists precisely so that table never gets touched post-write).

Sketch (for the future Database Schema amendment that would actually create this — not created now):

| Column | Notes |
|---|---|
| `id`, `tenant_id`, `device_id`, `issued_by` (user id) | Standard identity/ownership columns, RLS-scoped like every other tenant table |
| `command_type`, `payload` (JSONB) | e.g. `valve_shutoff`, `{ "valve_id": "..." }` |
| `status` | `pending` / `delivered` / `acked` / `failed` / `timed_out` |
| `issued_at`, `delivered_at`, `acked_at` | Populated as the lifecycle progresses |

A **separate** `audit_log_entries` row (action: `issue_command`) should still be written at issuance time, alongside the new row — the two tables serve different purposes (evidentiary, append-only fact vs. operational, mutable delivery state) and shouldn't be collapsed into one to avoid touching two tables.

### 4.5 Timeout & failure handling

If no ack arrives within a bounded window, the command transitions to `timed_out` — the API/UI can report this to the issuing admin, but per §4.2 nothing about device safety depends on this timeout resolving any particular way. Exact timeout duration is an implementation-time tuning decision, not an architectural one, and is intentionally not fixed here.

---

## 5. What Ships at MVP: Nothing (restated)

This section exists so a future reader doesn't have to reconstruct the gate from CC-3.1/CC-4.1 by cross-referencing the SRS. **As of this document, MVP ships:**
- §2 and §3.1 (device identity, provisioning) — already true, no change.
- §3.2's decommission-revocation fix — recommended as MVP-appropriate follow-up work (it's a gap in existing shipped behavior, not part of the command channel).

**MVP explicitly does not ship:** any part of §4 (command endpoint, `command-acks` topic/policy grant, `device_commands` table, or any code path that publishes to a `commands` topic). CC-3.1/CC-4.1 remain in force. This document becomes the starting design when a future artifact or roadmap decision explicitly schedules actuation — at that point §4 should be reviewed for staleness (AWS service offerings, e.g. Device Shadow pricing/features, may have changed) before implementation begins, not implemented verbatim without a re-check.

---

## 6. Traceability

| Section | Traces to |
|---|---|
| §2 Device Identity | CC-1.1, CC-2.1 |
| §3.2 Decommission gap | New finding — no existing requirement covers this; recommend as follow-up, not a formal SRS amendment (it's an implementation gap in already-approved CC-1.1's network model, not a requirements gap) |
| §4.1 Command Authorization | CC-4 (PRD), existing `admin`/`operator` role model (AUTH-2) |
| §4.2 Fail-safe-locally | CLAUDE.md → "Future: Command & Control Architecture" |
| §4.3 Transport | CC-3.1 (topic already scoped, unused) |
| §4.4 Audit Trail | AUD-1, AUD-2, Database Schema §4.3 |
| §5 MVP Gate | CC-3.1, CC-4.1 |

---

## 7. Open Questions

1. **§3.2's decommission-revocation fix is recommended but not yet scheduled as actual implementation work.** It's a real, exploitable gap in shipped code, independent of the command channel — worth prioritizing rather than only remembering it when actuation is scheduled.
2. **§3.3 certificate rotation policy is unaddressed** — deliberately left to Security Architecture (#13).
3. **§4.4's `device_commands` table is a sketch, not a schema.** When actuation is actually scheduled, it needs a real Database Schema amendment (indexes, exact constraints, retention policy) before implementation, the same way every other new entity in this project has gone through that artifact first.
4. **Exact ack timeout duration (§4.5)** is deliberately left as an implementation-time decision.

---

## 8. Review Log

Not yet reviewed — draft v0.1.
