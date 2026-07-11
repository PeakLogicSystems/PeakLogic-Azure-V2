import { defineConfig } from 'vitest/config';

// Test Strategy §2 — unit tests only (pure logic, no I/O, run everywhere
// including CI's default job with no services attached). Integration tests
// (real Postgres, RLS enforcement) are a separate config/command — see
// vitest.integration.config.ts — so `npm test` never silently needs a
// database that isn't there.
export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', 'node_modules/**'],
    environment: 'node',
  },
});
