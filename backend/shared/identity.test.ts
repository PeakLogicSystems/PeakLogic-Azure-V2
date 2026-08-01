import { describe, it, expect, vi, beforeEach } from 'vitest';

// Water-Sector Security Hardening Strategy §5 Tier 0.2 — real regression
// coverage for revokeUserSessions(), the first test this file has ever had
// (createEntraUser's own Graph calls are disclosed as "typecheck but
// unverified at runtime" — this doesn't retroactively test that, only the
// new addition). Mocks @azure/identity's credential classes (no real Azure
// access in this environment) and the global fetch() identity.ts's graph()
// helper calls directly.

const mockGetToken = vi.fn(async () => ({ token: 'fake-token', expiresOnTimestamp: Date.now() + 60_000 }));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({ getToken: mockGetToken })),
  ClientSecretCredential: vi.fn().mockImplementation(() => ({ getToken: mockGetToken })),
}));

import { revokeUserSessions } from './identity';

describe('revokeUserSessions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('calls Graph revokeSignInSessions and resolves when Graph reports success', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ value: true }),
    } as Response);

    await expect(revokeUserSessions('staff', 'user-123')).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://graph.microsoft.com/v1.0/users/user-123/revokeSignInSessions');
    expect(init?.method).toBe('POST');
  });

  it('throws when Graph reports value: false (sessions not actually revoked)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ value: false }),
    } as Response);

    await expect(revokeUserSessions('staff', 'user-123')).rejects.toThrow(/reported failure/);
  });

  it('throws when the Graph call itself fails (non-2xx)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Insufficient privileges',
    } as Response);

    await expect(revokeUserSessions('staff', 'user-123')).rejects.toThrow(/Graph POST/);
  });
});
