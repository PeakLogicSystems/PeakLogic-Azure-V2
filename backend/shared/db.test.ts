import { describe, it, expect } from 'vitest';
import { requirePartnerRole } from './db';

// requirePartnerRole() (Security Architecture §2.4, added v1.1) is a pure
// function — no DB/RLS involved, unlike withChannelPartner() itself, which
// is covered against a real Postgres in db.integration.test.ts.

describe('requirePartnerRole', () => {
  it('allows a session whose role is in the permitted list', () => {
    expect(() =>
      requirePartnerRole({ channelPartnerUserId: 'cpu-1', role: 'partner_admin' }, 'partner_admin'),
    ).not.toThrow();
  });

  it('allows a technician when technician is explicitly permitted', () => {
    expect(() =>
      requirePartnerRole({ channelPartnerUserId: 'cpu-1', role: 'technician' }, 'partner_admin', 'technician'),
    ).not.toThrow();
  });

  it('rejects a technician session on a partner_admin-only action (e.g. route confirmation, TR-3.1)', () => {
    expect(() =>
      requirePartnerRole({ channelPartnerUserId: 'cpu-1', role: 'technician' }, 'partner_admin'),
    ).toThrow(/not permitted/);
  });

  it('throws with statusCode 403', () => {
    try {
      requirePartnerRole({ channelPartnerUserId: 'cpu-1', role: 'technician' }, 'partner_admin');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(403);
    }
  });
});
