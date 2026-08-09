import { app, type Timer, type InvocationContext } from '@azure/functions';
import { getPool } from '../shared/db';
import { proveTenantIsolation, hasCriticalFinding, formatReport } from './tenant-prover-handler';

// Azure Functions v4 Timer trigger entry for WARDEN-TEN (agent-operations-
// team-design.md §3.14/§9.3). Named tenant-prover.main.ts, not main.ts or
// tenant-prover.ts — package.json's "dist/**/*.main.js" discovery glob
// requires the *.main.ts suffix on every top-level app.http/app.timer
// registration file, the exact convention TD-56 documents getting missed
// for the API's own entry point. Currently inert pending a real Azure
// deployment (no Functions-hosting module exists in infra-azure/ yet) —
// the real, immediately-useful form of this agent today is
// tenant-prover-cli.ts, run via `npm run agent:warden-ten` locally or in
// CI's warden-ten job (ci.yml), which needs no deployment at all.
//
// Schedule: hourly (NCRONTAB `0 0 * * * *`), per §9.2's own per-agent
// parameter table — "critical always," no severity tier below it.
app.timer('tenant-prover', {
  schedule: '0 0 * * * *',
  handler: async (_timer: Timer, context: InvocationContext): Promise<void> => {
    const pool = await getPool();
    try {
      const result = await proveTenantIsolation(pool);
      context.log(formatReport(result));
      if (hasCriticalFinding(result)) {
        // §9.3: "Any finding is critical by definition — there is no
        // warning tier for a tenant boundary." context.error, not
        // context.warn — and this is the one agent whose finding should
        // reach MARSHAL-IR/security.alert the moment that bus exists
        // (CLAUDE.md's Agent Operations Team section — not built yet;
        // logging loudly is the real, honest interim behavior, not a
        // silent placeholder).
        context.error('WARDEN-TEN: CRITICAL tenant-isolation finding(s) — see report above.');
      }
    } catch (err) {
      context.error('WARDEN-TEN crashed — treat as a failure, not a pass', err);
    }
  },
});
