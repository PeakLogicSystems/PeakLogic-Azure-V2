-- PeakAssist seed content (v1) — GENERATED from backend/shared/peakassist-content.ts.
-- Do NOT hand-edit. Regenerate from the corpus (the source of truth); the
-- golden-file test peakassist-seed.test.ts fails if this drifts from it.
--
-- Projects the authored help corpus into the global help_content catalog + a
-- help_content_bundles row (PeakAssist Help System Architecture §3/§5). Both
-- are global reference tables (non-RLS, PeakLogic-authored). Idempotent by
-- re-seed: the Up migration clears this content_version's rows before inserting.

-- Up Migration

INSERT INTO help_content_bundles (version, checksum, notes) VALUES
  ('2026.07.1', 'fnv1a-e17daab5', 'PeakAssist v1 seed — 22 items, generated from peakassist-content.ts')
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum, notes = EXCLUDED.notes;

DELETE FROM help_content WHERE content_version = '2026.07.1';

INSERT INTO help_content (help_context_key, type, title, body, alarm_type, content_version) VALUES
  ('fleet', 'screen_guide', 'About Fleet Overview', 'This is every site you manage, in one view. Green means healthy, amber means worth a look, red means it needs attention now. The top tiles summarize the whole estate; the "needs attention" list is sorted worst-first. Click any organization to open it in its own scoped view.', NULL, '2026.07.1'),
  ('pv360.overview', 'screen_guide', 'About this operator screen', 'Your live plant view. Each tile is a current reading from the equipment; the color is its state (green fine, amber off-setpoint, red critical). The alarm panel lists what needs attention, and the historian shows recent trends. This screen keeps working even if the internet drops — the on-site Hub serves it locally.', NULL, '2026.07.1'),
  ('hubs', 'screen_guide', 'About PeakLogic Hubs', 'The small box installed at each site. A Hub reads your equipment and PLCs, watches for alarms locally, shows the operator screen on-site even without internet, and forwards data to the cloud. Green means online and syncing, amber means it is being set up, red means it is offline.', NULL, '2026.07.1'),
  ('cmms', 'screen_guide', 'About Work Orders & PM', 'Maintenance work in one place. A critical or anomaly alarm automatically creates a work order and sends it to the servicing partner; preventive-maintenance (PM) schedules create work orders when they come due. Each work order moves through dispatched → accepted → on-site → completed.', NULL, '2026.07.1'),
  ('compliance', 'screen_guide', 'About Compliance (DMR)', 'Automatic regulatory reporting. PeakLogic compiles the period’s monitored values into a regulator-ready draft (a Discharge Monitoring Report for wastewater). Review each parameter against its permit limit, then file it through your normal channel. You remain the filer of record — PeakLogic does not file for you.', NULL, '2026.07.1'),
  ('pv360.alarms', 'alarm_explanation', 'Threshold alarm', 'A reading crossed a configured limit (for example, a level above its setpoint). What to check: compare the value to its normal range and the recent trend on this asset. If it is a real process change, acknowledge it and address the cause; if it looks like a bad reading, check the sensor.', 'threshold', '2026.07.1'),
  ('pv360.alarms', 'alarm_explanation', 'AI anomaly alarm', 'A reading deviated from this asset’s own learned normal behavior — not a fixed limit. It is capped at "warning" and is not a confirmed fault on its own. What to check: look at the asset and the trend behind the value; a rising motor current, for example, can hint at wear. Create a work order if it warrants a look.', 'anomaly', '2026.07.1'),
  ('pv360.alarms', 'alarm_explanation', 'Device silent alarm', 'A device stopped sending readings when one was expected — different from a bad reading. It may be offline, disconnected, or failed. What to check: confirm the device has power and its Hub is online (see PeakLogic Hubs). It clears itself once the device reports again.', 'device_silent', '2026.07.1'),
  ('pv360.overview', 'procedure', 'Acknowledge an alarm', '1) Find the alarm in the alarm panel. 2) Read its insight line (threshold, or an AI anomaly score). 3) Click Acknowledged to mark it seen so your team knows someone is on it. 4) If it needs a visit, create a work order from it — that dispatches a technician.', NULL, '2026.07.1'),
  ('pv360.overview', 'procedure', 'Read a trend in the historian', '1) Open the historian panel. 2) Pick the metrics you want to overlay (for example dissolved oxygen and flow). 3) Choose a range — last 24 hours, 7 days, 30 days, or custom. 4) Watch where lines diverge; that is usually where a problem starts. Export to CSV if you need it for a record.', NULL, '2026.07.1'),
  ('cmms', 'procedure', 'Generate due preventive-maintenance work orders', '1) On Work Orders, click "Generate due PM work orders". 2) Every PM schedule that has reached its due date creates a work order. 3) Assign each to a technician if it is not already. Overdue schedules generate one work order for the next occurrence, not a backlog.', NULL, '2026.07.1'),
  ('compliance', 'procedure', 'Generate a DMR draft', '1) On Compliance, confirm the reporting period. 2) Click "Generate DMR draft". 3) Review each parameter against its permit limit — exceedances and coverage gaps are flagged, never hidden or filled in. 4) File the reviewed report through your normal regulator channel.', NULL, '2026.07.1'),
  ('pv360.overview', 'troubleshooting', 'No live data on a screen', 'First check the site’s Hub is online (PeakLogic Hubs). If the Hub is offline, the site still runs locally but cloud updates pause. If a single tile is frozen, that device may be silent — a "device silent" alarm will confirm it. If everything is blank, reload the screen.', NULL, '2026.07.1'),
  ('hubs', 'troubleshooting', 'A Hub shows offline', 'The site keeps operating on the Hub’s local copy of the operator screen; only cloud sync is paused. Check site connectivity (network/power at the Hub), not the plant equipment. Once the Hub reconnects, it forwards the data it buffered while offline and catches up automatically.', NULL, '2026.07.1'),
  ('pv360.overview', 'playbook', 'Operator daily rounds', 'Start on the operator screen: scan the tiles for anything amber or red. Clear the alarm panel — acknowledge what you have seen, create work orders for what needs a visit. Glance at the historian for anything trending the wrong way. Note anything for the next shift.', NULL, '2026.07.1'),
  ('compliance', 'playbook', 'Monthly compliance filing', 'Near period end, open Compliance and generate the DMR draft. Review every parameter against its permit limit; investigate and document any exceedance, and note any coverage gap. When satisfied, file through your regulator channel. The immutable audit trail backs the numbers you filed.', NULL, '2026.07.1'),
  ('glossary', 'glossary', 'Dissolved Oxygen (DO)', 'How much oxygen is dissolved in the water (mg/L). In an aeration basin it needs to stay above the setpoint: too little starves the biology, too much wastes blower energy.', NULL, '2026.07.1'),
  ('glossary', 'glossary', 'ORP', 'Oxidation-reduction potential (mV) — a measure used in the anoxic zone to confirm the right reactions (like denitrification) are happening where they should.', NULL, '2026.07.1'),
  ('glossary', 'glossary', 'RAS (Return Activated Sludge)', 'Sludge pumped from the clarifier back to the front of the process to keep the biology recirculating. If the RAS pump stops, the process backs up.', NULL, '2026.07.1'),
  ('glossary', 'glossary', 'DMR (Discharge Monitoring Report)', 'A Discharge Monitoring Report — the periodic report a permitted wastewater facility files with the regulator, summarizing monitored values against permit limits.', NULL, '2026.07.1'),
  ('glossary', 'glossary', 'PeakLogic Hub', 'The on-site box that reads your equipment and PLCs, evaluates alarms locally, serves the operator screen and this help offline, and forwards data to the cloud.', NULL, '2026.07.1'),
  ('glossary', 'glossary', 'Tag', 'A named point that maps a raw source (a PLC register or a device metric) to a standard reading shown on your screens — so everything speaks one vocabulary regardless of the underlying device.', NULL, '2026.07.1');

-- Down Migration

DELETE FROM help_content WHERE content_version = '2026.07.1';
DELETE FROM help_content_bundles WHERE version = '2026.07.1';
