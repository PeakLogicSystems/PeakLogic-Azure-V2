# PeakLogic Hub — Dual-Platform (Windows 11 + Linux) Design

**Company:** PeakLogic  ·  **Project codename:** Project Vantage
**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Status:** 🟡 Draft v0.1 (2026-07-25) — new platform requirement: the PeakLogic Hub must run on **both Windows 11 and Linux**
**Depends on:** [Hub Agent Runtime](hub-agent-runtime-design.md) · [Hub Enrollment & Identity](hub-enrollment-and-identity-design.md) (Q6/DPS — the Linux identity story delegates to this) · [PeakView360 HMI](peakview360-hmi-architecture.md) §3.4/§7.7 (the cross-platform UI) · [Device & Command Security](device-command-security-architecture.md) §2 (DPS) · [Target Reference Architecture](target-reference-architecture.md)
**Implementation:** [`windows-hub/`](../../windows-hub/) — `PeakLogicEdge` (`Core` now multi-targeted; note the folder name is now a misnomer, §8)

---

## 0. Thesis

**The PeakLogic Hub is one cross-platform .NET agent that runs headless on both Windows 11 and Linux; the only OS-specific thing is the *optional local display*.** The agent's real job — acquire, normalize, durably queue, store-and-forward, heartbeat, evaluate alarms offline, serve the UI on the LAN — is already portable .NET. The operator UI is **PeakView360 served in a browser over the LAN** (PeakView360 §3.4/§7.7), which is cross-platform by nature. So a Linux hub needs *no* native GUI: it runs the headless agent and serves the same browser UI a Windows hub does. The Windows 11 hub keeps its WinUI kiosk as a **Windows-only optional local touch shell** on top of the identical agent.

**Two form factors, one agent:**
- **Windows 11 hub** — a touch-panel HMI appliance: the WinUI kiosk (local rich shell) + the browser UI, on the shared agent.
- **Linux hub** — a headless industrial gateway (fanless/DIN-rail, **Azure IoT Edge**-class): the agent as a containerized IoT Edge module, browser UI only.

**Decisions (locked 2026-07-25):** headless + browser UI for Linux (no native Linux GUI); **Azure IoT Edge module** as the Linux packaging/deployment target.

---

## 1. Scope

**In:** making the hub codebase run on Linux — the cross-platform boundary of `PeakLogicEdge.Core`, the headless-agent shape, how the two OS-specific pieces (DPAPI, serial) are handled, the Linux identity/secret story (delegated to IoT Edge, ties to Q6), and the IoT Edge packaging direction.
**Out (owned elsewhere):** the PeakView360 browser SPA itself; the WinUI kiosk internals; the DPS/IoT-Hub identity mechanism (Enrollment & Identity design — this doc only says how Linux *consumes* it); Azure infra provisioning (infra item 1).

## 2. Portability assessment (grounded, verified 2026-07-25)

What was already portable vs. Windows-locked in the real code, and what changed:

| Piece | Before | Now |
|---|---|---|
| `PeakLogicEdge.Core` TFM | `net8.0-windows` (comment: "never going to run anywhere else") | **`net8.0;net8.0-windows` multi-target** — portable `net8.0` build **verified compiling** (0 warnings), both framework outputs produced, 51 tests green |
| SQLite cache, MQTT, HTTP backend, Modbus/OPC-UA/REST ingestion, normalization, PeakAssist sync, edge alarms | portable already | unchanged — build under both TFMs |
| `DpapiSecretStore` (DPAPI) | Windows-only, `[SupportedOSPlatform("windows")]`, behind `ISecretStore` | compiled **only under `net8.0-windows`**; portable build omits it (seam intact) |
| `SerialIngestionSource` (`System.IO.Ports`) | Windows-only attribute, behind `IIngestionSource` | compiled **only under `net8.0-windows`**; portable build omits it (§4) |
| `PeakLogicEdge.App` (WinUI 3) | Windows-only (hard) | stays Windows-only — it's the *optional local shell*, not the agent |
| `PeakLogicEdge.Host` (console harness) | `net8.0-windows` | → the seed of the cross-platform headless **agent** (§3) |

