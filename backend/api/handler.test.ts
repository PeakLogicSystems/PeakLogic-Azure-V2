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
