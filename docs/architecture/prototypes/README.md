# Architecture Prototypes

Clickable, self-contained prototypes that make an architecture decision tangible. These are **communication artifacts, not production code** — no build step, no dependencies, no real data. They exist to pressure-test a design by letting people operate it, and to align on UX before any real frontend work starts.

| File | What it demonstrates | Backs |
|------|----------------------|-------|
| [`super-console-demo.html`](super-console-demo.html) | The internal **Super-Console** — the Cisco/Meraki-style single pane of glass | [Target Reference Architecture §5](../target-reference-architecture.md) · [Azure Review Roadmap §3](../azure-review-and-improvement-roadmap.md) |

## `super-console-demo.html`

Open it in any browser (it's a single HTML file — inline CSS/JS, no server, no network). It renders the target management platform as something you *operate*, so the architecture's load-bearing ideas are felt rather than read:

- **Fleet Overview** — global health assembled by **fan-out** (N per-org scoped reads, never a cross-tenant query — stated on the page).
- **Act-as, not impersonation** — "Manage" a tenant *or* a channel partner to enter an audited act-as context (persistent banner, attributed to the staff `oid`); every enter/exit and command writes to the Audit Log view.
- **Tenant drill-down** — Sites / Assets / Devices / Alerts / Tickets / Users, the same views the customer sees, RLS-scoped.
- **Partner drill-down** — attributed accounts, territories, technicians, routes, and white-label branding in the separate `PeakLogicPartners` directory.
- **Device-twin drawer** — click any device: desired properties (`cloud → device`) vs. reported properties (`device → cloud`) with a live sync badge, plus **Direct Methods** (Ping / Reset / Push config now). "Push config now" moves an un-configured device to `configured` and populates its reported twin.
- **Zero-touch registration** — "Register devices" creates cloud **intent records** (individual or DPS enrollment-group) in state `registered`; they appear in the global inventory *awaiting first connection*, then can be configured via twin push.
- Brand-accurate: command rail pinned dark in both themes (matching the real Edge app), light/dark content plane, semantic severity color kept distinct from the purple accent, monospace instrument type for device IDs and telemetry.

**Scope caveats (deliberate):** all data is illustrative and lives in the file; there is no auth, no API, no persistence (a refresh resets state). Interactions model the *intended* behavior of endpoints that already exist or are already designed — they do not call a backend. This is the design target for roadmap items 8–9 (build the Super-Console frontend on the render-everything/act-as model + a shared UI component package), not an implementation of them.
