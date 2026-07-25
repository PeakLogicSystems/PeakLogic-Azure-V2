/**
 * PeakAssist — seed content corpus (v1).
 *
 * The repo-authored source of truth for PeakAssist help (PeakAssist Help System
 * Architecture §3/§7). This is what gets seeded into `help_content` in the
 * cloud and bundled offline onto every PeakLogic Hub; the pure resolver
 * (`peakassist.ts`) consumes it identically from either source.
 *
 * Operator-friendly tone by rule: plain language, short sentences, written for
 * someone holding a wrench (PeakAssist principle 1). Every screen that declares
 * a help-context key has a `screen_guide` (governance gate PA-7), and every
 * emitted `alerts.type` has an `alarm_explanation` that its "?" deep-links to
 * (PA-3). Both invariants are enforced by `peakassist-content.test.ts`.
 */

import type { HelpContentItem } from './peakassist';

/** The bundle version a Hub reports as its offline content version (`hubs.peakassist_content_version`). */
export const PEAKASSIST_CONTENT_VERSION = '2026.07.1';

/**
 * Screen contexts that MUST carry a screen guide (the no-screen-without-help
 * gate, PA-7). A new screen adds its key here and authors a guide, or the
 * governance test fails.
 */
export const SCREEN_CONTEXT_KEYS = [
  'fleet',
  'pv360.overview',
  'hubs',
  'cmms',
  'compliance',
] as const;

/**
 * Alarm types the platform actually emits (`alerts.type`), each of which MUST
 * have an alarm explanation. `prediction`/`prescription` are reserved (not yet
 * emitted) so they are intentionally absent.
 */
export const EMITTED_ALARM_TYPES = ['threshold', 'anomaly', 'device_silent'] as const;

