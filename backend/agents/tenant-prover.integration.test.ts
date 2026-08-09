import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, Pool } from 'pg';
import {
  checkSessionVariableActuallyApplies,
  checkNoCrossTenantLeak,
} from './tenant-prover';
import { proveTenantIsolation, hasCriticalFinding } from './tenant-prover-handler';

// Real-Postgres coverage for the two checks that only mean something
// against real transaction/session semantics (checkSessionVariableApplies,
// checkNoCrossTenantLeak), plus an end-to-end proof that WARDEN-TEN
// actually catches a real, deliberately-introduced violation — not just
// that its own logic is internally consistent (tenant-prover.test.ts).
// Same "prove the harness catches a bug, not just passes vacuously"
// discipline this project already applies elsewhere (TD-51's ST_Contains
// fix; verify-diagram.mjs's own regression test).
//
// Requires TEST_DATABASE_URL — same skip-with-a-message pattern as every
// other *.integration.test.ts file in this repo (Test Strategy §4).

const RUN = !!process.env.TEST_DATABASE_URL;
const describeIfDb = RUN ? describe : describe.skip;

describeIfDb('WARDEN-TEN — real Postgres', () => {
  let setup: Client;
  let appPool: Pool;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    setup = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await setup.connect();
    await setup.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await setup.query(`
      CREATE OR REPLACE FUNCTION app_uuid(p_setting TEXT) RETURNS UUID AS $$
        SELECT NULLIF(current_setting(p_setting, true), '')::uuid;
      $$ LANGUAGE sql STABLE;
    `);
    await setup.query(`CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

    // A correctly-isolated table: RLS enabled + forced + a policy
    // referencing app.current_tenant_id.
    await setup.query(`
      CREATE TABLE warden_ten_good (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        value TEXT NOT NULL
      );
      ALTER TABLE warden_ten_good ENABLE ROW LEVEL SECURITY;
      ALTER TABLE warden_ten_good FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON warden_ten_good
        USING (tenant_id = app_uuid('app.current_tenant_id'));
    `);

    // A DELIBERATELY BROKEN table: RLS enabled but NOT forced — the exact
    // multi-tenant-architecture.md §2.5 defect. Its own table OWNER
    // (the TEST_DATABASE_URL superuser, which also owns this table since it
    // created it) would silently bypass the policy — proving this requires
    // querying it as that owner, not the app role, which is exactly what
    // makes FORCE the load-bearing half of this check.
    await setup.query(`
      CREATE TABLE warden_ten_broken (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        value TEXT NOT NULL
      );
      ALTER TABLE warden_ten_broken ENABLE ROW LEVEL SECURITY;
      -- Deliberately NOT forced.
      CREATE POLICY tenant_isolation ON warden_ten_broken
        USING (tenant_id = app_uuid('app.current_tenant_id'));
    `);

    const { rows: [a] } = await setup.query(`INSERT INTO tenants (name) VALUES ('Warden Test A') RETURNING id`);
    const { rows: [b] } = await setup.query(`INSERT INTO tenants (name) VALUES ('Warden Test B') RETURNING id`);
    tenantA = a.id;
    tenantB = b.id;
    await setup.query(`INSERT INTO warden_ten_good (tenant_id, value) VALUES ($1, 'a-secret'), ($2, 'b-secret')`, [tenantA, tenantB]);
    await setup.query(`INSERT INTO warden_ten_broken (tenant_id, value) VALUES ($1, 'a-secret'), ($2, 'b-secret')`, [tenantA, tenantB]);

    // The non-superuser app role TD-50's vitest.integration.setup.ts already
    // creates globally for this whole test run — reused here rather than
    // inventing a second one, same as every other integration test file.
    const appUrl = new URL(process.env.TEST_APP_DATABASE_URL ?? process.env.TEST_DATABASE_URL!);
    appPool = new Pool({ connectionString: appUrl.toString(), max: 2 });
  });

  afterAll(async () => {
    await setup.query('DROP TABLE IF EXISTS warden_ten_good, warden_ten_broken CASCADE');
    await setup.query('DELETE FROM tenants WHERE id = ANY($1)', [[tenantA, tenantB]]);
    await setup.end();
    await appPool.end();
  });

  it('checkSessionVariableActuallyApplies passes against real Postgres — regression coverage for the SET LOCAL bind-parameter bug', async () => {
    const client = await appPool.connect();
    try {
      expect(await checkSessionVariableActuallyApplies(client)).toBeNull();
    } finally {
      client.release();
    }
  });

  it('checkNoCrossTenantLeak passes for the correctly-isolated table', async () => {
    const client = await appPool.connect();
    try {
      expect(await checkNoCrossTenantLeak(client, 'warden_ten_good', tenantA, tenantB)).toBeNull();
    } finally {
      client.release();
    }
  });

  it('the live probe alone does not catch the FORCE-less table when run as the app role (the app role correctly gets zero rows — this is what makes the RLS-flags check necessary, not redundant)', async () => {
    const client = await appPool.connect();
    try {
      // The app role is a genuinely non-superuser, non-owner role, so RLS
      // applies to it regardless of FORCE (FORCE only matters for the
      // table's OWNER). This confirms the live probe and the RLS-flags
      // check are catching two DIFFERENT failure modes, not one twice.
      expect(await checkNoCrossTenantLeak(client, 'warden_ten_broken', tenantA, tenantB)).toBeNull();
    } finally {
      client.release();
    }
  });

  it('end-to-end: proveTenantIsolation() run as the table OWNER catches the missing-FORCE table as critical — the actual defect this agent exists to catch', async () => {
    // Run the full check suite AS THE SUPERUSER/OWNER connection
    // deliberately, to prove checkRlsEnabledAndForced (not the live probe)
    // is what catches this specific defect. checkCurrentRoleNotPrivileged
    // will ALSO correctly fire here (this connection IS a superuser) —
    // that's not a false positive, it's the same defect from a second
    // angle, exactly as multi-tenant-architecture.md §2.5 describes it.
    const ownerPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
    try {
      const result = await proveTenantIsolation(ownerPool);
      expect(hasCriticalFinding(result)).toBe(true);
      const brokenTableFinding = result.findings.find(
        (f) => f.table === 'warden_ten_broken' && f.check === 'rls-enabled-and-forced',
      );
      expect(brokenTableFinding).toBeDefined();
      expect(brokenTableFinding?.severity).toBe('critical');
    } finally {
      await ownerPool.end();
    }
  });
});
