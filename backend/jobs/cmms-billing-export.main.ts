import { app, type Timer, type InvocationContext } from '@azure/functions';
import { runCmmsBillingExport } from './cmms-billing-export-handler';

// Monthly CMMS billing export — "send any necessary services information
// about the tenant to the system for billing" (2026-08-09). Named
// cmms-billing-export.main.ts, not cmms-billing-export.ts — see TD-56 /
// cmms-dispatch-sweep.main.ts's identical header note on why the *.main.ts
// suffix is load-bearing, not stylistic.
//
// 1st of the month, 06:00 UTC — exports the PRIOR calendar month's
// completed service visits, not the current (still in progress) one, so a
// visit completed on the last day of the month is never missed by running
// mid-month. A partner bills on their own cadence (BillingRecord's own doc
// comment) — this is PeakLogic's export cadence, not an assumption about
// when the partner actually invoices their customer.
app.timer('cmms-billing-export', {
  schedule: '0 0 6 1 * *',
  handler: async (_timer: Timer, context: InvocationContext): Promise<void> => {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const result = await runCmmsBillingExport(periodStart, periodEnd);
    context.log(
      `CMMS billing export ${periodStart.toISOString().slice(0, 10)}–${periodEnd.toISOString().slice(0, 10)}: ` +
        `${result.tenantsScanned} tenants scanned, ${result.tenantsSkipped} skipped, ${result.recordsQueued} billing records queued`,
    );
  },
});
