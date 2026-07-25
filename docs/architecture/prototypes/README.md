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

### Unified-platform views (v2.0, added 2026-07-25)

The demo now also makes the **unified-platform reframe** operable — an *Operations* nav group plus a one-click **PeakAssist** help affordance (top bar), backing PRD/SRS §5.18–§5.22:

- **PeakView360** — a live HMI/SCADA operator screen for a wastewater plant (the beachhead): process-value tiles with severity accents, a **docked alarm panel** (with AI-insight context and per-alarm "?" deep-links into help), and a **multi-pen historian** trend. States the "above SCADA / Hub-local offline" framing on the page.
- **PeakLogic Hubs** — the on-prem edge fleet: status, protocols, tags acquired, agent + PeakAssist content version, last-seen; shows an offline Hub and a content-version-behind Hub.
- **CMMS · Work Orders** — the work-order queue (alarm-driven + PM) across the `dispatched → accepted → on_site → completed` funnel, plus PM schedules with next-due.
- **Compliance** — an automated NPDES/**DMR** parameter summary with a real exceedance and a coverage gap (shown, never interpolated) and the operator-is-filer-of-record framing.
- **PeakAssist** — the top-bar Help button opens a **contextual** drawer (scoped to the current screen), with an "available offline on this site's Hub" badge, a screen guide, how-to steps, and troubleshooting. An alarm's "?" deep-links to that alarm type's explanation.

**Coherence rework (2026-07-25):** these views are now **derived from the real `TENANTS`/`PARTNERS` data**, not invented. A real wastewater plant (Riverside Water Reclamation Facility) was added as a site on **Bayfront Municipal District** (serviced by **ACE Septic & Waste**), so it flows through the fleet map, devices, firmware, PeakView360, Hubs, CMMS, and Compliance consistently (all aggregates derive bottom-up from device health). The **CMMS view demonstrates the CMMS↔partner↔customer chain and its segregation**: each work order derives from a real customer alarm and is dispatched to that customer's servicing channel partner (`tenant.partnerId → partnerFor`), with the assigned technician drawn from that partner's roster; the **Customer** and **Dispatched to** cells are click-through into the respective scoped act-as context. A callout spells out the segregation (customer sees only their own; partner sees only their accounts' work orders + techs; staff sees all via audited fan-out). Hubs are one-per-site derived (status from device state); Compliance/DMR is tied to the real plant + permit.

Verified in a headless browser: all views render; the CMMS Customer link enters act-as tenant (with the "Acting" banner) and the Partner link enters act-as partner; the plant flows into Fleet/Devices; the contextual help drawer opens; **zero console errors**.

**Scope caveats (deliberate):** all data is illustrative and lives in the file; there is no auth, no API, no persistence (a refresh resets state). Interactions model the *intended* behavior of endpoints that already exist or are already designed — they do not call a backend. This is the design target for roadmap items 8–9 (build the Super-Console frontend on the render-everything/act-as model + a shared UI component package) and for the PeakView360/Hub/CMMS/Compliance/PeakAssist build, not an implementation of them.
