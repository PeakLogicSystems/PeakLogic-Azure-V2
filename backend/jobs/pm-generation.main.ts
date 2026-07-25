import { app, type Timer, type InvocationContext } from '@azure/functions';
import { runPmGenerationSweep } from './pm-generation-handler';

// Azure Functions v4 Timer trigger entry for PM work-order generation
// (PRD §5.20 CM-3.1). Same "deployment binding" shape as
// silence-detection.main.ts — the logic (pm-generation.ts,
// pm-generation-handler.ts) is plain testable TypeScript, ready the moment
// infra-azure gains a Functions-hosting module (not yet built).
//
// Schedule: once daily at 06:00 (NCRONTAB `0 0 6 * * *`). PM cadence is in
// days, so a daily due-check is ample; running it in the early morning
// creates the day's due work orders before technicians start.
app.timer('pm-generation', {
  schedule: '0 0 6 * * *',
  handler: async (_timer: Timer, context: InvocationContext): Promise<void> => {
    try {
      const result = await runPmGenerationSweep();
      context.log(
        `PM generation sweep complete: ${result.tenantsScanned} tenants scanned, ` +
        `${result.tenantsSkipped} skipped, ${result.workOrdersCreated} work orders created`,
      );
    } catch (err) {
      context.error('PM generation sweep failed', err);
    }
  },
});
