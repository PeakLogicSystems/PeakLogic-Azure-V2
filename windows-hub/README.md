# PeakLogic Edge — Windows Hub Application

Implementation of `docs/architecture/windows-endpoint-application.md`. This is a **separate application** from the rest of the PeakLogicSystems monorepo — it runs on customer-site Windows hardware, not in AWS.

## Status (2026-07-16)

**Building now, second pass.** Not the full spec — see the doc's §11.1 build sequence. Steps 1–4 (Configuration, Security, Caching, Ingestion, Publishing, Backend client) and step 5 (Kiosk UI, first pass) are real and runnable. Watchdog service + Assigned Access (step 6) and MSIX packaging (step 7) are not started yet.

| Piece | Status |
|---|---|
| `PeakLogicEdge.Core` — Configuration, Security (DPAPI), Ingestion (Serial/REST-poll/Simulated), Normalization, Caching (SQLite durable queue), Publishing (MQTT), Backend (Cognito auth + REST client) | Real, compiling code |
| `PeakLogicEdge.Host` — console harness proving the pipeline works end to end | Real, runnable today |
| `PeakLogicEdge.App` — WinUI 3 kiosk UI, first pass (Dashboard/Ingestion Health real and live; Sites/Alerts/Tickets honest placeholders, not mock data) | Real, runnable today — see §"Kiosk UI" below |
| `PeakLogicEdge.Core.Tests` — unit tests for the pure/testable pieces (envelope shape, mappers, backoff, cache) | Real tests written, 17/17 passing |
| `PeakLogicEdge.Watchdog` (supervisor service) | Not started |
| `PeakLogicEdge.ConfigTool` | Not started |
| MSIX packaging, Assigned Access provisioning | Not started |

## Why the Host console app doesn't publish anything yet

Two real, disclosed reasons, not oversights:

1. **No AWS backend is deployed** (a deliberate hold — see `docs/architecture/README.md` and project memory for why). There is no real IoT Core endpoint, no real device certs, nothing to actually publish to.
2. Even once AWS exists, the Host harness uses `SimulatedIngestionSource` (no real sensor hardware attached yet), so there's nothing genuinely real to publish either.

What it *does* prove, right now, without either of those: real ingestion → real normalization → real durable SQLite queueing, the actual mechanism that makes telemetry delivery guaranteed rather than best-effort once a real backend and real hardware both exist. Run it and watch the queue grow — that's the offline-durability behavior working exactly as designed.

## Kiosk UI (`PeakLogicEdge.App`, added 2026-07-16, extended same day)

