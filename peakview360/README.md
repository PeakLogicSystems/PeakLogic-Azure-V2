# PeakView360 — Operator SPA

The operator's face of the platform: a browser-served HMI/SCADA surface
(`docs/architecture/peakview360-hmi-architecture.md`). A sibling app to
`frontend/` and `channel-partner-portal/` — same React + Vite + Tailwind stack
and PeakLogic brand system. In production it is served by the on-site **PeakLogic
Hub over the LAN** (offline-capable) and renders live from the Hub + history from
the cloud (the dual-source model).

## Run

```bash
cd peakview360
npm install
npm run dev        # http://localhost:5175  (distinct port from 5173 / 5174)
npm run build      # tsc + vite build
npm run typecheck
```

## Status (2026-07-26) — first slice, preview data (honest)

**No backend is deployed**, so the SPA runs in **PREVIEW mode** against a live
*simulation* (`src/data/preview.ts`), clearly badged "Preview data" in the top
bar so it is never mistaken for a real fleet. The simulation is deliberately
coherent: alarms are derived from the same live process values the tiles show
(via the same kind of threshold rules the platform runs, `backend/ingest/
rules.ts`), so alarms fire and **auto-clear** with the floor — the real alarm
lifecycle, not a scripted list. One sensor is intentionally **offline** (no
data), exercising the silent/offline state device-silence detection is built for.

Built vs. designed (of the five surfaces, §3.2):

| Surface | Status |
|---|---|
| Real-time operator screen (PV-1) | ✅ Built — live process-value tiles, equipment state, trend |
| Alarm management (PV-2) | ✅ Built — docked panel, severity rail, acknowledge, AI/threshold context, PeakAssist deep-link |
| Historian (PV-3) | Placeholder — honest "designed, not built" (needs telemetry history) |
| Equipment dashboard (PV-4) | Placeholder — needs per-asset telemetry + PdM score |
| Facility visualization (PV-5) | Placeholder — 2D schematic |

**Wiring to the real API** (`GET /v1/hmi-screens`, `/v1/tags`, `/v1/alerts`,
`/v1/telemetry`, + the Hub-LAN live feed) is the post-infra step: set
`VITE_API_URL` and the `PREVIEW` flag flips off (`src/api.ts`).

## Boundary (load-bearing)

PeakView360 **visualizes and supervises — it never issues safety-rated control.**
Setpoints and interlocks stay in the plant's certified control system. PeakLogic
sits above SCADA.
