import { app, type Timer, type InvocationContext } from '@azure/functions';
import { runHubSilenceSweep } from './hub-silence-handler';

// Azure Functions v4 Timer trigger for Hub-silence detection (Domain Model
// §2.11). Same "deployment binding" shape as silence-detection.main.ts — the
// logic (shared/hubs.ts, hub-silence-handler.ts) is plain testable TypeScript,
// ready the moment infra-azure gains a Functions-hosting module (not built).
//
// Schedule: every 5 minutes (NCRONTAB `0 */5 * * * *`). A Hub's expected
// heartbeat is ~60s (× 3 grace = 3-min window), so a 5-minute sweep catches a
// silent Hub within roughly one cycle of it crossing the threshold.
app.timer('hub-silence-detection', {
  schedule: '0 */5 * * * *',
  handler: async (_timer: Timer, context: InvocationContext): Promise<void> => {
    try {
      const result = await runHubSilenceSweep();
      context.log(
        `Hub silence sweep complete: ${result.tenantsScanned} tenants scanned, ` +
        `${result.tenantsSkipped} skipped, ${result.hubsFlagged} hubs flagged offline`,
      );
    } catch (err) {
      context.error('Hub silence sweep failed', err);
    }
  },
});
