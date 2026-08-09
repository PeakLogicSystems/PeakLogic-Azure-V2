import { app, type HttpResponseInit } from '@azure/functions';

// Architecture-review Gap 6/ADR-004, added 2026-08-09 — deploy-dev.yml's own
// workflow used to end at the zip-deploy step with no verification at all;
// a bad deploy had no automated safety net. This is the smoke-test target:
// a real Azure Functions liveness check that proves the Function App itself
// started successfully and is routing requests, independent of Postgres,
// Entra, or APIM (that's the point — a smoke test that depends on every
// downstream system can't tell "the deploy failed" apart from "the database
// is slow today"). Deliberately does NOT touch withTenant()/getPool() or
// require an Entra token or the APIM shared-secret header — this endpoint
// reveals nothing sensitive, and gating it on any of those would defeat the
// purpose of an independent liveness check.
//
// route 'health' resolves to plain /health, not /api/health — host.json
// clears the default 'api' route prefix for this Function App (see
// api.main.ts's own header comment for why). Named health.main.ts, not
// health.ts, for the same reason api.main.ts is named that and not
// main.ts — package.json's "dist/**/*.main.js" discovery glob requires it.
app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async (): Promise<HttpResponseInit> => ({
    status: 200,
    jsonBody: { status: 'ok', service: 'peaklogic-api' },
  }),
});
