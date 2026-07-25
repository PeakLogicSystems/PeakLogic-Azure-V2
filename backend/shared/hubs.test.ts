import { describe, it, expect } from 'vitest';
import {
  buildHubRegistration,
  applyHeartbeat,
  findSilentHubs,
  hubHealthSummary,
  formatHubSilenceMessage,
  HUB_HEARTBEAT_INTERVAL_S,
  HUB_GRACE_MULTIPLIER,
  type HubHeartbeatState,
} from './hubs';

const now = new Date('2026-07-25T12:00:00Z');
function minutesAgo(m: number): Date {
  return new Date(now.getTime() - m * 60_000);
}

describe('buildHubRegistration', () => {
  it('normalizes a valid registration and starts it provisioning', () => {
    const r = buildHubRegistration({ siteId: 's1', name: '  Riverside Hub  ', hardwareSerial: 'SN-1' });
    expect(r).toEqual({
      siteId: 's1',
      name: 'Riverside Hub', // trimmed
      hardwareSerial: 'SN-1',
      agentVersion: null,
      status: 'provisioning', // NOT online until first heartbeat
      protocolConfig: {},
    });
  });
  it('rejects a missing name or site rather than writing a half-formed row', () => {
    expect(() => buildHubRegistration({ siteId: 's1', name: '   ' })).toThrow(/name/);
    expect(() => buildHubRegistration({ siteId: '', name: 'x' })).toThrow(/siteId/);
  });
});

describe('applyHeartbeat', () => {
  it('marks the hub online and stamps last_seen', () => {
    const u = applyHeartbeat({ at: now });
    expect(u.status).toBe('online');
    expect(u.lastSeenAt).toBe(now);
  });
  it('carries reported versions, or null when omitted (handler keeps existing)', () => {
    expect(applyHeartbeat({ at: now, agentVersion: '1.4.2', peakassistContentVersion: '2026.07.1' })).toMatchObject({
      agentVersion: '1.4.2',
      peakassistContentVersion: '2026.07.1',
    });
    expect(applyHeartbeat({ at: now })).toMatchObject({ agentVersion: null, peakassistContentVersion: null });
  });
});

describe('findSilentHubs', () => {
  function hub(overrides: Partial<HubHeartbeatState> = {}): HubHeartbeatState {
    return { id: 'h1', status: 'online', lastSeenAt: minutesAgo(1), ...overrides };
  }

  it('does not flag a hub heart-beating within its grace window', () => {
    // 60s * 3 = 180s = 3 min grace; 2 min ago is fine
    expect(findSilentHubs([hub({ lastSeenAt: minutesAgo(2) })], now)).toEqual([]);
  });

  it('flags an online hub that cleared the grace-multiplied interval', () => {
    const silent = findSilentHubs([hub({ lastSeenAt: minutesAgo(10) })], now);
    expect(silent).toHaveLength(1);
    expect(silent[0].id).toBe('h1');
    expect(silent[0].expectedIntervalS).toBe(HUB_HEARTBEAT_INTERVAL_S);
  });

  it('skips a provisioning hub (never expected to report yet)', () => {
    expect(findSilentHubs([hub({ status: 'provisioning', lastSeenAt: minutesAgo(60) })], now)).toEqual([]);
  });

  it('skips an already-offline hub (already flagged)', () => {
    expect(findSilentHubs([hub({ status: 'offline', lastSeenAt: minutesAgo(60) })], now)).toEqual([]);
  });

  it('skips a hub that has never checked in (last_seen null — onboarding gap, out of scope)', () => {
    expect(findSilentHubs([hub({ lastSeenAt: null })], now)).toEqual([]);
  });

  it('honors a custom interval/grace', () => {
    // interval 10s, grace 2 -> 20s window; 1 min ago is silent
    expect(findSilentHubs([hub({ lastSeenAt: minutesAgo(1) })], now, { intervalS: 10, graceMultiplier: 2 })).toHaveLength(1);
    expect(HUB_GRACE_MULTIPLIER).toBe(3); // default unchanged
  });
});

describe('hubHealthSummary', () => {
  it('counts by status', () => {
    const s = hubHealthSummary([{ status: 'online' }, { status: 'online' }, { status: 'offline' }, { status: 'provisioning' }]);
    expect(s).toEqual({ total: 4, online: 2, offline: 1, provisioning: 1 });
  });
});

describe('formatHubSilenceMessage', () => {
  it('reads for an operator — site keeps running, cloud sync paused', () => {
    const msg = formatHubSilenceMessage({ id: 'h1', silentForSeconds: 600, expectedIntervalS: 60 });
    expect(msg).toMatch(/10 min/);
    expect(msg).toMatch(/cloud sync is paused/i);
  });
});
