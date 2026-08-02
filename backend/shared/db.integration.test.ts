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
    // Mirrors docs/data-model.sql's app_uuid() (TD-52) — returns NULL rather
    // than raising when the session variable is unset, so an unscoped query is
    // a clean deny instead of an error. The fixture must match the real schema
    // here: a fixture that quietly differs is how TD-51/TD-52 stayed invisible.
    await setup.query(`
      CREATE OR REPLACE FUNCTION app_uuid(p_setting TEXT) RETURNS UUID AS $$
        SELECT NULLIF(current_setting(p_setting, true), '')::uuid;
      $$ LANGUAGE sql STABLE;
    `);

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
        USING (tenant_id = app_uuid('app.current_tenant_id'));
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
        USING (tenant_id = app_uuid('app.current_tenant_id'));
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
  let suspendedPartnerId: string;
  let suspendedPartnerAdminCognitoSub: string;
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
    // Mirrors docs/data-model.sql's app_uuid() (TD-52) — returns NULL rather
    // than raising when the session variable is unset, so an unscoped query is
    // a clean deny instead of an error. The fixture must match the real schema
    // here: a fixture that quietly differs is how TD-51/TD-52 stayed invisible.
    await setup.query(`
      CREATE OR REPLACE FUNCTION app_uuid(p_setting TEXT) RETURNS UUID AS $$
        SELECT NULLIF(current_setting(p_setting, true), '')::uuid;
      $$ LANGUAGE sql STABLE;
    `);
    await setup.query('CREATE EXTENSION IF NOT EXISTS "postgis"');

    await setup.query(`
      CREATE TABLE channel_partners (
        id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name   TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended'))
      );
      CREATE TABLE tenants (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name               TEXT NOT NULL,
        slug               TEXT NOT NULL UNIQUE,
        channel_partner_id UUID REFERENCES channel_partners(id),
        -- REAL BUG found 2026-08-01, the first time this fixture ever ran:
        -- withTenant() (the real, imported production function several
        -- tests below call directly) unconditionally does a
        -- SELECT status FROM tenants query — this table never had that
        -- column, so every such call failed with "column status does not exist".
        status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','trial'))
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
        USING (tenant_id = app_uuid('app.current_tenant_id'));

      CREATE TABLE territories (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_partner_id UUID NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
        name               TEXT NOT NULL,
        boundary           GEOGRAPHY(POLYGON, 4326) NOT NULL
      );
      ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
      CREATE POLICY channel_partner_isolation ON territories
        USING (channel_partner_id = app_uuid('app.current_channel_partner_id'));

      CREATE TABLE channel_partner_users (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_partner_id UUID NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
        cognito_sub        TEXT NOT NULL UNIQUE,
        role               TEXT NOT NULL CHECK (role IN ('partner_admin','technician')),
        territory_id       UUID REFERENCES territories(id) ON DELETE SET NULL
      );
      ALTER TABLE channel_partner_users ENABLE ROW LEVEL SECURITY;
      CREATE POLICY channel_partner_isolation ON channel_partner_users
        USING (channel_partner_id = app_uuid('app.current_channel_partner_id'));

      CREATE OR REPLACE FUNCTION channel_partner_can_read_site(p_site_id UUID) RETURNS BOOLEAN AS $$
        SELECT EXISTS (
          SELECT 1 FROM sites s JOIN tenants t ON t.id = s.tenant_id
          WHERE s.id = p_site_id
            AND t.channel_partner_id = app_uuid('app.current_channel_partner_id')
            AND (
              current_setting('app.current_channel_partner_role', true) = 'partner_admin'
              OR EXISTS (
                SELECT 1 FROM channel_partner_users cpu JOIN territories terr ON terr.id = cpu.territory_id
                WHERE cpu.id = app_uuid('app.current_channel_partner_user_id')
                  -- ST_Covers, not ST_Contains — REAL BUG found 2026-08-01,
                  -- the first time this fixture ever ran against real
                  -- PostGIS: no ST_Contains(geography, geography) overload
                  -- exists. Mirrors the identical fix in docs/data-model.sql/
                  -- the real migrations.
                  AND ST_Covers(terr.boundary, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography)
              )
            )
        );
      $$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

      CREATE POLICY channel_partner_read ON sites FOR SELECT
        USING (channel_partner_can_read_site(id));
    `);

    const { rows: [p] } = await setup.query(
      `INSERT INTO channel_partners (name, status) VALUES ('Pinch-A-Penny Test', 'active') RETURNING id`,
    );
    partnerId = p.id;

    const { rows: [sp] } = await setup.query(
      `INSERT INTO channel_partners (name, status) VALUES ('Suspended Partner Test', 'suspended') RETURNING id`,
    );
    suspendedPartnerId = sp.id;
    suspendedPartnerAdminCognitoSub = 'cognito-sub-suspended-admin';
    await setup.query(
      `INSERT INTO channel_partner_users (channel_partner_id, cognito_sub, role) VALUES ($1, $2, 'partner_admin')`,
      [suspendedPartnerId, suspendedPartnerAdminCognitoSub],
    );

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

  it('rejects a suspended channel partner before the wrapped operation runs — regression test for Multi-Tenant Architecture §3.3, mirrors §3.2\'s tenant-suspension enforcement', async () => {
    await expect(
      withChannelPartner(
        { sub: suspendedPartnerAdminCognitoSub, email: '', channelPartnerId: suspendedPartnerId },
        (client) => client.query('SELECT 1'),
      ),
    ).rejects.toThrow('Channel partner is suspended');
  });

  it('suspending a channel partner does not affect a tenant session for a tenant attributed to that partner — portal-only enforcement, not a service-wide one', async () => {
    // Attribute tenantIn to the suspended partner temporarily, prove
    // withTenant() still works fine regardless.
    await setup.query('UPDATE tenants SET channel_partner_id = $1 WHERE id = $2', [suspendedPartnerId, tenantIn]);
    try {
      const rows = await withTenant(tenantIn, (client) =>
        client.query('SELECT * FROM sites WHERE id = $1', [siteIn]).then(r => r.rows),
      );
      expect(rows).toHaveLength(1);
    } finally {
      await setup.query('UPDATE tenants SET channel_partner_id = $1 WHERE id = $2', [partnerId, tenantIn]);
    }
  });

  it("a tenant session (withTenant) is completely unaffected by the channel_partner_read policy's existence", async () => {
    const rows = await withTenant(tenantIn, (client) =>
      client.query('SELECT * FROM sites WHERE id = $1', [siteIn]).then(r => r.rows),
    );
    expect(rows).toHaveLength(1);
  });
});

