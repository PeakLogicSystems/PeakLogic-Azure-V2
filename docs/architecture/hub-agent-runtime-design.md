# PeakLogic Hub — Agent Runtime Design

**Company:** PeakLogic  ·  **Project codename:** Project Vantage
**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Status:** 🟡 Draft v0.1 (2026-07-25) — net-new design artifact (Phase 3 of `unified-platform-integration-plan.md`)
**Depends on:** [PeakLogic Hubs / Windows Endpoint](windows-endpoint-application.md) (the Hub *spec*; this is the *runtime scoping* of its agent) · [PeakView360 HMI](peakview360-hmi-architecture.md) · [PeakAssist](peakassist-help-system-architecture.md) · [Domain Model](domain-model.md) §2.11 · [Database Schema](database-schema.md) §4.9 · [API Specification](api-specification.md) · [Device & Command Security Architecture](device-command-security-architecture.md)
**Implementation:** [`windows-hub/`](../../windows-hub/) — the `PeakLogicEdge` .NET solution (`Core` / `Host` / `App` / `Core.Tests`)

---

## 0. Thesis

**The Hub agent is one long-running Windows process that keeps a site reporting, supervised, and helpable even when the internet is down.** It acquires from local instruments (serial, REST, and — new for the unified platform — PLCs/RTUs over Modbus/OPC-UA), normalizes to canonical metrics, durably queues and store-and-forwards telemetry to PeakLogicSystems, serves **PeakView360 live** and **PeakAssist offline** to LAN clients, and reports its own health to the cloud via heartbeat. Everything it does is **reads-and-supervises**: it never issues safety-rated control, never replaces a PLC interlock, and fails safe-local (a Hub or cloud outage degrades visibility, never plant safety).

**Load-bearing boundary (repeated everywhere):** the Hub sits **above** the plant's certified control system. It is edge *infrastructure* — not a device, not an actuator. Losing it must never change what the plant physically does.

---

## 1. Scope

**In:** the runtime shape of the `PeakLogicEdge` agent — its processes and their responsibilities; the cloud-contract integration (register / heartbeat / PeakAssist bundle-sync / telemetry transport); the new edge capabilities the unified platform adds (PLC/RTU acquisition, LAN serving of PeakView360 + PeakAssist, edge alarm evaluation, offline credential caching); and a sequenced build roadmap from what exists today.