export const PEAKASSIST_CONTENT: HelpContentItem[] = [
  // ── Screen guides ────────────────────────────────────────────────────────
  {
    id: 'sg-fleet',
    helpContextKey: 'fleet',
    type: 'screen_guide',
    title: 'About Fleet Overview',
    body:
      'This is every site you manage, in one view. Green means healthy, amber means worth a look, red means it needs attention now. The top tiles summarize the whole estate; the "needs attention" list is sorted worst-first. Click any organization to open it in its own scoped view.',
  },
  {
    id: 'sg-pv360',
    helpContextKey: 'pv360.overview',
    type: 'screen_guide',
    title: 'About this operator screen',
    body:
      'Your live plant view. Each tile is a current reading from the equipment; the color is its state (green fine, amber off-setpoint, red critical). The alarm panel lists what needs attention, and the historian shows recent trends. This screen keeps working even if the internet drops — the on-site Hub serves it locally.',
  },
  {
    id: 'sg-hubs',
    helpContextKey: 'hubs',
    type: 'screen_guide',
    title: 'About PeakLogic Hubs',
    body:
      'The small box installed at each site. A Hub reads your equipment and PLCs, watches for alarms locally, shows the operator screen on-site even without internet, and forwards data to the cloud. Green means online and syncing, amber means it is being set up, red means it is offline.',
  },
  {
    id: 'sg-cmms',
    helpContextKey: 'cmms',
    type: 'screen_guide',
    title: 'About Work Orders & PM',
    body:
      'Maintenance work in one place. A critical or anomaly alarm automatically creates a work order and sends it to the servicing partner; preventive-maintenance (PM) schedules create work orders when they come due. Each work order moves through dispatched → accepted → on-site → completed.',
  },
  {
    id: 'sg-compliance',
    helpContextKey: 'compliance',
    type: 'screen_guide',
    title: 'About Compliance (DMR)',
    body:
      'Automatic regulatory reporting. PeakLogic compiles the period’s monitored values into a regulator-ready draft (a Discharge Monitoring Report for wastewater). Review each parameter against its permit limit, then file it through your normal channel. You remain the filer of record — PeakLogic does not file for you.',
  },

  // ── Alarm explanations (deep-linked by alarm type, PA-3) ─────────────────
  {
    id: 'ae-threshold',
    helpContextKey: 'pv360.alarms',
    type: 'alarm_explanation',
    alarmType: 'threshold',
    title: 'Threshold alarm',
    body:
      'A reading crossed a configured limit (for example, a level above its setpoint). What to check: compare the value to its normal range and the recent trend on this asset. If it is a real process change, acknowledge it and address the cause; if it looks like a bad reading, check the sensor.',
  },
  {
    id: 'ae-anomaly',
    helpContextKey: 'pv360.alarms',
    type: 'alarm_explanation',
    alarmType: 'anomaly',
    title: 'AI anomaly alarm',
    body:
      'A reading deviated from this asset’s own learned normal behavior — not a fixed limit. It is capped at "warning" and is not a confirmed fault on its own. What to check: look at the asset and the trend behind the value; a rising motor current, for example, can hint at wear. Create a work order if it warrants a look.',
  },
  {
    id: 'ae-device_silent',
    helpContextKey: 'pv360.alarms',
    type: 'alarm_explanation',
    alarmType: 'device_silent',
    title: 'Device silent alarm',
    body:
      'A device stopped sending readings when one was expected — different from a bad reading. It may be offline, disconnected, or failed. What to check: confirm the device has power and its Hub is online (see PeakLogic Hubs). It clears itself once the device reports again.',
  },

  // ── Procedures (how-to) ──────────────────────────────────────────────────
  {
    id: 'proc-ack-alarm',
    helpContextKey: 'pv360.overview',
    type: 'procedure',
    title: 'Acknowledge an alarm',
    body:
      '1) Find the alarm in the alarm panel. 2) Read its insight line (threshold, or an AI anomaly score). 3) Click Acknowledged to mark it seen so your team knows someone is on it. 4) If it needs a visit, create a work order from it — that dispatches a technician.',
  },
  {
    id: 'proc-historian',
    helpContextKey: 'pv360.overview',
    type: 'procedure',
    title: 'Read a trend in the historian',
    body:
      '1) Open the historian panel. 2) Pick the metrics you want to overlay (for example dissolved oxygen and flow). 3) Choose a range — last 24 hours, 7 days, 30 days, or custom. 4) Watch where lines diverge; that is usually where a problem starts. Export to CSV if you need it for a record.',
  },
  {
    id: 'proc-generate-pm',
    helpContextKey: 'cmms',
    type: 'procedure',
    title: 'Generate due preventive-maintenance work orders',
    body:
      '1) On Work Orders, click "Generate due PM work orders". 2) Every PM schedule that has reached its due date creates a work order. 3) Assign each to a technician if it is not already. Overdue schedules generate one work order for the next occurrence, not a backlog.',
  },
  {
    id: 'proc-generate-dmr',
    helpContextKey: 'compliance',
    type: 'procedure',
    title: 'Generate a DMR draft',
    body:
      '1) On Compliance, confirm the reporting period. 2) Click "Generate DMR draft". 3) Review each parameter against its permit limit — exceedances and coverage gaps are flagged, never hidden or filled in. 4) File the reviewed report through your normal regulator channel.',
  },

  // ── Troubleshooting ──────────────────────────────────────────────────────
  {
    id: 'tr-no-live-data',
    helpContextKey: 'pv360.overview',
    type: 'troubleshooting',
    title: 'No live data on a screen',
    body:
      'First check the site’s Hub is online (PeakLogic Hubs). If the Hub is offline, the site still runs locally but cloud updates pause. If a single tile is frozen, that device may be silent — a "device silent" alarm will confirm it. If everything is blank, reload the screen.',
  },
  {
    id: 'tr-hub-offline',
    helpContextKey: 'hubs',
    type: 'troubleshooting',
    title: 'A Hub shows offline',
    body:
      'The site keeps operating on the Hub’s local copy of the operator screen; only cloud sync is paused. Check site connectivity (network/power at the Hub), not the plant equipment. Once the Hub reconnects, it forwards the data it buffered while offline and catches up automatically.',
  },

  // ── Playbooks (role workflows) ───────────────────────────────────────────
  {
    id: 'pb-daily-rounds',
    helpContextKey: 'pv360.overview',
    type: 'playbook',
    title: 'Operator daily rounds',
    body:
      'Start on the operator screen: scan the tiles for anything amber or red. Clear the alarm panel — acknowledge what you have seen, create work orders for what needs a visit. Glance at the historian for anything trending the wrong way. Note anything for the next shift.',
  },
  {
    id: 'pb-monthly-compliance',
    helpContextKey: 'compliance',
    type: 'playbook',
    title: 'Monthly compliance filing',
    body:
      'Near period end, open Compliance and generate the DMR draft. Review every parameter against its permit limit; investigate and document any exceedance, and note any coverage gap. When satisfied, file through your regulator channel. The immutable audit trail backs the numbers you filed.',
  },

  // ── Glossary (global) ────────────────────────────────────────────────────
  { id: 'gl-do', helpContextKey: 'glossary', type: 'glossary', title: 'Dissolved Oxygen (DO)', body: 'How much oxygen is dissolved in the water (mg/L). In an aeration basin it needs to stay above the setpoint: too little starves the biology, too much wastes blower energy.' },
  { id: 'gl-orp', helpContextKey: 'glossary', type: 'glossary', title: 'ORP', body: 'Oxidation-reduction potential (mV) — a measure used in the anoxic zone to confirm the right reactions (like denitrification) are happening where they should.' },
  { id: 'gl-ras', helpContextKey: 'glossary', type: 'glossary', title: 'RAS (Return Activated Sludge)', body: 'Sludge pumped from the clarifier back to the front of the process to keep the biology recirculating. If the RAS pump stops, the process backs up.' },
  { id: 'gl-dmr', helpContextKey: 'glossary', type: 'glossary', title: 'DMR (Discharge Monitoring Report)', body: 'A Discharge Monitoring Report — the periodic report a permitted wastewater facility files with the regulator, summarizing monitored values against permit limits.' },
  { id: 'gl-hub', helpContextKey: 'glossary', type: 'glossary', title: 'PeakLogic Hub', body: 'The on-site box that reads your equipment and PLCs, evaluates alarms locally, serves the operator screen and this help offline, and forwards data to the cloud.' },
  { id: 'gl-tag', helpContextKey: 'glossary', type: 'glossary', title: 'Tag', body: 'A named point that maps a raw source (a PLC register or a device metric) to a standard reading shown on your screens — so everything speaks one vocabulary regardless of the underlying device.' },
];
