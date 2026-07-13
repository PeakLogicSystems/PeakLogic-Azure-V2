# Device Onboarding & Telemetry Acquisition Architecture

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v0.1 (new artifact — not yet reviewed)
**Depends on:** [Domain Model](domain-model.md) (Draft v1.3), [Database Schema](database-schema.md) (Draft v1.3), [Windows Endpoint Application](windows-endpoint-application.md) (Draft v1.1), [Device & Command Security Architecture](device-command-security-architecture.md) (Approved v1)
**Last updated:** 2026-07-13

---

## 1. Why this document exists

Every prior artifact assumes a device is already reporting telemetry and asks what happens *after* — how it's interpreted (Domain Model's `DeviceAdapter`), stored (Database Schema's `telemetry` table), alerted on (`RULES_BY_CATEGORY`). Nothing in the architecture set answers the question a real operator actually asks first: **"I have a physical sensor (or a manufacturer's cloud account) — how does data from it actually end up in PeakLogic?"** This document answers that, end to end, and makes explicit what's already adaptable by design versus what's a real, unbuilt gap.

This is not a new design exercise from scratch — it synthesizes decisions already locked in `docs/architecture/windows-endpoint-application.md` (the hub-relay path), `scripts/provision-devices.ts` (the existing provisioning script), and `backend/ingest/rules.ts` (verified directly against the real code, not assumed, §4 below) into one coherent walkthrough, and names the one real gap none of those documents claim to solve.

---

## 2. The three-layer mental model

Every device, regardless of type, passes through the same three conceptual layers. Keeping them distinct is what makes the system adaptable — a change to one layer never requires a change to the others.

1. **Origin** — where the reading physically comes from: a sensor wired to a Windows hub, a device with its own Wi-Fi/cellular stack, or a manufacturer's cloud API PeakLogic polls.
2. **Transport** — how a reading gets from its origin into AWS IoT Core as a normalized `IoTIngestEvent` (`{ thingName, ts, metrics }`, `backend/shared/types.ts`). This is the only shape the ingest Lambda ever sees — it has no idea whether the reading came from a device with its own cert or was relayed through a hub.
3. **Interpretation** — once a reading exists in `telemetry`, `DeviceAdapter` (Domain Model §2.3, `RULES_BY_CATEGORY` in code) decides whether it's normal, a warning, or critical, keyed on the *Asset's* `category` — not on which origin/transport produced it. A pool's chemistry reading is interpreted identically whether it arrived via a direct-connect sensor or a hub-relayed one.

**This is why "adaptable to different telemetry sources" is mostly already true by construction, not something that needs new design**: Interpretation never depends on Origin or Transport. Adding a new sensor type is a Transport-layer or Origin-layer change (a new `IIngestionSource`/`IPayloadMapper`, or a new manufacturer integration); it never touches how alerts fire.

---

## 3. The three Origin/Transport paths

| Path | Origin | Transport | Status |
|---|---|---|---|
| **A — Direct-connect** | A device with its own network stack (Wi-Fi/cellular/Ethernet) | Its own AWS IoT Core identity (per-device X.509 cert), publishes directly | **Built.** The original, always-existing pattern — `scripts/provision-devices.ts`, `infra/lib/iot-stack.ts`. |
| **B — Hub-relayed** | A locally-attached device with no native cloud stack (Serial/RS-485, or a device with only a LAN REST API) | Bridged through PeakLogic Edge (the Windows Hub), which holds **that device's own real IoT Core identity** and publishes on its behalf — not one shared gateway identity | **Built, this session** (`windows-hub/`) — `SerialIngestionSource`/`RestPollIngestionSource`, `DeviceMqttClientFactory`, verified running end-to-end with simulated data. |
| **C — Cloud-to-cloud** | A device that already reports into its own manufacturer's cloud (an OEM API) | PeakLogic's backend polls or subscribes to that OEM's public API directly — no hub, no PeakLogic-issued device cert at all | **Not designed.** Flagged in the Windows Hub doc as needing its own artifact (§1.1: "Path B has no backend design yet") — this is exactly the "collect telemetry it can get from a cloud server" case you're asking about. See §6. |

**Path A and B share the same Transport contract deliberately** — both produce the identical `IoTIngestEvent` shape over the identical per-device MQTT topic (`peaklogic/{thingName}/telemetry`). This is why the Windows Hub required **zero backend or ingest-Lambda changes** to build — from AWS's perspective, a hub-relayed device is indistinguishable from a direct-connect one. Path C would break this — it doesn't go through IoT Core/MQTT at all — which is exactly why it needs its own design pass, not a small extension of A/B.

