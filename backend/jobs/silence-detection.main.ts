import { app, type Timer, type InvocationContext } from '@azure/functions';
import { runSilenceSweep } from './silence-detection-handler';

// Azure Functions v4 Timer trigger entry for device-silence detection
// (Enterprise Audit 2026-07-19 §3, P0). Mirrors ingest/main.ts's shape —
// this is the "deployment binding" half of the feature; the actual logic
// (silence-detection.ts, silence-detection-handler.ts) is plain, testable
// TypeScript with no Azure-specific dependency, ready to run the moment
// infra-azure gains a Functions-hosting module (not yet built — see
// enterprise-audit-2026-07-19.md §6 P0 item 1). Writing the real app code
// now, ahead of the deployment infra, matches how every other capability
// this session has shipped (AI Analytics Tier 1, white-label branding).
//
// Schedule: every 5 minutes (NCRONTAB `0 */5 * * * *`) — frequent enough to
// catch a silent gas_sensor/leak_sensor (2 min expected interval * 3 grace =
// 6 min window) within roughly one sweep cycle of it crossing the
// threshold, without running so often it becomes a meaningful DB-scan cost
// once a real fleet exists. Revisit once real fleet size/cost data exists.
app.timer('silence-detection', {
  schedule: '0 */5 * * * *',
  handler: async (_timer: Timer, context: InvocationContext): Promise<void> => {
    try {
      const result = await runSilenceSweep();
      context.log(
        `Silence sweep complete: ${result.tenantsScanned} tenants scanned, ` +
        `${result.tenantsSkipped} skipped, ${result.devicesFlagged} devices flagged silent`,
      );
    } catch (err) {
      // A failure to even enumerate tenants (the one step not caught inside
      // runSilenceSweep's own per-tenant loop) shouldn't crash the Functions
      // host — logged for now; App Insights alert rules (audit §6 P0 item 4,
      // not yet built) are the real follow-up for "this job stopped running
      // and nobody noticed," the same class of gap as the sweep itself
      // exists to close for devices.
      context.error('Silence sweep failed', err);
    }
  },
});
