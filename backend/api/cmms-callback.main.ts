import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { getPool } from '../shared/db';
import { handleCmmsCallback, type CmmsCallbackStatus } from './cmms-callback-handler';

// Inbound CMMS webhook receiver — reporting-and-kpi-design.md §5's designed
// `POST /v1/cmms/callback/{connectorId}` surface, built 2026-08-09. A
// STANDALONE anonymous Function, not routed through api.main.ts/router.ts —
// same precedent as health.main.ts: the caller here is a CMMS vendor's
// server, not an authenticated PeakLogic session, so it needs no Entra JWT
// and would only be broken by requiring one. Its own signature verification
// (handleCmmsCallback → the vendor adapter's verifyWebhookSignature) is the
// real authentication boundary. Named cmms-callback.main.ts, not
// cmms-callback.ts — package.json's "dist/**/*.main.js" discovery glob
// requires the *.main.ts suffix (TD-56).
//
// Route is 'cmms/callback/{connectorId}', not '/v1/cmms/callback/...' —
// this Function App clears the default 'api' route prefix (host.json,
// api.main.ts's own header explains why) and deliberately doesn't reuse the
// v1 prefix either, since this isn't a v1 REST resource a PeakLogic client
// calls — it's a webhook target a vendor's system calls.
app.http('cmms-callback', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cmms/callback/{connectorId}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const connectorId = request.params.connectorId;
    if (!connectorId) {
      return { status: 400, jsonBody: { status: 'unknown_connector' } };
    }

    // Raw text, not request.json() — signature verification is computed
    // over the exact bytes the vendor signed; parsing and re-serializing
    // first could produce a byte-different string and break verification.
    const rawBody = await request.text();
    const headers: Record<string, string | undefined> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    try {
      const pool = await getPool();
      const result = await handleCmmsCallback(pool, connectorId, rawBody, headers);
      context.log(`CMMS callback [${connectorId}]: ${result.status}${result.detail ? ` — ${result.detail}` : ''}`);
      return { status: statusCodeFor(result.status), jsonBody: { status: result.status } };
    } catch (err) {
      context.error(`CMMS callback [${connectorId}] threw`, err);
      // A genuine unexpected failure (DB error, etc.) — 500 so the
      // vendor's own retry backoff (confirmed 10s/30s/60s/300s on a
      // non-2xx response) gets a chance to recover it, unlike the
      // deliberate, permanent rejections below.
      return { status: 500, jsonBody: { status: 'error' } };
    }
  },
});

function statusCodeFor(status: CmmsCallbackStatus): number {
  switch (status) {
    case 'advanced':
    case 'noop':
    case 'unrecognized_event':
      // Handled correctly, including "this event type isn't tracked" —
      // 200 tells the vendor "received," no retry needed, since a retry
      // would never produce a different outcome for these.
      return 200;
    case 'unknown_ticket':
      // Retryable on purpose: a webhook can legitimately arrive before the
      // dispatch outbox has persisted this ticket's external_ref (the
      // sweep runs on its own ~1-minute cadence) — a 404 lets the vendor's
      // own retry backoff give that race a chance to resolve itself.
      return 404;
    case 'unknown_connector':
      return 404;
    case 'unauthorized':
      return 401;
  }
}
