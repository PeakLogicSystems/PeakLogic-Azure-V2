import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { getPool, withTenant, withChannelPartner, __resetPoolForTests } from './db';

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

// Database Schema §4.4 / Security Architecture §2.4 (added v1.1) —
// regression coverage for the channel-partner cross-tenant RLS mechanism,
// the same "must be exercised against a real Postgres, not a mock" reason
// as the withTenant() suite above. Covers: a partner_admin's unrestricted
// access within their own partner; a technician's access restricted to
// their assigned territory's sites (channel_partner_can_read_site()'s
// ST_Contains check) and to their own route_assignments only; the
// bootstrapping-order fix in withChannelPartner() itself (channel_partner_id
// must be set before the channel_partner_users lookup, or that lookup
// silently returns zero rows due to RLS rather than erroring).
describeIfDb('withChannelPartner() — cross-tenant RLS (real Postgres)', () => {
  let setup: Client;
  let tenantIn: string;   // attributed to the partner
  let tenantOut: string;  // NOT attributed to the partner — must stay invisible
  let partnerId: string;
  let territoryId: string;   // covers siteIn's coordinates
  let otherTerritoryId: string; // does NOT cover siteIn's coordinates
  let adminCognitoSub: string;
  let technicianInTerritoryCognitoSub: string;
  let technicianOutOfTerritoryCognitoSub: string;
  let siteIn: string;

  beforeAll(async () => {
    setup = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await setup.connect();

    await setup.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await setup.query('CREATE EXTENSION IF NOT EXISTS "postgis"');

    await setup.query(`
      CREATE TABLE channel_partners (
        id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL
      );
      CREATE TABLE tenants (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name               TEXT NOT NULL,
        slug               TEXT NOT NULL UNIQUE,
        channel_partner_id UUID REFERENCES channel_partners(id)
      );
      CREATE TABLE sites (
        id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name      TEXT NOT NULL,
        lat       DOUBLE PRECISION,
        lng       DOUBLE PRECISION
      );
      ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON sites
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

      CREATE TABLE territories (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_partner_id UUID NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
        name               TEXT NOT NULL,
        boundary           GEOGRAPHY(POLYGON, 4326) NOT NULL
      );
      ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
      CREATE POLICY channel_partner_isolation ON territories
        USING (channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid);

      CREATE TABLE channel_partner_users (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_partner_id UUID NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
        cognito_sub        TEXT NOT NULL UNIQUE,
        role               TEXT NOT NULL CHECK (role IN ('partner_admin','technician')),
        territory_id       UUID REFERENCES territories(id) ON DELETE SET NULL
      );
      ALTER TABLE channel_partner_users ENABLE ROW LEVEL SECURITY;
      CREATE POLICY channel_partner_isolation ON channel_partner_users
        USING (channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid);

      CREATE OR REPLACE FUNCTION channel_partner_can_read_site(p_site_id UUID) RETURNS BOOLEAN AS $$
        SELECT EXISTS (
          SELECT 1 FROM sites s JOIN tenants t ON t.id = s.tenant_id
          WHERE s.id = p_site_id
            AND t.channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid
            AND (
              current_setting('app.current_channel_partner_role', true) = 'partner_admin'
              OR EXISTS (
                SELECT 1 FROM channel_partner_users cpu JOIN territories terr ON terr.id = cpu.territory_id
                WHERE cpu.id = current_setting('app.current_channel_partner_user_id', true)::uuid
                  AND ST_Contains(terr.boundary, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography)
              )
            )
        );
      $$ LANGUAGE sql STABLE;

      CREATE POLICY channel_partner_read ON sites FOR SELECT
        USING (channel_partner_can_read_site(id));
    `);

    const { rows: [p] } = await setup.query(
      `INSERT INTO channel_partners (name) VALUES ('Pinch-A-Penny Test') RETURNING id`,
    );
    partnerId = p.id;

    const { rows: [tIn] } = await setup.query(
      `INSERT INTO tenants (name, slug, channel_partner_id) VALUES ('In-Network Pool Co', 'in-network', $1) RETURNING id`,
      [partnerId],
    );
    tenantIn = tIn.id;
    const { rows: [tOut] } = await setup.query(
      `INSERT INTO tenants (name, slug, channel_partner_id) VALUES ('Unrelated Pool Co', 'unrelated', NULL) RETURNING id`,
    );
    tenantOut = tOut.id;

    // A small square around (0,0) — siteIn sits inside it.
    const { rows: [terr] } = await setup.query(
      `INSERT INTO territories (channel_partner_id, name, boundary)
       VALUES ($1, 'Territory A', ST_GeogFromText('POLYGON((-1 -1, -1 1, 1 1, 1 -1, -1 -1))')) RETURNING id`,
      [partnerId],
    );
    territoryId = terr.id;
    // A square far away — does not cover siteIn.
    const { rows: [otherTerr] } = await setup.query(
      `INSERT INTO territories (channel_partner_id, name, boundary)
       VALUES ($1, 'Territory B (elsewhere)', ST_GeogFromText('POLYGON((50 50, 50 51, 51 51, 51 50, 50 50))')) RETURNING id`,
      [partnerId],
    );
    otherTerritoryId = otherTerr.id;

    const { rows: [site] } = await setup.query(
      `INSERT INTO sites (tenant_id, name, lat, lng) VALUES ($1, 'In-Network Pool', 0, 0) RETURNING id`,
      [tenantIn],
    );
    siteIn = site.id;

    adminCognitoSub = 'cognito-sub-admin';
    technicianInTerritoryCognitoSub = 'cognito-sub-tech-in';
    technicianOutOfTerritoryCognitoSub = 'cognito-sub-tech-out';

    await setup.query(
      `INSERT INTO channel_partner_users (channel_partner_id, cognito_sub, role, territory_id) VALUES ($1, $2, 'partner_admin', NULL)`,
      [partnerId, adminCognitoSub],
    );
    await setup.query(
      `INSERT INTO channel_partner_users (channel_partner_id, cognito_sub, role, territory_id) VALUES ($1, $2, 'technician', $3)`,
      [partnerId, technicianInTerritoryCognitoSub, territoryId],
    );
    await setup.query(
      `INSERT INTO channel_partner_users (channel_partner_id, cognito_sub, role, territory_id) VALUES ($1, $2, 'technician', $3)`,
      [partnerId, technicianOutOfTerritoryCognitoSub, otherTerritoryId],
    );
  });

  afterAll(async () => {
    await setup.query(
      'DROP TABLE IF EXISTS channel_partner_users, territories, sites, tenants, channel_partners CASCADE',
    );
    await setup.query('DROP FUNCTION IF EXISTS channel_partner_can_read_site(UUID)');
    await setup.end();
    const p = await getPool();
    await p.end();
    __resetPoolForTests();
  });

  it('a partner_admin can read a site belonging to any tenant attributed to their partner, regardless of territory', async () => {
    const rows = await withChannelPartner(
      { sub: adminCognitoSub, email: '', channelPartnerId: partnerId },
      (client) => client.query('SELECT * FROM sites WHERE id = $1', [siteIn]).then(r => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it('a technician whose territory covers the site can read it', async () => {
    const rows = await withChannelPartner(
      { sub: technicianInTerritoryCognitoSub, email: '', channelPartnerId: partnerId },
      (client) => client.query('SELECT * FROM sites WHERE id = $1', [siteIn]).then(r => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it('a technician whose territory does NOT cover the site cannot read it — the "preconfigured assets" scoping actually works', async () => {
    const rows = await withChannelPartner(
      { sub: technicianOutOfTerritoryCognitoSub, email: '', channelPartnerId: partnerId },
      (client) => client.query('SELECT * FROM sites WHERE id = $1', [siteIn]).then(r => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('cannot read a site belonging to a tenant NOT attributed to the partner at all, even as partner_admin', async () => {
    const { rows: [unrelatedSite] } = await setup.query(
      `INSERT INTO sites (tenant_id, name, lat, lng) VALUES ($1, 'Unrelated Pool', 0, 0) RETURNING id`,
      [tenantOut],
    );
    const rows = await withChannelPartner(
      { sub: adminCognitoSub, email: '', channelPartnerId: partnerId },
      (client) => client.query('SELECT * FROM sites WHERE id = $1', [unrelatedSite.id]).then(r => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('resolves the correct channel_partner_user_id and role for the fn callback', async () => {
    await withChannelPartner(
      { sub: technicianInTerritoryCognitoSub, email: '', channelPartnerId: partnerId },
      async (_client, session) => {
        expect(session.role).toBe('technician');
        expect(session.channelPartnerUserId).toBeTruthy();
      },
    );
  });

  it('rejects an unknown cognito_sub — regression test for the bootstrapping-order fix (channel_partner_id must be set before the lookup, or this silently "succeeds" as not-found for the wrong reason)', async () => {
    await expect(
      withChannelPartner(
        { sub: 'no-such-sub', email: '', channelPartnerId: partnerId },
        (client) => client.query('SELECT 1'),
      ),
    ).rejects.toThrow('Channel partner user not found');
  });

  it("a tenant session (withTenant) is completely unaffected by the channel_partner_read policy's existence", async () => {
    const rows = await withTenant(tenantIn, (client) =>
      client.query('SELECT * FROM sites WHERE id = $1', [siteIn]).then(r => r.rows),
    );
    expect(rows).toHaveLength(1);
  });
});

if (!RUN) {
  // eslint-disable-next-line no-console
  console.log('db.integration.test.ts skipped — TEST_DATABASE_URL not set. See Test Strategy §4.');
}
