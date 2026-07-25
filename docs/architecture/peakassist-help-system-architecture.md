# PeakAssist — Help System Architecture

**Company:** PeakLogic  ·  **Project codename:** Project Vantage
**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Status:** 🟡 Draft v0.1 (2026-07-25) — net-new design artifact (Phase 3 of `unified-platform-integration-plan.md`)
**Depends on:** [PRD](prd.md) §5.22 · [SRS](srs.md) §3.24 · [Domain Model](domain-model.md) §2.14 · [Database Schema](database-schema.md) §4.8 · [PeakLogic Hubs (Windows Endpoint)](windows-endpoint-application.md) · [PeakView360](peakview360-hmi-architecture.md)
**Design target (clickable):** [`prototypes/super-console-demo.html`](prototypes/super-console-demo.html) — the one-click PeakAssist help drawer
**Built already:** `backend/shared/peakassist.ts` (`resolveHelp`/`resolveAlarmHelp`, unit-tested)

---

## 0. Thesis

**PeakAssist is a first-class product pillar, not documentation.** It is what makes an industrial platform usable by a small-town operator who is not a software person — and it is the most operator-friendly thing MooreView does, elevated. It is **one click from anywhere, contextual to the current screen, works offline on the Hub, and syncs from the cloud** — and no PeakLogic screen ships without its help entry.

## 1. Scope
**In:** the content model, contextual resolution, the one-click affordance, offline-via-Hub delivery, cloud-authoring + sync, the two delivery surfaces (HMI + cloud), and the no-screen-without-help governance gate.
**Out:** the screens' own behavior (PeakView360 / the cloud app), the Hub runtime that serves the offline bundle (PeakLogic Hubs), authoring workflow tooling beyond the content model.

## 2. Principles (from the vision, non-negotiable)
1. **Operator-friendly tone, always** — plain language, short sentences, written for someone holding a wrench.
2. **One click from anywhere** — a persistent Help affordance on every PeakView360 screen and every cloud page.
3. **Contextual by default** — Help opens scoped to the screen you're on.
4. **First-class in the roadmap** — PeakAssist v1 ships in the MVP.

## 3. Content model

Structured content, not a PDF. Six content types (shipped as `help_content.type` CHECK, migration `1784142240000`):
`screen_guide` · `procedure` · `alarm_explanation` · `troubleshooting` · `playbook` · `glossary`.

- **`help_content`** (global reference catalog, non-RLS — PeakLogic-authored, same for every tenant): `help_context_key` (the key an `hmi_screens` row or cloud page declares), `type`, `title`, `body`, `alarm_type` (deep-links an `alerts.type` value to its explanation), `content_version`.
- **`help_content_bundles`** (global, non-RLS): a versioned, checksummed content set (`version`, `published_at`, `checksum`). A Hub's `hubs.peakassist_content_version` points at one of these.
- **Per-tenant overrides** are a deferred addition (would add a nullable `tenant_id` + the Policy-Engine platform-plus-override policy — not built until a real need; Database Schema §4.8).

## 4. Contextual resolution (built)

`backend/shared/peakassist.ts` is the resolver, already implemented and unit-tested:
- **`resolveHelp(catalog, contextKey, {alarmType?})`** — returns the ordered help for a screen: screen guide → procedures → troubleshooting → playbooks → (alarm explanations, glossary). When opened from an active alarm, that alarm's explanation is **prepended** (PA-3), without duplication.
- **`resolveAlarmHelp(catalog, alarmType)`** — the deep-link target for an alarm's "?", or `null` (caller falls back to the context index — never a dead link, PA-2 error case).
The resolver is **pure and I/O-free**, so it runs identically whether the catalog was loaded from the cloud DB or from a Hub's offline bundle — one code path, both surfaces.

## 5. Delivery (the hard requirement: offline)

- **Every PeakLogic Hub carries a complete PeakAssist bundle.** During an internet outage, an operator on PeakView360 still has the *entire* help system — served locally by the Hub (HUB-5 / PA-4). This is non-negotiable: the moment you most need troubleshooting help is often when connectivity is down.
- **Cloud is the source of truth; Hubs pull deltas.** Content is authored/versioned in the cloud CMS (`help_content_bundles`). A Hub pulls a newer bundle in the background when it has connectivity, verifies the `checksum`, and updates `hubs.peakassist_content_version`. The operator sees "Help content current as of …", so stale content is visible, never silent (PA-5).
- **Two audiences, one content model** — SCADA/HMI users get PeakAssist inside PeakView360 (offline via the Hub); cloud users (supervisors, compliance, service providers) get the same content in the browser at latest (PA-6).

## 6. The one-click affordance & governance
- A persistent Help control on every PeakView360 screen and cloud page; each surface declares a `help_context_key`. The affordance opens the drawer scoped to that key (design target: the prototype's help drawer — screen guide, how-to steps, troubleshooting, offline badge).
- **Governance gate (PA-7):** no screen ships without a declared `help_context_key` and at least a `screen_guide` for it — enforced as a release check, the same discipline as "docs stay current every release" already standing for PeakLogic. A screen missing a key falls back to the top-level index (never a dead button).

## 7. Authoring
Content lives in the repo/CMS as structured Markdown with a `help_context` key + `version`, reviewed like code, seeded from the existing `sysadmin-guides/` and `user-guides/` corpus. This lets the existing guide material become the seed and holds PeakAssist to the same currency discipline.

## 8. Honesty ledger (real vs. design)
- **Real today:** the content schema (`help_content`/`help_content_bundles`); the **resolver** (`backend/shared/peakassist.ts`, tested); the **authored v1 content corpus** (`backend/shared/peakassist-content.ts`, `PEAKASSIST_CONTENT` — screen guides, alarm explanations for every emitted `alerts.type`, procedures, troubleshooting, playbooks, glossary; 17 tests enforcing the PA-7 every-screen-has-a-guide and PA-3 every-alarm-is-explained gates against the resolver); the clickable help-drawer design target.
- **Design-stage (not built):** the cloud PeakAssist CMS, the DB-seed/Hub bundle-sync delivery of the corpus, and the in-app Help affordance/drawer in a production client. The corpus is authored in the repo (the source of truth) but not yet seeded into a live `help_content` table or bundled onto a Hub — that is the delivery step.

## 9. Open questions
1. **Bundle format & sync** — packaging, delta strategy, checksum/signature, and the Hub-side pull mechanism (PeakLogic Hubs runtime).
2. **Authoring pipeline** — Markdown-in-repo → `help_content` build step; who authors, and the review gate.
3. **Search** — global search + browsable index behavior (PA-2) beyond context-scoped resolution.

## 10. Revision history
| Version | Date | Notes |
|---|---|---|
| Draft v0.1 | 2026-07-25 | Initial PeakAssist architecture — consolidates PRD §5.22 / SRS §3.24 / Domain Model §2.14 / schema §4.8 / the built resolver / the prototype. Content model, contextual resolution (built), offline-via-Hub delivery, cloud-sync, two surfaces, no-screen-without-help gate. CMS + sync + client affordance design-stage. |
