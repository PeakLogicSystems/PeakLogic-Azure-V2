import { app, type Timer, type InvocationContext } from '@azure/functions';
import { runCmmsAccountSync } from './cmms-account-sync-handler';

// CMMS account-data sync — daily, 05:00 UTC. Reference data (customers,
// locations, proposals, invoices) an admin maps against via the
// cmms-connectors route, not a live operational signal — no dispatch or
// alerting depends on this being fresh to the minute the way the 1-minute
// dispatch sweep is. Named cmms-account-sync.main.ts, not
// cmms-account-sync.ts — TD-56 / cmms-dispatch-sweep.main.ts's identical
// header note on why the *.main.ts suffix is load-bearing.
app.timer('cmms-account-sync', {
  schedule: '0 0 5 * * *',
  handler: async (_timer: Timer, context: InvocationContext): Promise<void> => {
    const result = await runCmmsAccountSync();
    context.log(
      `CMMS account sync: ${result.connectorsScanned} connectors scanned, ${result.connectorsSkipped} skipped, ${result.recordsUpserted} records upserted`,
    );
  },
});