**Net finding:** the agent was ~95% portable already; the dual-platform lift is a retarget + two seam implementations + packaging, not a rewrite.

## 3. Target structure

- **`PeakLogicEdge.Core` (portable `net8.0` + `net8.0-windows`)** — done. The shared agent logic; Windows-only impls compile only under the Windows TFM.
- **`PeakLogicEdge.Agent` (portable `net8.0`, headless)** — 🟢 *built (2026-07-25).* The real hub runtime. `Program.cs` = `Host.CreateDefaultBuilder().UseSystemd().UseWindowsService()` so **one binary** runs as a Linux systemd unit (and the IoT Edge module process model), a Windows Service, or a console; `HubAgentService : BackgroundService` runs the shared `Core.Agent.HubAgent` pipeline. **Cross-compiled to a real Linux ELF executable** (`linux-x64` + `linux-arm64`) — verified. The pipeline itself (`HubAgent`) was extracted into portable Core so it's no longer duplicated across launchers.
- **`PeakLogicEdge.App` (WinUI 3, `net8.0-windows`)** — Windows-11 optional local touch shell. Unchanged; not shipped to Linux.
- **PeakView360 browser UI** — the cross-platform operator surface, served by the agent on the LAN (§7.7). Same UI on both OSes.

## 4. The two OS-specific seams

- **Secret store (`ISecretStore`).** Windows: `DpapiSecretStore` (DPAPI). **Linux/IoT Edge: delegated, not reinvented** — on Azure IoT Edge the hub's device identity (the X.509/DPS cert from the Enrollment & Identity design, Q6) is provisioned and held by the **IoT Edge runtime / IoT Identity Service**, not by an app-managed secret file. So the Linux hub largely doesn't need an app-level secret store for its identity; any incidental app secret uses the IoT Edge workload API or an OS-keyring-backed impl. **A weakly-hardened plaintext Linux secret store was deliberately NOT shipped** — that would repeat the TD-43 mistake; the honest path is delegation to the platform that already manages device identity.
- **Serial ingestion (`IIngestionSource`).** `SerialIngestionSource` is Windows-gated today. Linux hubs are network-first (Modbus TCP / OPC-UA / REST — the industrial gateway norm), so serial is not on the Linux critical path. `System.IO.Ports` does support Linux (`/dev/tty*`); a cross-platform serial source is a later, low-priority impl of the same seam if a Linux hub ever needs direct serial.

## 5. Identity & connectivity on the Linux hub (ties to Q6 + D2)

The IoT Edge decision makes the Linux identity story fall out of the existing designs:
- **Identity:** IoT Edge provisions the module's **device identity via DPS** (Enrollment & Identity §3) — the same X.509/DPS model, now managed by the edge runtime rather than app code.
- **Heartbeat/config (D2 = twin-native):** IoT Edge gives every module a **device/module twin** natively — reported properties = heartbeat, desired properties = PeakAssist/rule targets. The built `PeakAssistSync` engine and `EdgeAlarmEvaluator` consume exactly this. IoT Edge also provides **offline store-and-forward** at the runtime level, complementing the agent's own SQLite queue.
- **Telemetry (§5/Q1 = IoT Hub MQTT):** the module publishes through the IoT Edge hub → IoT Hub, no app-managed transport credential.

Net: **on Linux/IoT Edge, more of the hub's plumbing is delegated to the platform** — a point in favour of IoT Edge as the Linux target.

## 6. Packaging & deployment

