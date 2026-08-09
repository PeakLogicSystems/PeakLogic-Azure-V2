import { describe, it, expect, afterEach } from 'vitest';
import type { HttpRequest } from '@azure/functions';
import { handleApiRequest } from './handler';

// Water-Sector Security Hardening Strategy §5 Tier 0.5 — real regression
// coverage for the new APIM-bypass guard specifically (isDirectBackendCall
// Allowed()'s own logic is fully covered in shared/apim-guard.test.ts). Only
// the REJECTED path is tested here without further mocking, since a
// rejection returns immediately before getAuth()/the routers are ever
// reached; the allowed/not-enforced path is exercised implicitly by every
// other route-level test in this suite, none of which set APIM_SHARED_SECRET.

function fakeRequest(headerValue: string | null): HttpRequest {
  return {
    headers: { get: (name: string) => (name === 'x-peaklogic-apim-secret' ? headerValue : null) },
  } as unknown as HttpRequest;
}

describe('handleApiRequest — APIM shared-secret guard', () => {
  const ORIGINAL = process.env.APIM_SHARED_SECRET;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.APIM_SHARED_SECRET;
    else process.env.APIM_SHARED_SECRET = ORIGINAL;
  });

  it('returns 403 when a secret is configured and the header is missing', async () => {
    process.env.APIM_SHARED_SECRET = 'real-secret';
    const res = await handleApiRequest(fakeRequest(null));
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when a secret is configured and the header does not match', async () => {
    process.env.APIM_SHARED_SECRET = 'real-secret';
    const res = await handleApiRequest(fakeRequest('wrong'));
    expect(res.statusCode).toBe(403);
  });
});

// Architecture-review Gap 13 — every response echoes x-correlation-id, even
// on an error path (a caller/support ticket quoting it must be able to find
// the request whether it succeeded or failed). Deliberately exercised via a
// request that fails deep inside routing (no further mocking provided) —
// the point is that handleApiRequest's own wrapper stamps the header
// regardless of what handleRoutedRequest() returns, not that routing itself
// succeeds; that's covered by this suite's other route-level tests.
describe('handleApiRequest — correlation id (architecture-review Gap 13)', () => {
  function requestWithHeaders(headers: Record<string, string | null>): HttpRequest {
    return {
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      method: 'GET',
      url: 'https://example.invalid/v1/sites',
    } as unknown as HttpRequest;
  }

  it('generates and echoes a new x-correlation-id when the caller does not supply one', async () => {
    const res = await handleApiRequest(requestWithHeaders({}));
    const id = res.headers['x-correlation-id'];
    expect(id).toBeTruthy();
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('forwards the caller-supplied x-correlation-id unchanged, for cross-service tracing', async () => {
    const res = await handleApiRequest(requestWithHeaders({ 'x-correlation-id': 'caller-supplied-trace-id' }));
    expect(res.headers['x-correlation-id']).toBe('caller-supplied-trace-id');
  });

  it('does not mutate the shared CORS_HEADERS object across requests with different correlation ids', async () => {
    const first = await handleApiRequest(requestWithHeaders({ 'x-correlation-id': 'req-1' }));
    const second = await handleApiRequest(requestWithHeaders({ 'x-correlation-id': 'req-2' }));
    expect(first.headers['x-correlation-id']).toBe('req-1');
    expect(second.headers['x-correlation-id']).toBe('req-2');
  });
});
