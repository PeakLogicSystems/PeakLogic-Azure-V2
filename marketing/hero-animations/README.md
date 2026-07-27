# Website Hero Animations (archive)

Standalone, self-contained snapshots of the marketing site's hero-section visual, kept for reference/comparison. Neither file is linked from the live site — they're archives, opened directly in a browser.

| File | What it is | Status |
|------|-----------|--------|
| `website-hero-animation-1.html` | The original hand-drawn SVG scene (elevated water tower, control building/hub console, clarifier basin, process tanks, septic tanker, field technician with tablet) — animated flow lines, pulsing sensor dots, a legend | Archived 2026-07-27 |
| `website-hero-animation-2.html` | The isometric sensor-hardware photo (`../hero-sensors.png`, user-supplied) with 5 flashing sensor-point markers overlaid at the hardware's actual telemetry points | **Live** in `../index.html`'s hero since 2026-07-27 |

Switching back to Animation 1 means restoring its CSS block + the `heroArt()`-equivalent markup into `../index.html`'s `<div id="hero-art">` — the exact source is preserved verbatim in animation 1's file above.

**`../hero-sensors.png` background removal (2026-07-27):** the live image has real alpha transparency where the source's near-white background and "AI-Generated" badge used to be — not a cropped/masked box, actual per-pixel alpha (background-color-distance threshold + a small connected-component pass to clean up stray specks; no ImageMagick/PIL available in-session, so this was done with a short Node script + `pngjs`, kept in the session scratchpad, not committed). `../hero-sensors-original.png` is the untouched original (opaque background, badge intact) kept alongside it in case the source is ever needed again.