- **Linux:** containerized **Azure IoT Edge module** — 🟢 *scaffolded (2026-07-25).* [`windows-hub/edge/`](../../windows-hub/edge/): a multi-arch (amd64+arm64) `Dockerfile` building `PeakLogicEdge.Agent`, a `module.json`, and a `deployment.template.json` (edgeAgent/edgeHub 1.5 + the module). It encodes the real design ties: DPS identity (Q6, runtime-managed), the module **twin** for heartbeat/config (D2), an **upstream telemetry route** + edgeHub store-and-forward (§5), and — the container-durability point — the SQLite queue on a **mounted named volume** (`PEAKLOGIC_CACHE_PATH` honored by `HubAgentService`) so it survives restarts. **Not built/deployed** (no Docker/registry/IoT Hub here); JSON validated, image unbuilt. IoT Edge owns module deployment/versioning, so no bespoke update agent is needed there.
- **Windows 11:** unchanged from the runtime design — MSIX + update agent for the WinUI appliance (§7.8), the agent hosted in-process.
- **CI:** cross-compile Core/Agent for `linux-x64`/`linux-arm64` and `win-x64`; a `net8.0` Linux test run in CI is the real portability gate (this pass verified the portable *build* on Windows; runtime-on-Linux is unverified until CI/a real Linux host exists).

## 7. Honesty ledger (real vs. design)

- **Done & verified (2026-07-25):** `PeakLogicEdge.Core` multi-targets `net8.0;net8.0-windows` (portable build compiles, DPAPI/serial excluded). **`PeakLogicEdge.Agent` headless project built** — the shared `HubAgent` pipeline extracted into portable Core (dedups Host + the App's `EdgeRuntimeService`), hosted as a systemd/Windows-Service/console binary, **cross-compiled to real `linux-x64`+`linux-arm64` ELF executables**. `Host` refactored to the same shared agent and retargeted portable. 52 tests green (incl. a new end-to-end HubAgent durable-queue test).
- **Scaffolded, not built/deployed (2026-07-25):** the IoT Edge module packaging (`windows-hub/edge/`: multi-arch Dockerfile + module.json + deployment.template.json, JSON validated) — no container image built, no registry, no IoT Hub to deploy to (infra item 1). Also wired: `HubAgentService` now reads `PEAKLOGIC_CACHE_PATH` so the containerized queue can live on a mounted volume.
- **Design-stage (not built):** the Linux `ISecretStore`/serial impls (delegated/deferred per §4); the PeakView360 browser UI (its own doc, unbuilt); wiring the App's `EdgeRuntimeService` onto the shared `HubAgent` (it still runs its own copy — a later dedup).
- **Unverified:** a Linux ELF binary is *produced and* the code is portable, but the agent has not been *run* on Linux or IoT Edge — no Linux host, no Azure subscription/IoT Hub (infra item 1). Build + cross-compile verified; runtime-on-Linux is not. Same standing caveat as all Azure-track design.
- **Not reinvented:** the Linux identity/secret story delegates to the Enrollment & Identity (Q6) + IoT Edge, rather than duplicating a device-identity or secret mechanism on the edge.

## 8. Open items

- **Naming:** the `windows-hub/` folder and the README title "PeakLogic Edge — Windows Hub Application" are now misnomers (the agent is cross-platform). Rename to `hub/` or `edge/` — deferred (disruptive to git history/paths; do as a focused follow-up).
- **Agent project split:** promote `Host` → `PeakLogicEdge.Agent` (portable), with thin per-OS launchers (IoT Edge module entrypoint / systemd / Windows Service / WinUI host). Buildable next, infra-independent.
- **`linux-arm64`:** confirm target (many industrial gateways are ARM) — affects the IoT Edge base image.
- **Serial on Linux:** only if a Linux hub needs direct serial; otherwise network-protocol-only.

## 9. Revision history

| Version | Date | Change |
|---|---|---|
| Draft v0.1 | 2026-07-25 | New dual-platform requirement (Windows 11 + Linux). Decisions: headless + browser UI on Linux, Azure IoT Edge module packaging. Retargeted `PeakLogicEdge.Core` to `net8.0;net8.0-windows` (portable build verified, 51 tests green); DPAPI/serial gated to the Windows TFM behind their existing seams. Linux identity/secret/heartbeat delegated to IoT Edge + the Q6 DPS design + D2 twin. Naming + agent-split flagged as follow-ups. |
