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

## Setting up a new hub device (interim process)

**Minimum spec: Windows 10 or 11, x64.** .NET 8 does not support Windows 8/8.1 or Windows RT — RT in particular can only run Windows Store apps and can never run this app, full stop, regardless of .NET version. Before provisioning any candidate hub device, check Settings → System → About: anything below Windows 10, or any device restricted to Windows RT (Store-apps-only, cannot be upgraded to a real Windows 10/11), cannot be used.

**Current distribution mechanism: GitHub Releases**, tagged `edge-vX.Y.Z` (a separate tag namespace from the platform's own `vX.Y.Z` releases, since they share this repo). This is explicitly an interim choice, not the production path — see the note below.

1. On the hub device, sign into GitHub in a browser (needs an account with access to this private repo).
2. Go to the repo's Releases page and download the **latest** `edge-vX.Y.Z` asset (currently `edge-v0.1.1` — `edge-v0.1.0` has a known Windows Explorer extraction bug, see below, don't use it).
3. Extract it to a folder (e.g. `C:\PeakLogicEdge`) — Windows' built-in "Extract All" should work fine as of v0.1.1.
4. Run `PeakLogicEdge.Host.exe`. It's self-contained (bundles its own .NET runtime) — nothing else needs to be installed first.

**Known issue, fixed in `edge-v0.1.1` (2026-07-15): `edge-v0.1.0`'s zip fails to extract with Windows' built-in tool.** Root cause: that zip was built with `tar -a -cf` (bsdtar), a workaround for a broken `Microsoft.PowerShell.Archive` module at the time — the file was always byte-for-byte intact, but Windows Explorer's shell zip handler couldn't parse that zip's structure and reported "the compressed folder is empty." Fixed by rebuilding with **.NET's own `System.IO.Compression.ZipFile`** (the same zip-writing code Windows itself uses), verified via a full extract-and-check round trip before publishing. **Use this method for every future release**, not `tar`:
```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  'publish/PeakLogicEdge', 'publish/dist/PeakLogicEdge-edge-vX.Y.Z-win-x64.zip',
  [System.IO.Compression.CompressionLevel]::Optimal, $false)
```

**To publish a new release build** (from the dev machine):
```
cd windows-hub
dotnet publish src/PeakLogicEdge.Host -c Release -r win-x64 --self-contained true -o publish/PeakLogicEdge
```
```powershell
# PowerShell — do NOT use `tar -a -cf` here, see the known-issue note above
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  'windows-hub/publish/PeakLogicEdge', 'windows-hub/publish/dist/PeakLogicEdge-edge-vX.Y.Z-win-x64.zip',
  [System.IO.Compression.CompressionLevel]::Optimal, $false)
```
```
git tag -a edge-vX.Y.Z -m "PeakLogic Edge vX.Y.Z"
git push origin edge-vX.Y.Z
gh release create edge-vX.Y.Z windows-hub/publish/dist/PeakLogicEdge-edge-vX.Y.Z-win-x64.zip --title "PeakLogic Edge vX.Y.Z (hub device build)" --notes "..."
```

**Why this is interim, not final:** every hub device needs a GitHub login with repo access just to download a build, and there's no auto-update — a device stays on whatever was manually downloaded. Fine for a small number of devices during prototyping; not acceptable for a real customer-site fleet. The real production path is MSIX packaging + an update agent (§8.3 of the architecture doc) — code-signed installers, versioned auto-updates, no source-repo credentials anywhere near a customer's device. Revisit once the app's shape is more stable (matches the doc's own build-sequence ordering) or before any real customer pilot, whichever comes first.

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