Real WinUI 3 app (unpackaged, `WindowsPackageType=None` — MSIX packaging is step 7, deliberately later per the architecture doc's own §11.1 sequencing), verified running end-to-end on real hardware via actual screenshots and UI Automation-driven interaction (not just compiled): first-run commissioning, branded navigation shell, live Dashboard, live Ingestion Health, local alert clearing, light/dark theming.

**Built against the real, already-working data layer, not mocked separately** — `Services/EdgeRuntimeService.cs` owns the exact same `IngestionOrchestrator`/`TelemetryBus`/`TelemetryCache` pipeline `PeakLogicEdge.Host` runs, just driving UI-bound observable state instead of `Console.WriteLine`. The Dashboard's "readings durably queued" count and Recent Readings list, and Settings' Ingestion Health list, are real, live data — not placeholders.

### First-run commissioning (`Views/SetupPage.xaml`)

A device with no local config shows a branded setup form (site name + tenant/claim code) instead of the normal shell — `EdgeConfig.Load()`'s own existing `FileNotFoundException` behavior ("this file is written once at commissioning... a missing config means this device was never properly commissioned") is the exact signal used to detect first run, not a new mechanism.

**No real backend registration call is attempted** — there is no deployed backend anywhere to call, and no hub-registration API contract has even been designed yet (Domain Model doesn't model a hub as a claimable entity the way it does individual Devices). Site details are saved locally via the existing `EdgeConfig.Save()`, and the UI discloses plainly that cloud registration is deferred until both a backend and that API contract exist — inventing a fake URL to probe against would have been less honest than this. Once saved, `ShellPage` loads the config and the Dashboard shows the real configured site name, not a hardcoded value.

### Branding & theming

Real PeakLogic brand identity (`Styles/Brand.xaml`), not invented independently — the purple/green mountain-peak mark and the "Peak"/"Logic" wordmark colors are reused exactly from `marketing/favicon.svg` and `frontend/tailwind.config.ts`'s `brand` palette, so the kiosk UI looks like the same product as the marketing site and tenant web app. `Controls/BrandHeader.xaml` is the reusable icon+wordmark lockup (nav pane header, setup screen) — its own header comment documents the correct bottom-alignment convention (translate the path data to a tight bounding box, `VerticalAlignment="Bottom"` on both elements) after an initial version got this visibly wrong by using an untranslated `Viewbox` that floated the icon with phantom padding.

Light/dark mode is user-toggled (Settings → Appearance), not the OS media-query strategy — mirrors the tenant web app's own SET-4 `ThemeContext` decision exactly. `Services/ThemeService.cs` persists the choice through `EdgeConfig.Ui.Theme`.

**The toggle only applies to the main content area — the nav pane is permanently dark-branded, matching marketing/index.html's own fixed-dark canvas.** Two real bugs, both found by actually toggling the switch and looking, not assumed correct from the API surface: (1) the wordmark's "Peak" text was originally bound to a theme-reactive brush and turned illegibly dark in light mode — marketing/index.html's own CSS (`.wordmark .peak { color: #FFFFFF }`) already establishes this as a fixed brand color, never meant to adapt to a surrounding theme, so it's now a fixed white brush instead (`Styles/Brand.xaml`'s `BrandWhiteBrush`). (2) Fixing that properly meant the nav pane's background can no longer follow the toggle either (a light pane would make that fixed-white text illegible again) — `ShellPage.xaml`'s `NavigationView` is pinned to `RequestedTheme="Dark"` permanently, and since that would otherwise cascade its fixed Dark down into `ContentFrame` too (NavigationView's own Content), `ThemeService` explicitly re-sets `RequestedTheme` directly on `ContentFrame` on every toggle to override that inherited value back to the user's real choice. Net effect: dark sidebar always, content area follows the toggle — verified via UI-Automation-driven interaction (not just code review) that both the pane stays legible and the content area genuinely changes.

### Local alert clearing (`PeakLogicEdge.Core/Caching/LocalAlertStore.cs`)

A genuinely new mechanism, not part of the original architecture doc — real alerting is, by design, computed server-side (`backend/ingest/rules.ts`'s `RULES_BY_CATEGORY`), not duplicated on the hub. This exists for a narrower, real need: once alerts eventually reach this hub (a future REST poll or cloud-pushed list once a backend exists), a technician standing at the kiosk needs to be able to locally dismiss ones that aren't real issues. "Cleared" is deliberately local-only state — it does not claim the cloud's own alert record was acknowledged (a separate, already-designed `PeakLogicApiClient.AcknowledgeAlertAsync` call this store does not attempt to make).

To give the Alerts screen something real to demonstrate against before a real alert source exists, `EdgeRuntimeService` runs a minimal, clearly-labeled **demo-only** threshold check (`salt_ppm` outside 2700–3400) on the simulated device's own readings — explicitly commented as not the real alerting pipeline, to be removed once real alerts flow to this device instead.

### Screen inventory per architecture doc §6.2

| Screen | Status |
|---|---|
| Dashboard | Real — live pending-queue count + recent readings + configured site name, all sourced from the actual running pipeline |
| Alerts | Real — local alert store with a working Clear action, fed by a disclosed demo-only threshold check pending real alerts |
| Settings → Appearance | Real — light/dark toggle, persisted |
| Settings → Ingestion Health | Real — live `IngestionOrchestrator.Health` per source |
| Sites / Tickets | Honest placeholder ("requires a connected backend") — this data lives in the cloud backend, which doesn't exist yet. Deliberately **not** faked, per this project's standing rule against repeating the tenant frontend's mock-data mistake |
| Site Detail / Asset Detail / Device Detail drill-down | Not built — no backend data to drill into yet |
| Control Panel (command/actuation) | Not built — gated behind Device & Command Security Architecture §5, same as everywhere else in this project |

**Real, disclosed gaps in this pass, not oversights:**
- **No runtime touch/pointer switching.** Architecture doc §6.3 specifies an `InputModeService` that swaps between `Styles.Touch.xaml`/`Styles.Pointer.xaml` based on the active input device. This pass ships one touch-first baseline (`Styles/Touch.xaml`, 48px+ tap targets) applied universally — functional for a touch display, but doesn't yet adapt when a mouse is plugged in.
- **Code-behind data binding, not a ViewModels/ layer.** The architecture doc's recommended project structure (§11.2) includes a `ViewModels/` folder; this pass wires pages directly to `EdgeRuntimeService`/`ShellContext` in code-behind. A pragmatic simplification for a first pass, not a long-term design decision.
- **Default window title/icon** — still says "WinUI Desktop," the WinUI 3 template default. Cosmetic, not fixed yet.
- **No revocation/edit path for a hub's site assignment once commissioned** — re-running Setup after `hub-config.json` already exists isn't wired up; would need to delete that file manually today.

## Building

Requires .NET 8 SDK (or later) — installed via `winget install Microsoft.VisualStudio.2022.Community` this session, which bundles it. Visual Studio itself (not just the SDK) is useful for `PeakLogicEdge.App`'s XAML designer, though not required — it was built and verified entirely from the CLI.

```
cd windows-hub
dotnet build PeakLogicEdge.sln            # builds all 4 projects (do NOT pass -r win-x64 at the
                                           # solution level — PeakLogicEdge.App already declares
                                           # its own RuntimeIdentifiers; MSBuild rejects a
                                           # solution-level RID override, NETSDK1134)
dotnet test test/PeakLogicEdge.Core.Tests/PeakLogicEdge.Core.Tests.csproj
dotnet run --project src/PeakLogicEdge.Host              # console harness
```

**Running the Kiosk UI directly** (not via `dotnet run`, since the built exe is what actually gets deployed to a hub device):
```
dotnet build src/PeakLogicEdge.App/PeakLogicEdge.App.csproj -c Debug -r win-x64
& "src\PeakLogicEdge.App\bin\x64\Debug\net8.0-windows10.0.19041.0\PeakLogicEdge.App.exe"
```

## Setting up a new hub device (interim process)

**Minimum spec: Windows 10 or 11, x64.** .NET 8 does not support Windows 8/8.1 or Windows RT — RT in particular can only run Windows Store apps and can never run this app, full stop, regardless of .NET version. Before provisioning any candidate hub device, check Settings → System → About: anything below Windows 10, or any device restricted to Windows RT (Store-apps-only, cannot be upgraded to a real Windows 10/11), cannot be used.

**Current distribution mechanism: GitHub Releases**, tagged `edge-vX.Y.Z` (a separate tag namespace from the platform's own `vX.Y.Z` releases, since they share this repo). This is explicitly an interim choice, not the production path — see the note below.

1. On the hub device, sign into GitHub in a browser (needs an account with access to this private repo).
2. Go to the repo's Releases page and download the **latest** `edge-vX.Y.Z` asset (currently `edge-v0.2.0` — `edge-v0.1.0` has a known Windows Explorer extraction bug, see below, don't use it).
3. Extract it to a folder (e.g. `C:\PeakLogicEdge`) — Windows' built-in "Extract All" should work fine as of v0.1.1+.
4. Run `PeakLogicEdge.App.exe` — the real kiosk UI, not `PeakLogicEdge.Host.exe` (the console harness is still built and useful for headless testing, but isn't published as a release asset; build it from source if needed). First launch shows the Setup screen — fill in a site name and tenant/claim code, click "Register this hub," then you land on the Dashboard. It's self-contained (bundles its own .NET + Windows App SDK runtime) — nothing else needs to be installed first, **except one real OS-level prerequisite, below**.

**Known prerequisite, found 2026-07-16 on a real hub device: the Visual C++ Redistributable (x64) must be installed separately.** Symptom: double-clicking `PeakLogicEdge.App.exe` does nothing at all — no window, no flash, no error dialog, since the process fails to load a native dependency before any managed code (including error handling) ever runs. `WindowsAppSDKSelfContained=true` bundles the .NET runtime and Windows App SDK's own managed/native files into the app's output folder, but Windows App SDK's native interop layer still depends on the Visual C++ runtime DLLs, which are a separate OS-level component self-contained .NET deployment does not bundle — a documented characteristic of unpackaged WinUI 3 deployment, not specific to this app. Fix: install the [Visual C++ Redistributable (x64)](https://aka.ms/vs/17/release/vc_redist.x64.exe) (Microsoft's official, permanent download link) on the hub device once, then launch normally. Not yet decided whether to bundle this redistributable's own installer alongside future release zips (would make this fully self-contained with zero extra steps) versus documenting it as a one-time prerequisite — flagged here rather than silently worked around.

**Known issue, fixed in `edge-v0.1.1` (2026-07-15): `edge-v0.1.0`'s zip fails to extract with Windows' built-in tool.** Root cause: that zip was built with `tar -a -cf` (bsdtar), a workaround for a broken `Microsoft.PowerShell.Archive` module at the time — the file was always byte-for-byte intact, but Windows Explorer's shell zip handler couldn't parse that zip's structure and reported "the compressed folder is empty." Fixed by rebuilding with **.NET's own `System.IO.Compression.ZipFile`** (the same zip-writing code Windows itself uses), verified via a full extract-and-check round trip before publishing. **Use this method for every future release**, not `tar`:
```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  'publish/PeakLogicEdge', 'publish/dist/PeakLogicEdge-edge-vX.Y.Z-win-x64.zip',
  [System.IO.Compression.CompressionLevel]::Optimal, $false)
```

**To publish a new release build** (from the dev machine) — publish the App (the real kiosk UI, `edge-v0.2.0`+); publish Host instead only if you specifically need the headless console harness:
```
cd windows-hub
dotnet publish src/PeakLogicEdge.App -c Release -r win-x64 --self-contained true -o publish/PeakLogicEdge
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
│   ├── PeakLogicEdge.Host/       # console harness — still useful for headless testing
│   └── PeakLogicEdge.App/        # WinUI 3 kiosk UI — the real eventual shell
│       ├── Views/                # SetupPage, ShellPage, Dashboard, Sites, Alerts, Tickets, Settings
│       ├── Controls/             # BrandHeader — reusable icon+wordmark lockup
│       ├── Services/             # EdgeRuntimeService (owns the real Core pipeline), ThemeService, ShellContext
│       └── Styles/                # Touch.xaml (48px+ touch-first baseline), Brand.xaml (PeakLogic palette)
└── test/
    └── PeakLogicEdge.Core.Tests/
```
