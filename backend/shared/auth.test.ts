import { describe, it, expect } from 'vitest';
import type { HttpRequest } from '@azure/functions';
import { requireRole, requireStaffRole, getAuth, getPartnerAuth, getStaffAuth } from './auth';

// New test file for this fork — no auth.test.ts existed on the AWS side
// either (the original getAuth()/getPartnerAuth()/getStaffAuth() were
// synchronous, header-injected-by-API-Gateway functions with no fail-closed
// path worth unit testing beyond requireRole()'s own pure-function tests,
// which this file also carries forward unchanged). This fork's versions do
// real, testable work before ever reaching the network (JWKS fetch), so
// that fail-closed behavior is covered here directly rather than assumed.

function makeRequest(headers: Record<string, string> = {}): HttpRequest {
  return {
    headers: {
      get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
  } as unknown as HttpRequest;
}

describe('requireRole (unchanged pure-function logic, portable from the AWS version verbatim)', () => {
  it('allows a role present in the permitted list', () => {
    expect(() => requireRole({ sub: 's', email: '', tenantId: 't', role: 'admin' }, 'admin', 'operator')).not.toThrow();
  });

  it('rejects a role not in the permitted list, with statusCode 403', () => {
    try {
      requireRole({ sub: 's', email: '', tenantId: 't', role: 'operator' }, 'admin');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatch(/not permitted/);
      expect((err as { statusCode?: number }).statusCode).toBe(403);
    }
  });
});

describe('requireStaffRole (unchanged pure-function logic, portable from the AWS version verbatim)', () => {
  it('allows superadmin where account_manager alone would be rejected', () => {
    expect(() => requireStaffRole({ sub: 's', email: '', role: 'superadmin' }, 'superadmin')).not.toThrow();
    expect(() => requireStaffRole({ sub: 's', email: '', role: 'account_manager' }, 'superadmin')).toThrow(/not permitted/);
  });
});

describe('getAuth / getPartnerAuth / getStaffAuth — fail-closed before any network call, new for this fork', () => {
  // These three assertions are the real, new-for-Azure behavior worth
  // testing directly: unlike the AWS version (where API Gateway's Cognito
  // authorizer had already rejected an unauthenticated request before
  // Lambda ever ran), this fork's functions must themselves reject a
  // missing/malformed Authorization header before attempting a JWKS fetch —
  // verified here without a real Entra tenant, since the rejection happens
  // before any network call is made.

  it('getAuth rejects a request with no Authorization header, without making a network call', async () => {
    await expect(getAuth(makeRequest())).rejects.toMatchObject({ statusCode: 401 });
  });

  it('getAuth rejects a non-Bearer Authorization header', async () => {
    await expect(getAuth(makeRequest({ authorization: 'Basic dXNlcjpwYXNz' }))).rejects.toMatchObject({ statusCode: 401 });
  });

  it('getPartnerAuth rejects a request with no Authorization header', async () => {
    await expect(getPartnerAuth(makeRequest())).rejects.toMatchObject({ statusCode: 401 });
  });

  it('getStaffAuth rejects a request with no Authorization header', async () => {
    await expect(getStaffAuth(makeRequest())).rejects.toMatchObject({ statusCode: 401 });
  });
});
