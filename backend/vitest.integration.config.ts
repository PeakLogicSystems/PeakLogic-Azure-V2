import { defineConfig } from 'vitest/config';

// Test Strategy §3/§4 — integration tests that need a real Postgres
// (RLS/tenant-isolation enforcement can't be verified against a mock; a
// mocked pg.Pool would just return whatever the mock says, which is exactly
// the blind spot that let the telemetry table ship without RLS in the first
// place — Multi-Tenant Architecture §2.2). Requires TEST_DATABASE_URL
// pointing at a real, disposable Postgres 16 instance — see
// docker-compose.test.yml for local use, or CI's postgres service container.
// Deliberately excluded from the default `npm test` run (vitest.config.ts)
// so unit tests never silently require a database that isn't there.
export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    exclude: ['node_modules/**'],
    environment: 'node',
    // RLS integration tests share one schema/connection setup — safer run
    // serially than risk two tests' transactions interleaving in ways that
    // mask a real isolation bug as a flaky test.
    fileParallelism: false,
    // TD-50 — creates the non-superuser peaklogic_test_app role (once, before
    // any test file) that getPool() connects as via TEST_APP_DATABASE_URL,
    // so RLS is actually enforced against these tests instead of silently
    // bypassed by TEST_DATABASE_URL's own superuser connection. See
    // vitest.integration.setup.ts's header comment for the full reasoning.
    globalSetup: ['./vitest.integration.setup.ts'],
  },
});
