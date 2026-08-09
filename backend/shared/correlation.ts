import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { HttpRequest } from '@azure/functions';

// Architecture-review Gap 13 — zero correlation-ID mechanism existed
// anywhere in the request pipeline (confirmed by a repo-wide grep for
// correlationId/x-correlation-id/x-request-id: zero matches). Without one,
// answering "which request caused this audit entry / this error?" requires
// manually correlating timestamps across logs — this makes it a lookup.
//
// AsyncLocalStorage propagates the ID through the whole async call chain of
// a single request (API boundary -> route handler -> writeAuditLog(),
// however many awaits deep) with ZERO changes to any existing function's
// signature. The alternative — threading an explicit parameter through the
// 40+ route handlers across 19 files that call withTenant() — is
// disproportionate risk and churn for what this adds; AsyncLocalStorage is
// a standard Node.js built-in (no new dependency), not a novel pattern.
const correlationStorage = new AsyncLocalStorage<string>();

/**
 * Reads x-correlation-id if the caller supplied one — real distributed
 * tracing across services (a partner's system, or a future gateway,
 * calling in with its own trace id) should be preserved, not discarded —
 * else generates a new one. Never trusts an empty/whitespace-only value.
 */
export function extractOrCreateCorrelationId(request: HttpRequest): string {
  const provided = request.headers.get('x-correlation-id');
  return provided && provided.trim() ? provided.trim() : randomUUID();
}

/**
 * Runs fn with correlationId available to every getCorrelationId() call in
 * its async call chain, however deep — call once, at a request's entry
 * point (api.main.ts's handler), not per route.
 */
export function withCorrelationId<T>(correlationId: string, fn: () => T): T {
  return correlationStorage.run(correlationId, fn);
}

/**
 * The current request's correlation ID, or undefined outside a
 * withCorrelationId() scope — a scheduled job (backend/jobs/*.main.ts) has
 * no incoming HTTP request to derive one from; give it its own at its own
 * entry point when that's worth doing, rather than this returning a
 * misleading fallback here.
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}
