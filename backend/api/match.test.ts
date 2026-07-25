import { describe, it, expect } from 'vitest';
import { compileRoutes, matchRoute, type RouteHandler } from './match';

// The route matcher is new, non-trivial Azure-port logic (it replaces AWS API
// Gateway's resource-template injection), so it gets real coverage — a wrong
// match here would silently route a request to the wrong handler or 404 a
// valid path. Uses trivial marker handlers; only the matching is under test.

const h = (id: string): RouteHandler<unknown> =>
  async () => ({ statusCode: 200, headers: {}, body: id });

const routes = compileRoutes<unknown>({
  'GET /v1/devices': h('list'),
  'POST /v1/devices': h('claim'),
  'GET /v1/devices/{deviceId}': h('getOne'),
  'PUT /v1/settings': h('settings'),
  'PUT /v1/settings/password': h('password'),
  'GET /v1/settings/mfa': h('mfa'),
  'PUT /v1/settings/team/{userId}': h('teamUpdate'),
  'POST /v1/admin/tenants/{tenantId}/users': h('tenantUser'),
  // new unified-platform route shapes
  'GET /v1/tickets/funnel': h('funnel'),
  'GET /v1/tickets/{ticketId}': h('ticketOne'),
  'POST /v1/hubs/{hubId}/heartbeat': h('hubHeartbeat'),
  'GET /v1/hubs/{hubId}/peakassist-sync': h('hubSync'),
});

async function bodyOf(method: string, path: string): Promise<string | null> {
  const m = matchRoute(routes, method, path);
  if (!m) return null;
  const res = await m.handler({} as never, undefined);
  return res.body;
}

describe('matchRoute', () => {
  it('matches a literal collection route', async () => {
    expect(await bodyOf('GET', '/v1/devices')).toBe('list');
  });

  it('distinguishes methods on the same path', async () => {
    expect(await bodyOf('POST', '/v1/devices')).toBe('claim');
    expect(await bodyOf('GET', '/v1/devices')).toBe('list');
  });

  it('matches a single path parameter and extracts it', () => {
    const m = matchRoute(routes, 'GET', '/v1/devices/abc-123');
    expect(m).not.toBeNull();
    expect(m!.pathParameters).toEqual({ deviceId: 'abc-123' });
  });

  it('extracts multiple path parameters', () => {
    const m = matchRoute(routes, 'POST', '/v1/admin/tenants/t-1/users');
    expect(m!.pathParameters).toEqual({ tenantId: 't-1' });
  });

  it('prefers a literal route over a param route at the same depth', async () => {
    // /v1/settings/password (literal) and /v1/settings/team/{userId} (param)
    // are different depths, but /v1/settings/mfa (literal) must never be
    // captured by a param route — verify the literal wins.
    expect(await bodyOf('GET', '/v1/settings/mfa')).toBe('mfa');
    expect(await bodyOf('PUT', '/v1/settings/password')).toBe('password');
  });

  it('does not let a param segment swallow a deeper path', () => {
    // /v1/devices/{deviceId} must NOT match /v1/devices/a/b (extra segment)
    expect(matchRoute(routes, 'GET', '/v1/devices/a/b')).toBeNull();
  });

  it('returns null for an unregistered path', () => {
    expect(matchRoute(routes, 'GET', '/v1/nope')).toBeNull();
  });

  it('URL-decodes path parameters', () => {
    const m = matchRoute(routes, 'PUT', '/v1/settings/team/user%40x.com');
    expect(m!.pathParameters).toEqual({ userId: 'user@x.com' });
  });

  it('prefers a literal over a param at the same depth (tickets/funnel vs {ticketId})', async () => {
    expect(await bodyOf('GET', '/v1/tickets/funnel')).toBe('funnel');
    const one = matchRoute(routes, 'GET', '/v1/tickets/tck-9');
    expect(one!.pathParameters).toEqual({ ticketId: 'tck-9' });
  });

  it('matches a trailing literal after a path parameter (hub heartbeat)', () => {
    const m = matchRoute(routes, 'POST', '/v1/hubs/hub-1/heartbeat');
    expect(m).not.toBeNull();
    expect(m!.pathParameters).toEqual({ hubId: 'hub-1' });
  });

  it('matches a hyphenated trailing literal (peakassist-sync)', () => {
    const m = matchRoute(routes, 'GET', '/v1/hubs/hub-1/peakassist-sync');
    expect(m!.pathParameters).toEqual({ hubId: 'hub-1' });
  });
});
