import { Client } from 'pg';

// TD-50 (Water-Sector Security Hardening Strategy §5) — the real fix, not
// deferred any further. `TEST_DATABASE_URL` connects as the Postgres Docker
// image's own initdb superuser (whatever `POSTGRES_USER` is set to) — real
// Postgres superusers bypass Row-Level Security UNCONDITIONALLY, regardless
// of `FORCE ROW LEVEL SECURITY` (FORCE only affects a non-superuser table
// owner, the mechanism `rls_test_owner`/`policy_rls_owner` already
// correctly exercise elsewhere in this test suite). Every describe block
// that called withTenant()/withChannelPartner() directly — i.e. every one
// except the dedicated FORCE-RLS block — could therefore never prove RLS
// blocks anything: a query that should return 0 rows returned real
// cross-tenant data instead, because the connection ignored every policy.
//
// Fix: a dedicated non-superuser role (`peaklogic_test_app`) that
// shared/db.ts's getPool() connects as instead, gated behind a NEW env var
// (TEST_APP_DATABASE_URL) so this is additive — TEST_DATABASE_URL keeps
// meaning "elevated, for schema setup" exactly as every existing test
// file's own `setup`/`ownerClient` already assumes, no test file needed to
// change. `ALTER DEFAULT PRIVILEGES` (no `FOR ROLE` clause — defaults to
// the role running THIS statement, the same superuser every fixture's
// `setup` client also uses) means every table any fixture creates AFTER
// this global setup runs automatically grants the new role full DML,
// without needing a GRANT statement duplicated into every single
// describe block's `beforeAll`.
//
// vitest's `globalSetup` runs once, in-process, before any test file —
// portable across CI (ci.yml sets both TEST_DATABASE_URL and
// TEST_APP_DATABASE_URL against the same service container) and local dev
// (docker-compose.test.yml) without needing a Postgres-image-specific init
// script mechanism (GitHub Actions service containers start before
// `actions/checkout` runs, so a repo-tracked init SQL file can't be volume-
// mounted into them at all — this runs from Node instead, sidestepping
// that constraint entirely).
const APP_ROLE = 'peaklogic_test_app';
const APP_PASSWORD = 'test';

export default async function setup(): Promise<void> {
  if (!process.env.TEST_DATABASE_URL) return; // every test file already self-skips in this case

  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
        END IF;
      END $$;
    `);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE}`,
    );
  } finally {
    await client.end();
  }
}
