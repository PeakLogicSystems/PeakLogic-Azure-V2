import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { getPool, withTenant, __resetPoolForTests } from './db';

// Test Strategy §4 — regression coverage for the two real bugs Multi-Tenant
// Architecture (#14) found this project's history: (1) the telemetry table
// shipped without RLS, letting any tenant read any other tenant's raw
// sensor data by device_id (§2.2, fixed in migration
// 1783569600000_telemetry-rls); (2) withTenant() never checked tenant
// status, so a suspended tenant could keep using the platform (§3.2). Both
// are exactly the kind of bug a mocked pg.Pool can never catch — the mock
// would just return whatever the test told it to, which is precisely the
// blind spot that let the real bug ship. This test exercises the actual
// withTenant() function against a real Postgres, not a reimplementation of
// its logic.
//
// Requires TEST_DATABASE_URL (a real, disposable Postgres 16 instance — see
// docker-compose.test.yml for local use, ci.yml's postgres service
// container in CI). Skips itself with a clear message if that's not set,
// rather than failing confusingly on a connection error.

const RUN = !!process.env.TEST_DATABASE_URL;
const describeIfDb = RUN ? describe : describe.skip;

describeIfDb('withTenant() — RLS + tenant-suspension enforcement (real Postgres)', () => {
  let setup: Client;
  let tenantA: string;
  let tenantB: string;
  let tenantSuspended: string;
  let deviceA: string;
  let deviceB: string;

  beforeAll(async () => {
    setup = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await setup.connect();

    // Minimal schema mirroring docs/data-model.sql's tenants/devices/telemetry
    // tables exactly (columns, constraints, RLS policies) — scoped to just
    // what this test needs, not a full migration run. assets is omitted:
    // devices.asset_id is nullable and unused here.
    await setup.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await setup.query(`
      CREATE TABLE tenants (
        id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name               TEXT        NOT NULL,
        slug               TEXT        NOT NULL UNIQUE,
        status             TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','suspended','trial')),
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await setup.query(`
      CREATE TABLE devices (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        asset_id   UUID,
        serial     TEXT NOT NULL UNIQUE,
        thing_name TEXT NOT NULL UNIQUE,
        status     TEXT NOT NULL DEFAULT 'provisioning'
      );
      ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON devices
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
    `);

    await setup.query(`
      CREATE TABLE telemetry (
        time      TIMESTAMPTZ      NOT NULL,
        device_id UUID             NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        tenant_id UUID             NOT NULL,
        metric    TEXT             NOT NULL,
        value     DOUBLE PRECISION NOT NULL
      );
      ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON telemetry
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
    `);

    const { rows: [a] } = await setup.query(
      `INSERT INTO tenants (name, slug, status) VALUES ('Tenant A', 'tenant-a', 'active') RETURNING id`,
    );
    const { rows: [b] } = await setup.query(
      `INSERT INTO tenants (name, slug, status) VALUES ('Tenant B', 'tenant-b', 'active') RETURNING id`,
    );
    const { rows: [s] } = await setup.query(
      `INSERT INTO tenants (name, slug, status) VALUES ('Suspended Co', 'suspended-co', 'suspended') RETURNING id`,
    );
    tenantA = a.id;
    tenantB = b.id;
    tenantSuspended = s.id;

    const { rows: [da] } = await setup.query(
      `INSERT INTO devices (tenant_id, serial, thing_name) VALUES ($1, 'PLG-TEST-A', 'plg-test-a') RETURNING id`,
      [tenantA],
    );
    const { rows: [db_] } = await setup.query(
      `INSERT INTO devices (tenant_id, serial, thing_name) VALUES ($1, 'PLG-TEST-B', 'plg-test-b') RETURNING id`,
      [tenantB],
    );
    deviceA = da.id;
    deviceB = db_.id;

    await setup.query(
      `INSERT INTO telemetry (time, device_id, tenant_id, metric, value) VALUES (now(), $1, $2, 'pressure_psi', 42)`,
      [deviceA, tenantA],
    );
    await setup.query(
      `INSERT INTO telemetry (time, device_id, tenant_id, metric, value) VALUES (now(), $1, $2, 'pressure_psi', 99)`,
      [deviceB, tenantB],
    );
  });

  afterAll(async () => {
    await setup.query('DROP TABLE IF EXISTS telemetry, devices, tenants CASCADE');
    await setup.end();
    const p = await getPool();
    await p.end();
    __resetPoolForTests();
  });

  it('RLS blocks tenant A from reading tenant B\'s telemetry by device_id — regression test for Multi-Tenant Architecture §2.2', async () => {
    const rows = await withTenant(tenantA, (client) =>
      client.query('SELECT * FROM telemetry WHERE device_id = $1', [deviceB]).then(r => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('RLS allows tenant A to read its own telemetry', async () => {
    const rows = await withTenant(tenantA, (client) =>
      client.query('SELECT * FROM telemetry WHERE device_id = $1', [deviceA]).then(r => r.rows),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(42);
  });

  it('rejects a suspended tenant before running the wrapped operation — regression test for Multi-Tenant Architecture §3.2', async () => {
    await expect(
      withTenant(tenantSuspended, (client) => client.query('SELECT 1')),
    ).rejects.toThrow('Tenant is suspended');
  });

  it('rejects an unknown tenant id', async () => {
    await expect(
      withTenant('00000000-0000-0000-0000-000000000000', (client) => client.query('SELECT 1')),
    ).rejects.toThrow('Tenant not found');
  });
});

if (!RUN) {
  // eslint-disable-next-line no-console
  console.log('db.integration.test.ts skipped — TEST_DATABASE_URL not set. See Test Strategy §4.');
}