**Out (owned elsewhere):** the cloud data plane, RLS, and the Hub-side REST contract *definitions* (PeakLogicSystems — already built, §2); the PeakView360 client SPA itself (its own doc); the PeakAssist authoring/CMS and content model (its own doc); safety-rated control (the plant's PLC/SCADA); MSIX packaging and Assigned Access kiosk lockdown mechanics (windows-endpoint-application.md §8 — referenced, not re-specified here).

**Reconciles with, does not duplicate,** `windows-endpoint-application.md` — that doc is the *what/why* Hub spec (ingestion, kiosk, hardening, fleet, VPN). This doc is the *runtime scoping* of its agent against the now-real cloud contracts, and it is the authority on the **build sequence** (§7) from here.

---

## 2. What already exists to build on

The Hub agent is **not greenfield.** Grounded inventory of the real `windows-hub/` code (README §Status, verified against source):

**Real, compiling, tested (`PeakLogicEdge.Core`, 17/17 tests):**
- **Ingestion abstraction** — `IIngestionSource` (`DeviceKey` + `RunAsync(ct)`), `IngestionOrchestrator` (one task per source, per-source restart with `BackoffPolicy`, not whole-process), `TelemetryBus`. Concrete sources: `SerialIngestionSource`, `RestPollIngestionSource`, `SimulatedIngestionSource`.
- **Normalization** — `IPayloadMapper`, `TelemetryEnvelope` (canonical shape), NDJSON/JSON-passthrough parsers.
- **Durable queue + store-and-forward** — `TelemetryCache` (SQLite durable queue — telemetry survives process/host restart), `TelemetryFlusher`, `LocalAlertStore`.
- **Publishing** — `MqttPublisherPool`, `DeviceMqttClientFactory` (per-device MQTT/TLS).
- **Security** — `DpapiSecretStore` / `ISecretStore` (Windows DPAPI at-rest secret storage).
- **Backend client** — `PeakLogicApiClient` (sites/devices/alerts reads, device-claim write, alert-ack) + `BackendAuthClient` (token acquisition/refresh). `EdgeConfig` (write-once-at-commissioning local config).

**Real, runnable (`Host`, `App`):**
- `PeakLogicEdge.Host` — console harness proving ingestion → normalization → durable queue end-to-end.
- `PeakLogicEdge.App` — WinUI 3 kiosk UI (unpackaged): first-run commissioning (`SetupPage`), branded shell, live Dashboard + Ingestion Health, local alert clearing, light/dark theming. `EdgeRuntimeService` drives the **same** real Core pipeline as Host.

**Real cloud contracts now built this-side (backend, tested, 243/243):**
- `POST /v1/hubs` (register), `POST /v1/hubs/{hubId}/heartbeat`, `GET /v1/hubs/{hubId}/peakassist-sync` — `backend/api/routes/hubs.ts`, `hubs`-table entity (Domain Model §2.11).
- `GET /v1/hmi-screens`, `GET /v1/tags` — PeakView360 screen/tag config the Hub caches (`backend/api/routes/peakview360.ts`).
- `tags` normalization fabric (source→canonical, `scale`/`offset`) — `backend/shared/normalization.ts` `applyTag()`.
- PeakAssist bundle build/verify (delta by version, FNV-1a checksum) — `backend/shared/peakassist-sync*.ts`.
- Hub-silence sweep (online Hub past `interval×grace` → offline; edge-infra, no device-style alert) — `backend/jobs/hub-silence*.ts`.

## 3. Runtime component model

One supervised host process (`PeakLogicEdge.App` in production; `Host` headless) composing these long-lived subsystems:

| Subsystem | Responsibility | Exists? |
|---|---|---|
| **Ingestion** | `IngestionOrchestrator` runs one restarting task per configured source. | ✅ (abstraction + serial/REST/sim) — **+ new Modbus/OPC-UA sources** |
| **Normalization** | Map raw source payloads → canonical `TelemetryEnvelope` via the tenant's `tags`. | ✅ mapper layer — **+ align to cloud `tags` (scale/offset) for dual-source parity** |
| **Durable queue** | SQLite store-and-forward; telemetry survives outage/restart. | ✅ |
| **Uplink** | Transport queued telemetry to the cloud. | ⚠️ MQTT (AWS-era) — **reconcile to Azure transport (§5)** |
| **Fleet reporter** | Register once at commissioning; heartbeat every 60 s with `agent_version` + `peakassist_content_version`. | ❌ **new — cloud contract now exists** |
| **PeakAssist sync** | Poll `peakassist-sync`, verify checksum, install bundle to local store. | ❌ **new — cloud contract now exists** |
| **LAN server** | Serve PeakView360 live values + local alarms, and PeakAssist offline, to LAN clients over HTTPS. | ❌ **new** |
| **Edge alarm eval** | Evaluate alarm rules on live values locally so alarms work offline. | ⚠️ demo-only threshold check exists; real eval is design-stage |
| **Identity/secrets** | Cache a short-lived operator credential so sign-in survives an outage; DPAPI at-rest. | ✅ DPAPI — **+ offline-credential cache (new)** |
| **Supervisor** | Watchdog service restarts the agent; auto-update. | ❌ not started (README) |

## 4. Cloud-contract integration (the concrete wiring)

The agent's cloud surface — **all endpoints below already exist and are tested backend-side.** The gap is the .NET *client* calls (`PeakLogicApiClient` today has sites/devices/alerts/claim/ack, but **no hub methods**).

1. **Register (once, at commissioning).** `SetupPage` today saves site details locally and *explicitly defers* cloud registration — its own note said no hub-registration contract existed yet. **It does now.** `POST /v1/hubs` (`requireRole('admin')`, rejects missing name/site → 400) returns the `hubId`; a new Hub starts `provisioning`. → Add `RegisterHubAsync`, persist `hubId` in `EdgeConfig`, close the deferral.
2. **Heartbeat (every 60 s).** `POST /v1/hubs/{hubId}/heartbeat` (no role — the Hub's own report) with `{ agent_version, peakassist_content_version }`. Backend `recordHeartbeat` COALESCEs so a bare heartbeat never nulls known versions; flips `provisioning`/`offline` → `online`, stamps `last_seen`. The silence sweep flips it back to `offline` after `60 s × 3` of silence. → New `SendHeartbeatAsync` on a 60 s timer.
3. **PeakAssist sync (periodic).** `GET /v1/hubs/{hubId}/peakassist-sync` returns the latest bundle (or a no-op when current). Verify the FNV-1a checksum **on the Hub** (mirror `verifyBundle`) before install; install atomically to the local content store; report the new `peakassist_content_version` on the next heartbeat. → New sync client + local bundle store + checksum mirror.
4. **Screen/tag config cache.** `GET /v1/hmi-screens`, `GET /v1/tags` — pull and cache so the Hub can render the **same** PeakView360 screen the cloud would, offline. Tags carry `scale`/`offset` → the Hub's normalization must apply them identically to `applyTag()` (dual-source parity, PeakView360 §3.1).
5. **Telemetry uplink.** Canonical envelopes → cloud. Transport reconciliation is the open item in §5.
6. **Device claim / alert-ack (already wired).** `ClaimDeviceAsync`, `AcknowledgeAlertAsync` stay as-is — locally-bridged devices are claimed through the same `POST /v1/devices` the web onboarding uses (no hub-only path).

## 5. Transport reconciliation (AWS → Azure) — the one architectural open item

The existing uplink is **MQTT/TLS to AWS IoT Core** (`MqttPublisherPool`, `DeviceMqttClientFactory`), from before the Azure pivot. The unified platform targets Azure. Options, to decide (§8 Q1):
- **(a) Azure IoT Hub MQTT** — closest to the existing code; per-device identity maps to IoT Hub device identity; keeps the durable-queue/store-and-forward layer unchanged (only the client factory + endpoint/cred change). **Leaning here** — smallest, most-tested delta.
- **(b) HTTPS batch ingest** — POST canonical batches to a Functions ingest endpoint; simplest to reason about, reuses the existing `PeakLogicApiClient` auth; loses MQTT's efficiency at high device counts.
- **(c) Event Grid MQTT** — Azure-native MQTT broker; more infra to stand up.

Whichever wins, the **connection model is outbound-only mutual-TLS from the Hub** (no inbound ports opened at the customer site — windows-endpoint-application.md VPN/hardening posture). The durable SQLite queue is transport-agnostic and stays as the delivery-guarantee layer regardless.

## 6. Boundaries & fail-safe posture (non-negotiable)

- **Reads-and-supervises only.** PLC/RTU sources acquire *values*; the Hub never writes setpoints or issues control. Any future actuation is gated behind Device & Command Security Architecture §5 — out of scope here, same as everywhere in the platform.
- **Fail-safe-local.** Cloud outage → keep acquiring, queueing, serving PeakView360 live + PeakAssist offline on the LAN; sign-in survives via the cached credential. Hub outage → the plant's own control system is unaffected (the Hub is above it). Neither outage changes plant safety.
- **Edge is infrastructure, not a device.** A silent Hub is an ops signal (offline status), **not** a device-silent customer alarm — matches the built silence sweep's deliberate no-alert behavior.

## 7. Build sequence (the scoping deliverable)

Ordered to light up the cloud contracts that already exist first (highest value, lowest risk — no new backend needed), then the net-new edge capabilities. Each is a self-contained, testable increment in the project's established cadence.

1. **Close the commissioning loop** — `RegisterHubAsync` + persist `hubId`; wire `SetupPage`'s deferred registration to the real `POST /v1/hubs`. *(Unblocks everything Hub-scoped; the contract is waiting.)*
2. **Heartbeat reporter** — 60 s timer → `SendHeartbeatAsync` with agent + PeakAssist versions. Makes the Hub appear/stay `online` and the silence sweep meaningful end-to-end.
3. **PeakAssist sync client** — poll `peakassist-sync`, mirror `verifyBundle` checksum in .NET, atomic install to a local bundle store, report version on heartbeat. *(Pairs with the built cloud sync + seed.)*
4. **Transport reconciliation** — decide §5, swap the uplink client to Azure, keep the durable queue. *(Architectural gate before real telemetry flows.)*
5. **PLC/RTU sources** — `ModbusTcpIngestionSource` + `OpcUaIngestionSource` as new `IIngestionSource`s (the abstraction already supports this cleanly); align their normalization to cloud `tags` scale/offset.
6. **Edge alarm evaluation** — replace the demo-only threshold check with a real evaluator mirroring `backend/ingest/rules.ts`, feeding `LocalAlertStore`, so alarms work offline.
7. **LAN serving** — local HTTPS server exposing PeakView360 live/alarms + PeakAssist offline to LAN clients; cache `hmi-screens`/`tags`.
8. **Supervisor + packaging** — Watchdog service, MSIX + auto-update (windows-endpoint-application.md §8) — the production-fleet path; deliberately last, per that doc's own sequencing.

## 8. Open questions

- **Q1 (blocking §7.4):** transport — IoT Hub MQTT (a) vs. HTTPS ingest (b) vs. Event Grid MQTT (c). Recommend (a). Needs the Azure target-architecture decision (`azure-restructuring-plan.md`).
- **Q2:** PeakAssist bundle store format on the Hub — flat files vs. embedded SQLite. Lean flat files (simplest atomic swap; content is already checksum-verified).
- **Q3:** offline operator credential — cache lifetime and refresh policy on reconnect (Security Architecture Hub offline-credential path).
- **Q4:** LAN serving auth — does a LAN PeakView360 client authenticate to the Hub, or is LAN presence + a site credential sufficient? Affects §7.7.
- **Q5:** OPC-UA client security profile / cert trust with the plant's OPC server — customer-environment-dependent; defer to pilot.

## 9. Honesty ledger (real vs. design)

- **Real today:** the whole `PeakLogicEdge.Core` pipeline (ingestion abstraction, serial/REST/sim sources, normalization, SQLite durable queue, store-and-forward, MQTT publish, DPAPI secrets, backend read/claim/ack client), the Host harness, and the WinUI kiosk App (commissioning, live dashboard, ingestion health, local alerts, theming) — all verified running. Cloud-side: the register/heartbeat/peakassist-sync/hmi-screens/tags routes, the tags normalization fabric, the PeakAssist bundle build/verify, and the silence sweep (all tested).
- **Design-stage (not built):** every "❌/new" row in §3 and every step in §7 — the hub-registration/heartbeat/PeakAssist-sync **.NET client calls**, PLC/RTU sources, edge alarm eval, LAN serving, offline-credential cache. The cloud contracts exist; the Hub-side consumers do not yet.
- **Reconciliation debt:** the MQTT uplink is AWS-era and must be reconciled to Azure (§5) before real telemetry flows.
- **Deliberately deferred:** Watchdog, MSIX, Assigned Access lockdown, auto-update (README "not started"; windows-endpoint-application.md §8) — production-fleet path, last per that doc's sequence.
- **Not built anywhere, by design:** command/actuation from the Hub — gated behind Device & Command Security Architecture §5.

## 10. Revision history

| Version | Date | Change |
|---|---|---|
| Draft v0.1 | 2026-07-25 | Initial runtime scoping of the `PeakLogicEdge` agent against the now-real Hub cloud contracts; grounded exists/new inventory, cloud-contract wiring map, transport-reconciliation open item, 8-step build sequence, open questions, honesty ledger. Reconciles with (does not duplicate) `windows-endpoint-application.md`. |
