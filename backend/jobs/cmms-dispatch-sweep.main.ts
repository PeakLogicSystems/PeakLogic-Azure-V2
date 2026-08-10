import { app, type Timer, type InvocationContext } from '@azure/functions';
import { runCmmsDispatchSweep } from './cmms-dispatch-sweep-handler';

// CMMS dispatch outbox sweep — the sole delivery mechanism for
// cmms_dispatch_outbox (see outbox.ts's own header). Named
// cmms-dispatch-sweep.main.ts, not cmms-dispatch-sweep.ts — package.json's
// "dist/**/*.main.js" discovery glob requires the *.main.ts suffix on every
// top-level app.http/app.timer registration file (TD-56 — the entire /v1/*
// API silently failed to register once for exactly this reason).
//
// Every minute — a "missed dispatch is a missed service call" (reporting-
// and-kpi-design.md §2.2), so this runs far more often than the other
// sweeps in this codebase (silence-detection is every 5 minutes; this is
// closer to "as fast as a Timer trigger reasonably allows without becoming
// its own cost/noise problem" than to a tuned interval — a disclosed
// placeholder, same honesty as every other interval constant here,
// revisit once real dispatch volume exists to tune against).
app.timer('cmms-dispatch-sweep', {
  schedule: '0 * * * * *',
  handler: async (_timer: Timer, context: InvocationContext): Promise<void> => {
    const result = await runCmmsDispatchSweep();
    if (result.rowsAttempted > 0 || result.tenantsSkipped > 0) {
      context.log(
        `CMMS dispatch sweep: ${result.tenantsScanned} tenants scanned, ${result.tenantsSkipped} skipped, ${result.rowsAttempted} outbox rows attempted`,
      );
    }
  },
});