---

## 4. The actual onboarding sequence, step by step (Paths A and B)

This is the part that's never been written down as one walkthrough before — each step already exists in code, scattered across different files.

1. **Provision.** Run `scripts/provision-devices.ts`. For each device: generates an X.509 cert/key pair, registers an AWS IoT "Thing," attaches a policy scoped to publish/subscribe on *only that device's own* topics (Device & Command Security Architecture, approved), and inserts a `devices` row with `tenant_id = NULL` ("unclaimed inventory") plus a human-readable serial/claim code.
2. **Physical install.** A technician installs the sensor (or, for Path B, wires it into the Windows Hub's Serial/LAN transport) at the actual site.
3. **Load credentials.**
   - Path A: the cert/key from step 1 gets flashed onto the device's own firmware — device-manufacturing-specific, out of this document's scope.
   - Path B: the cert/key gets copied into the Windows Hub's local `DpapiSecretStore` (`windows-hub/src/PeakLogicEdge.Core/Security/`) — the hub, not the sensor, holds this device's identity.
4. **Claim.** An authenticated tenant user enters the claim code in the app; `POST /v1/devices` sets `tenant_id`, moving the device from "unclaimed inventory" into that customer's fleet. This is the RLS-governed step Database Schema's `unclaimed_lookup` policy exists specifically to make safe (a claim query can see unclaimed devices; an ordinary `list()` cannot).
5. **Link to an Asset.** The claimed device gets associated (`devices.asset_id`) with the physical equipment it actually monitors — a pump, a walk-in cooler, a pool. **This step is what activates Interpretation** — `DeviceAdapter` rules key off the *Asset's* `category`, not the device, so an unlinked device produces telemetry rows that get stored but never evaluated against any threshold.
6. **Configure the transport, Path B only.** The Windows Hub's `EdgeConfig.json` (`windows-hub/src/PeakLogicEdge.Core/Configuration/EdgeConfig.cs`) gets one new device entry: which port/address to read from, and which `IPayloadMapper` reshapes that device's native field names into PeakLogic's wire format. Path A devices need no equivalent step — their firmware already speaks the wire format directly.
7. **Data flows.** Readings land in `telemetry`, `DeviceAdapter`'s rules evaluate each one (§5 below covers exactly how partial data is handled), alerts fire per the existing rule engine.

---

## 4a. Direct-connect: what step 3 actually requires from a real device

Everything above is honest about steps 1–2 and 4–7 being real, built, and reusable regardless of hardware. Step 3 for Path A — "flash the cert/key onto the device's own firmware" — is the one step this document cannot make generic, and is worth naming precisely rather than glossing over, since it's the actual blocker for "how do I onboard a *specific* real device" today.

**What AWS IoT Core requires, concretely:** the physical device must be able to (a) store a private key and X.509 certificate securely, (b) open a persistent outbound TLS connection to PeakLogic's IoT Core endpoint on port 443 (CLAUDE.md's "Future: Command & Control Architecture" section already locks in 443 over 8883 for firewall-friendliness), and (c) speak MQTT 3.1.1 over that connection. Any device meeting those three requirements is Path-A-eligible — no PeakLogic-specific hardware requirement beyond that.

**In practice, this sorts real hardware into three buckets, not one:**
- **Already MQTT/TLS-capable out of the box** (many modern industrial sensors, ESP32-class Wi-Fi modules, most commercial IoT gateways) — step 3 is: obtain the manufacturer's own provisioning/config tool, load the PeakLogic-issued cert/key through it. No new PeakLogic code needed, just a per-model runbook entry (see §6).
- **Cloud-connected but to the manufacturer's own cloud, not ours** — this is Path C (§6), not Path A at all, regardless of the device's own technical capability.
- **No independent network stack, or a stack that can't be repointed at a third-party MQTT broker** (most consumer/prosumer pool/HVAC controllers, most RS-485/Modbus industrial sensors) — this device is **structurally Path B**, not a smaller version of Path A. The Windows Hub isn't a workaround for these devices; it's the only path they have.

**This is exactly the "small managed ecosystem" instinct, made concrete, not a new decision:** PeakLogic doesn't need to solve "onboard arbitrary hardware" — it needs a short, curated list of specific, tested models across these buckets (§6), each with a known, once-written provisioning runbook or `IPayloadMapper`. That list is small by design, and the two-path architecture is what keeps it *extensible* without being a rewrite every time a new model gets added.

---

## 5. Adaptability — verified against real code, not assumed

