#!/usr/bin/env node
import { getPool } from '../shared/db';
import { proveTenantIsolation, hasCriticalFinding, formatReport } from './tenant-prover-handler';

// CLI entry point matching agent-operations-team-design.md §9.3's own RUN
// examples: `npm run agent -- WARDEN-TEN --once --fail-on-any`. There is
// no warning tier for a tenant boundary (§9.3's own instruction: "Do not
// add one") — every run fails the process on any critical finding,
// unconditionally; --fail-on-any is accepted for compatibility with the
// design doc's documented invocation but doesn't toggle anything, since
// "sometimes don't fail on a tenant-boundary violation" isn't a mode this
// agent offers.
//
// Uses shared/db.ts's own getPool() — the exact same credential resolution
// (TEST_APP_DATABASE_URL / TEST_DATABASE_URL / Key Vault) every other part
// of this codebase uses, not a separate connection convention invented for
// just this agent.

async function main() {
  const pool = await getPool();
  try {
    const result = await proveTenantIsolation(pool);
    console.log(formatReport(result));
    if (hasCriticalFinding(result)) {
      console.error('\nWARDEN-TEN: FAIL — at least one critical tenant-isolation finding.');
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('WARDEN-TEN crashed — treat as a failure, not a pass:', err);
  process.exitCode = 1;
});