// Multi-Tenant Architecture §2.5 (added v1.1) — regression coverage for the
// FORCE ROW LEVEL SECURITY fix itself, and the app.ingest_context marker
// backend/ingest/handler.ts now depends on. Uses the RDS-equivalent setup
// deliberately: a non-superuser role that OWNS the tables it queries,
// mirroring the real bug exactly (peaklogic_admin runs migrations AND app
// queries) — a superuser or a separate non-owning role would silently pass
// this test even with FORCE missing, which is exactly the blind spot that
// let this bug ship unnoticed in the first place.
describeIfDb('FORCE ROW LEVEL SECURITY — table-owner bypass fix (real Postgres)', () => {
  let setup: Client;
  let ownerClient: Client;
  let tenantA: string;
  let tenantB: string;
  let deviceA: string;

  beforeAll(async () => {
    setup = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await setup.connect();

    // A dedicated, non-superuser owner role — deliberately not reusing
    // whatever role TEST_DATABASE_URL's own connection string already uses,
    // since that might itself be a superuser in a local/CI Postgres image
    // (which would bypass RLS regardless of FORCE, for an unrelated reason,
    // and falsely "pass" this test either way).
    await setup.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rls_test_owner') THEN
          CREATE ROLE rls_test_owner LOGIN PASSWORD 'test' NOSUPERUSER NOBYPASSRLS;
        END IF;
      END $$;
    `);
    await setup.query('GRANT CREATE ON SCHEMA public TO rls_test_owner');
    // Mirrors docs/data-model.sql's app_uuid() (TD-52) — returns NULL rather
    // than raising when the session variable is unset, so an unscoped query is
    // a clean deny instead of an error. The fixture must match the real schema
    // here: a fixture that quietly differs is how TD-51/TD-52 stayed invisible.
    await setup.query(`
      CREATE OR REPLACE FUNCTION app_uuid(p_setting TEXT) RETURNS UUID AS $$
        SELECT NULLIF(current_setting(p_setting, true), '')::uuid;
      $$ LANGUAGE sql STABLE;
    `);

    const ownerUrl = new URL(process.env.TEST_DATABASE_URL!);
    ownerUrl.username = 'rls_test_owner';
    ownerUrl.password = 'test';
    ownerClient = new Client({ connectionString: ownerUrl.toString() });
    await ownerClient.connect();

    // Tables created AS rls_test_owner, exactly like scripts/migrate.ts
    // running as peaklogic_admin in production — this role is the owner.
    await ownerClient.query(`
      CREATE TABLE rls_test_tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid()
      );
      CREATE TABLE rls_test_devices (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID NOT NULL REFERENCES rls_test_tenants(id),
        thing_name  TEXT NOT NULL UNIQUE
      );
      ALTER TABLE rls_test_devices ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON rls_test_devices
        USING (tenant_id = app_uuid('app.current_tenant_id'));
      CREATE POLICY ingest_lookup ON rls_test_devices FOR SELECT
        USING (current_setting('app.ingest_context', true) = 'true');
    `);

    const { rows: [a] } = await ownerClient.query('INSERT INTO rls_test_tenants DEFAULT VALUES RETURNING id');
    const { rows: [b] } = await ownerClient.query('INSERT INTO rls_test_tenants DEFAULT VALUES RETURNING id');
    tenantA = a.id;
    tenantB = b.id;

    const { rows: [d] } = await ownerClient.query(
      `INSERT INTO rls_test_devices (tenant_id, thing_name) VALUES ($1, 'thing-a') RETURNING id`,
      [tenantA],
    );
    deviceA = d.id;
  });

  afterAll(async () => {
    await ownerClient.query('DROP TABLE IF EXISTS rls_test_devices, rls_test_tenants CASCADE');
    await ownerClient.end();
    // Real bug found by the first-ever CI run against a real Postgres
    // (2026-08-01, TD-49 unblocked this): dropping the owned tables above
    // does NOT revoke the `GRANT CREATE ON SCHEMA public` from setup() —
    // Postgres tracks that grant as a real dependency, so a bare `DROP ROLE`
    // failed with "role ... cannot be dropped because some objects depend
    // on it ... privileges for schema public". `DROP OWNED BY` revokes
    // every privilege the role holds (and drops anything it still owns) in
    // one step, robust to future grants added here without a matching
    // manual REVOKE ever being remembered.
    await setup.query('DROP OWNED BY rls_test_owner');
    await setup.query('DROP ROLE IF EXISTS rls_test_owner');
    await setup.end();
  });

  it('WITHOUT FORCE ROW LEVEL SECURITY, the owning role sees every row regardless of any policy — reproduces the exact bug found in Multi-Tenant Architecture §2.5', async () => {
    // No FORCE applied yet — this is the pre-fix state every table in this
    // schema was actually in, from the very first migration.
    const rows = await ownerClient.query('SELECT * FROM rls_test_devices').then(r => r.rows);
    // If this ever returns 0, something about the test setup changed and
    // the premise of the whole regression test is wrong — fail loudly.
    expect(rows.length).toBeGreaterThan(0);
  });

  it('WITH FORCE ROW LEVEL SECURITY, the same owning role is correctly blocked without app.ingest_context or a matching app.current_tenant_id', async () => {
    await ownerClient.query('ALTER TABLE rls_test_devices FORCE ROW LEVEL SECURITY');

    await ownerClient.query('BEGIN');
    try {
      const rows = await ownerClient.query('SELECT * FROM rls_test_devices WHERE id = $1', [deviceA]).then(r => r.rows);
      expect(rows).toHaveLength(0); // this is the bug this migration fixes — proven fixed, not assumed
    } finally {
      await ownerClient.query('ROLLBACK');
    }
  });

  it('app.ingest_context permits the device lookup even though the tenant is not yet known — the exact operation backend/ingest/handler.ts performs first', async () => {
    await ownerClient.query('BEGIN');
    try {
      await ownerClient.query("SET LOCAL app.ingest_context = 'true'");
      const rows = await ownerClient.query('SELECT * FROM rls_test_devices WHERE thing_name = $1', ['thing-a']).then(r => r.rows);
      expect(rows).toHaveLength(1);
      expect(rows[0].tenant_id).toBe(tenantA);
    } finally {
      await ownerClient.query('ROLLBACK');
    }
  });

  it('app.ingest_context does NOT grant write access — narrowly scoped to SELECT only, not a general bypass', async () => {
    await ownerClient.query('BEGIN');
    try {
      await ownerClient.query("SET LOCAL app.ingest_context = 'true'");
      await expect(
        ownerClient.query(
          `INSERT INTO rls_test_devices (tenant_id, thing_name) VALUES ($1, 'thing-should-fail')`,
          [tenantB],
        ),
      ).rejects.toThrow();
    } finally {
      await ownerClient.query('ROLLBACK');
    }
  });

  it('after app.current_tenant_id is set (the handler.ts pattern, post-lookup), the same session correctly reads only that tenant\'s rows', async () => {
    await ownerClient.query('BEGIN');
    try {
      // set_config(), not SET LOCAL — this test's own copy of the exact bug
      // fixed in shared/db.ts today (SET LOCAL doesn't accept bind
      // parameters at all); this test file's job is to catch exactly this
      // class of mistake, so its own fixture can't be exempt from the fix.
      await ownerClient.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantA]);
      const own = await ownerClient.query('SELECT * FROM rls_test_devices WHERE id = $1', [deviceA]).then(r => r.rows);
      expect(own).toHaveLength(1);

      await ownerClient.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantB]);
      const other = await ownerClient.query('SELECT * FROM rls_test_devices WHERE id = $1', [deviceA]).then(r => r.rows);
      expect(other).toHaveLength(0);
    } finally {
      await ownerClient.query('ROLLBACK');
    }
  });
});

// Multi-Tenant Architecture §2.5 (extended) — regression coverage for the
// device claim/provisioning RLS policies (migration
// 1783728180000_device-claim-provisioning-rls.sql), found by directly
// asking "does anything else break under FORCE ROW LEVEL SECURITY" and
// auditing every DB-touching code path, not assumed complete after fixing
// ingest. Two real, live bugs in the same class as the ingest one:
// backend/api/routes/devices.ts's claim() and scripts/provision-devices.ts
// both connected with no RLS session variable set at all, performing real
// data operations on devices rows with tenant_id IS NULL (unclaimed).
describeIfDb('Device claim/provisioning RLS (real Postgres)', () => {
  let setup: Client;
  let tenantA: string;
  let tenantB: string;
  let unclaimedDeviceId: string;

  beforeAll(async () => {
    setup = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await setup.connect();

    await setup.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    // Mirrors docs/data-model.sql's app_uuid() (TD-52) — returns NULL rather
    // than raising when the session variable is unset, so an unscoped query is
    // a clean deny instead of an error. The fixture must match the real schema
    // here: a fixture that quietly differs is how TD-51/TD-52 stayed invisible.
    await setup.query(`
      CREATE OR REPLACE FUNCTION app_uuid(p_setting TEXT) RETURNS UUID AS $$
        SELECT NULLIF(current_setting(p_setting, true), '')::uuid;
      $$ LANGUAGE sql STABLE;
    `);
    // REAL BUG found and fixed 2026-08-01, the first time this fixture ever
    // ran: this table used to be named `claim_test_tenants`, but withTenant()
    // (the real, imported production function this whole block calls) has
    // `tenants` and its `status` column hardcoded — it can never look up a
    // differently-named table. Every test below that calls withTenant()
    // failed with "relation \"tenants\" does not exist" until this was
    // renamed to match, with the `status` column withTenant() actually
    // queries. Named literally `tenants` deliberately (not e.g.
    // `claim_test_tenants` renamed) — sibling describe blocks in this same
    // file already establish that convention, and each block's own afterAll
    // drops its tables before the next block's beforeAll runs, so reusing
    // the name sequentially is safe.
    await setup.query(`
      CREATE TABLE tenants (
        id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','trial'))
      );
      CREATE TABLE claim_test_devices (
        id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id),
        serial    TEXT NOT NULL UNIQUE
      );
      ALTER TABLE claim_test_devices ENABLE ROW LEVEL SECURITY;
      ALTER TABLE claim_test_devices FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON claim_test_devices
        USING (tenant_id = app_uuid('app.current_tenant_id'));
      CREATE POLICY unclaimed_lookup ON claim_test_devices FOR SELECT
        USING (tenant_id IS NULL AND current_setting('app.claim_context', true) = 'true');
      CREATE POLICY provision_unclaimed ON claim_test_devices FOR INSERT
        WITH CHECK (tenant_id IS NULL AND current_setting('app.provisioning_context', true) = 'true');
      CREATE POLICY provisioning_lookup ON claim_test_devices FOR SELECT
        USING (current_setting('app.provisioning_context', true) = 'true');
      CREATE POLICY device_claim ON claim_test_devices FOR UPDATE
        USING (tenant_id IS NULL)
        WITH CHECK (tenant_id = app_uuid('app.current_tenant_id'));
    `);

    const { rows: [a] } = await setup.query('INSERT INTO tenants DEFAULT VALUES RETURNING id');
    const { rows: [b] } = await setup.query('INSERT INTO tenants DEFAULT VALUES RETURNING id');
    tenantA = a.id;
    tenantB = b.id;

    // One already-claimed device (tenantA) and one unclaimed device.
    await setup.query('INSERT INTO claim_test_devices (tenant_id, serial) VALUES ($1, $2)', [tenantA, 'PLG-CLAIMED']);
    const { rows: [d] } = await setup.query(
      'INSERT INTO claim_test_devices (tenant_id, serial) VALUES (NULL, $1) RETURNING id',
      ['PLG-UNCLAIMED'],
    );
    unclaimedDeviceId = d.id;
  });

  afterAll(async () => {
    await setup.query('DROP TABLE IF EXISTS claim_test_devices, tenants CASCADE');
    await setup.end();
  });

  it('with app.claim_context set, an unclaimed device (tenant_id IS NULL) is visible to any authenticated tenant session — regression test for backend/api/routes/devices.ts\'s claim() lookup-by-serial', async () => {
    const rows = await withTenant(tenantB, async (client) => {
      await client.query("SET LOCAL app.claim_context = 'true'");
      return client.query('SELECT * FROM claim_test_devices WHERE serial = $1', ['PLG-UNCLAIMED']).then(r => r.rows);
    });
    expect(rows).toHaveLength(1);
  });

  it("a tenant session cannot see another tenant's already-claimed device by serial, even with app.claim_context set — unclaimed_lookup doesn't leak claimed rows", async () => {
    const rows = await withTenant(tenantB, async (client) => {
      await client.query("SET LOCAL app.claim_context = 'true'");
      return client.query('SELECT * FROM claim_test_devices WHERE serial = $1', ['PLG-CLAIMED']).then(r => r.rows);
    });
    expect(rows).toHaveLength(0);
  });

  it('WITHOUT app.claim_context set, a plain tenant session (the shape of list()/getOne()) does NOT see the unclaimed device — the actual leak this pass found and fixed, not assumed closed', async () => {
    const rows = await withTenant(tenantB, (client) =>
      client.query('SELECT * FROM claim_test_devices ORDER BY serial').then(r => r.rows),
    );
    // tenantB owns neither device — a plain list() call must return zero
    // rows, not the unclaimed device leaking in via a marker-less policy.
    expect(rows).toHaveLength(0);
  });

  it('the claim transition succeeds when the new tenant_id matches the caller\'s own app.current_tenant_id', async () => {
    await setup.query('BEGIN');
    try {
      await withTenant(tenantA, async (client) => {
        // claim_context must be set for the UPDATE too, not just a prior
        // lookup — devices.ts's real claim() sets it once for the whole
        // transaction. Without it the unclaimed row (tenant_id IS NULL) is
        // invisible to this session under every SELECT policy, so the UPDATE
        // matches zero rows and silently does nothing. This test previously
        // omitted it and therefore did not mirror the code path it exists to
        // cover.
        await client.query("SET LOCAL app.claim_context = 'true'");
        const { rows } = await client.query(
          'UPDATE claim_test_devices SET tenant_id = $2 WHERE id = $1 RETURNING *',
          [unclaimedDeviceId, tenantA],
        );
        expect(rows).toHaveLength(1);
      });
    } finally {
      // Revert for the next test — direct owner update, not through RLS.
      await setup.query('UPDATE claim_test_devices SET tenant_id = NULL WHERE id = $1', [unclaimedDeviceId]);
      await setup.query('COMMIT');
    }
  });

  it('device_claim\'s WITH CHECK rejects claiming a device into a DIFFERENT tenant than the session\'s own — real defense-in-depth, not just trusted application logic', async () => {
    await expect(
      withTenant(tenantA, async (client) => {
        // Same as the test above: claim_context is what makes the unclaimed
        // row visible at all. Without it this UPDATE matches zero rows and
        // resolves quietly, which looks like "WITH CHECK didn't fire" when in
        // fact the policy was never reached.
        await client.query("SET LOCAL app.claim_context = 'true'");
        return client.query('UPDATE claim_test_devices SET tenant_id = $2 WHERE id = $1 RETURNING *', [unclaimedDeviceId, tenantB]);
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('app.provisioning_context sees every device regardless of tenant — needed for collision-safe serial generation (scripts/provision-devices.ts)', async () => {
    const client = await getPool().then(p => p.connect());
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL app.provisioning_context = 'true'");
      const { rows } = await client.query('SELECT serial FROM claim_test_devices ORDER BY serial');
      expect(rows.map(r => r.serial).sort()).toEqual(['PLG-CLAIMED', 'PLG-UNCLAIMED']);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('without app.provisioning_context, no devices are visible at all — proves the exact undercounting risk found while designing this fix, and that unclaimed_lookup no longer leaks unclaimed rows to a marker-less connection either (corrected on the follow-up pass)', async () => {
    const client = await getPool().then(p => p.connect());
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT serial FROM claim_test_devices');
      // Neither app.provisioning_context nor app.claim_context is set here
      // — with the corrected policies, this must return nothing, not the
      // unclaimed device. An earlier draft's marker-less unclaimed_lookup
      // would have wrongly returned ['PLG-UNCLAIMED'] here.
      expect(rows).toEqual([]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

if (!RUN) {
  // eslint-disable-next-line no-console
  console.log('db.integration.test.ts skipped — TEST_DATABASE_URL not set. See Test Strategy §4.');
}