Your framing — "adaptable to collect the telemetry it can get... some of which might not be needed, or might not be configured" — maps to two concrete, already-true properties of the system, checked directly against `backend/ingest/rules.ts` rather than asserted from the design docs alone:

**A device can report a subset of its category's metrics, and nothing breaks.** `evaluateRules()`'s own doc comment states it plainly: *"Rules whose metric isn't present in `metrics` are skipped... not treated as a missing-data alert."* Verified in the code (`backend/ingest/rules.ts:246`): `if (value === undefined) continue;`. A chlorinator that only reports `temp_c` and `flow_lpm` (no `salt_ppm`, say, because that probe isn't installed at this particular site) works completely normally — fewer rules evaluate, nothing errors, nothing gets flagged as broken.

**A device can be claimed and linked, and simply never send data — "not needed" or "not yet configured" is a valid, unremarkable state, not an error.** Nothing in the schema or ingest pipeline requires a claimed device to report anything on any schedule. `devices.last_seen_at`/`status` reflect reality passively.

**One real, disclosed gap this check surfaced**: there's no active "this device has gone silent" detection anywhere in `RULES_BY_CATEGORY`. That's a structurally different problem from everything the rule engine currently does — every existing rule fires on a *bad value being present*; detecting *absence* of an expected reading over time needs a different mechanism (a scheduled check comparing `last_seen_at` against an expected reporting interval, not a per-reading threshold rule). Not built, not previously flagged anywhere else in this project's docs — noted here as a real open item (§7), not silently assumed covered by the existing rule engine.

---

## 6. The real gap: Path C (cloud-to-cloud) has no design

This is the part of your question this document cannot fully close today, and shouldn't pretend to — consistent with this project's standing discipline of disclosing gaps rather than papering over them.

**What exists:** nothing in code. The Windows Hub doc names the need and explicitly stops there.

**What it would need, sketched at the level future design work should start from, not decided here:**
- A per-manufacturer integration (a scheduled Lambda polling an OEM's REST API, or a webhook receiver if the OEM supports push) — one per OEM, not a generic "connect any cloud" mechanism, since every manufacturer's API is genuinely different.
- Credential storage for each OEM account PeakLogic needs to poll on a tenant's behalf (a new Secrets Manager pattern, or — consistent with this project's current $0-cost dev-stage posture — deferred entirely until this path is actually needed for a real customer).
- A server-side reshaping layer converting each OEM's native payload into `IoTIngestEvent`, reusing the *concept* the Windows Hub's `IPayloadMapper` already established (Origin/Transport separation, §2) even though the implementation would live in a Lambda instead of on a hub.
- **Not designed here on purpose**: no specific OEM API is targeted yet, and this project's own established pattern (Domain Model, Windows Hub doc) is to design against a real, named need rather than a hypothetical one — building this before a specific manufacturer integration is actually requested risks the same kind of rework this project's governance model exists to avoid.

**Recommendation, not a decision**: treat Path C as a real, sequenced future artifact (add it to `docs/architecture/README.md`'s list once a specific OEM integration is actually needed), not something to design speculatively now.

---

## 7. Open Questions

1. **No device-silence/offline detection exists** (§5) — a real, newly-disclosed gap, not previously flagged. Needs a scheduled-check mechanism, structurally different from the existing per-reading rule engine. Not yet sequenced into any roadmap item.
2. **Path C (cloud-to-cloud) has no design**, deliberately not attempted here (§6) — sequence as a real artifact once a specific manufacturer integration is needed.
3. **No per-device-model provisioning runbook catalog exists yet** (§4a) — the three-bucket sorting is a real, useful mental model, but turning it into an actual short list of supported hardware (with per-model steps) is real follow-up work, not done in this pass.
4. **This document has not been reviewed** — Draft v0.1, first pass, not yet checked against a second read the way every other artifact in this project's history has been before reaching Approved status.

---

## Revision History

**v0.1 (2026-07-13)** — new artifact, prompted directly by the user asking how device onboarding and telemetry acquisition actually work end to end, and flagging it as an area needing real, plain-language explanation rather than scattered implicit assumptions across other documents. Synthesizes Domain Model §2.3 (`DeviceAdapter`), Database Schema (`unclaimed_lookup`), the Windows Hub doc's Path A/B split, and `scripts/provision-devices.ts` into one coherent walkthrough; verifies (not assumes) that partial/optional telemetry already works correctly by reading `backend/ingest/rules.ts` directly; surfaces one real, previously-undisclosed gap (no device-silence detection) and one previously-flagged-but-unsequenced gap (Path C) rather than resolving either speculatively.
