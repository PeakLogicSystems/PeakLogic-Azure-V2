# PeakLogic Edge — Windows Hub Application

Implementation of `docs/architecture/windows-endpoint-application.md`. This is a **separate application** from the rest of the PeakLogicSystems monorepo — it runs on customer-site Windows hardware, not in AWS.

## Status (2026-07-12)

**Building now, first pass.** Not the full spec — see the doc's §11.1 build sequence. This pass covers steps 1–4 (Configuration, Security, Caching, Ingestion, Publishing, Backend client) as a real, compilable class library plus a runnable console harness. The WinUI 3 kiosk UI (step 5), Watchdog service + Assigned Access (step 6), and MSIX packaging (step 7) are not started yet.

| Piece | Status |
|---|---|
| `PeakLogicEdge.Core` — Configuration, Security (DPAPI), Ingestion (Serial/REST-poll/Simulated), Normalization, Caching (SQLite durable queue), Publishing (MQTT), Backend (Cognito auth + REST client) | Real, compiling code |
| `PeakLogicEdge.Host` — console harness proving the pipeline works end to end | Real, runnable today |
| `PeakLogicEdge.Core.Tests` — unit tests for the pure/testable pieces (envelope shape, mappers, backoff, cache) | Real tests written |
| `PeakLogicEdge.App` (WinUI 3 kiosk UI) | Not started |
| `PeakLogicEdge.Watchdog` (supervisor service) | Not started |
| `PeakLogicEdge.ConfigTool` | Not started |
| MSIX packaging, Assigned Access provisioning | Not started |

## Why the Host console app doesn't publish anything yet

Two real, disclosed reasons, not oversights:

1. **No AWS backend is deployed** (a deliberate hold — see `docs/architecture/README.md` and project memory for why). There is no real IoT Core endpoint, no real device certs, nothing to actually publish to.
2. Even once AWS exists, the Host harness uses `SimulatedIngestionSource` (no real sensor hardware attached yet), so there's nothing genuinely real to publish either.

What it *does* prove, right now, without either of those: real ingestion → real normalization → real durable SQLite queueing, the actual mechanism that makes telemetry delivery guaranteed rather than best-effort once a real backend and real hardware both exist. Run it and watch the queue grow — that's the offline-durability behavior working exactly as designed.

## Building

Requires .NET 8 SDK (or later) — installed via `winget install Microsoft.VisualStudio.2022.Community` this session, which bundles it. Visual Studio itself (not just the SDK) is needed once the WinUI 3 project exists, for the XAML designer.

```
cd windows-hub
dotnet build PeakLogicEdge.sln
dotnet test PeakLogicEdge.sln
dotnet run --project src/PeakLogicEdge.Host
```

## Deploying to the physical hub device (Surface tablet)

Not built yet — this is explicitly the next thing to figure out once the Core pipeline is verified working here. Realistic options once there's a real build to move:
- `dotnet publish -r win-x64 --self-contained` → copy the output folder to the Surface via a network share or USB drive. Works today, no packaging investment needed for early testing.
- MSIX packaging (§8.3 of the architecture doc) — the real production path, not worth building until the app's shape is more stable (matches the doc's own build-sequence ordering).

## Project structure

```
windows-hub/
├── PeakLogicEdge.sln
├── src/
│   ├── PeakLogicEdge.Core/       # framework-agnostic: envelopes, mappers, cache, backend clients
│   └── PeakLogicEdge.Host/       # console harness — NOT the eventual WinUI 3 kiosk shell
└── test/
    └── PeakLogicEdge.Core.Tests/
```
