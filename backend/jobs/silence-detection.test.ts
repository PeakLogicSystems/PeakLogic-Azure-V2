import { describe, it, expect } from 'vitest';
import { findSilentDevices, formatSilenceMessage, DEFAULT_REPORTING_INTERVAL_S, DEFAULT_GRACE_MULTIPLIER } from './silence-detection';
import type { DeviceLastSeen } from './silence-detection';

const now = new Date('2026-07-21T12:00:00Z');
function minutesAgo(m: number): Date {
  return new Date(now.getTime() - m * 60_000);
}

function device(overrides: Partial<DeviceLastSeen> = {}): DeviceLastSeen {
  return { deviceId: 'd1', category: 'pump', lastSeenAt: minutesAgo(1), status: 'online', ...overrides };
}

describe('findSilentDevices', () => {
  it('does not flag a device reporting well within its expected interval', () => {
    // pump expects every 300s (5 min); 1 minute ago is fine
    expect(findSilentDevices([device({ lastSeenAt: minutesAgo(1) })], now)).toEqual([]);
  });

  it('does not flag a device silent for less than the grace-multiplied interval', () => {
    // pump: 300s * 3 = 900s = 15 min grace window. 14 min ago should not flag.
    expect(findSilentDevices([device({ lastSeenAt: minutesAgo(14) })], now)).toEqual([]);
  });

  it('flags a device once it clears the grace-multiplied interval', () => {
    // 16 min ago clears the 15-minute (300s*3) grace window
    const result = findSilentDevices([device({ lastSeenAt: minutesAgo(16) })], now);
    expect(result).toHaveLength(1);
    expect(result[0].deviceId).toBe('d1');
    expect(result[0].category).toBe('pump');
    expect(result[0].expectedIntervalS).toBe(300);
  });

  it('flags exactly at the boundary (>=), not just strictly past it', () => {
    // Exactly 15 min ago = exactly 900s = 300 * 3 boundary
    const result = findSilentDevices([device({ lastSeenAt: minutesAgo(15) })], now);
    expect(result).toHaveLength(1);
  });

  it('skips a decommissioned device regardless of how long it has been silent', () => {
    expect(findSilentDevices([device({ status: 'decommissioned', lastSeenAt: minutesAgo(10_000) })], now)).toEqual([]);
  });

  it('skips a still-provisioning device regardless of how long it has been silent', () => {
    expect(findSilentDevices([device({ status: 'provisioning', lastSeenAt: minutesAgo(10_000) })], now)).toEqual([]);
  });

  it('skips a device that has never reported at all (lastSeenAt null) — a different gap, out of scope here', () => {
    expect(findSilentDevices([device({ lastSeenAt: null })], now)).toEqual([]);
  });

  it('skips a device with no linked asset (category null) — cannot determine an expected interval', () => {
    expect(findSilentDevices([device({ category: null, lastSeenAt: minutesAgo(10_000) })], now)).toEqual([]);
  });

  it('skips a device whose category has no configured interval, rather than guessing one', () => {
    expect(findSilentDevices([device({ category: 'some_unknown_category', lastSeenAt: minutesAgo(10_000) })], now)).toEqual([]);
  });

  it('applies per-category intervals correctly — gas_sensor flags much sooner than pool_chemistry', () => {
    // gas_sensor: 120s * 3 = 6 min grace. pool_chemistry: 900s * 3 = 45 min grace.
    const devices: DeviceLastSeen[] = [
      device({ deviceId: 'gas-1', category: 'gas_sensor', lastSeenAt: minutesAgo(7) }),
      device({ deviceId: 'chem-1', category: 'pool_chemistry', lastSeenAt: minutesAgo(7) }),
    ];
    const result = findSilentDevices(devices, now);
    expect(result.map((r) => r.deviceId)).toEqual(['gas-1']);
  });

  it('respects a custom intervals map and grace multiplier', () => {
    const result = findSilentDevices(
      [device({ category: 'custom', lastSeenAt: minutesAgo(5) })],
      now,
      { intervals: { custom: 60 }, graceMultiplier: 2 }, // 60s*2=120s=2min grace
    );
    expect(result).toHaveLength(1);
  });

  it('processes a mixed fleet independently, one result per silent device', () => {
    const devices: DeviceLastSeen[] = [
      device({ deviceId: 'ok-1', lastSeenAt: minutesAgo(1) }),
      device({ deviceId: 'silent-1', lastSeenAt: minutesAgo(20) }),
      device({ deviceId: 'silent-2', category: 'hvac', lastSeenAt: minutesAgo(20) }),
      device({ deviceId: 'never-reported', lastSeenAt: null }),
    ];
    const result = findSilentDevices(devices, now);
    expect(result.map((r) => r.deviceId).sort()).toEqual(['silent-1', 'silent-2']);
  });

  it('exports defaults that are internally consistent (sanity check, not a behavior test)', () => {
    expect(DEFAULT_GRACE_MULTIPLIER).toBeGreaterThan(1);
    for (const category of Object.keys(DEFAULT_REPORTING_INTERVAL_S)) {
      expect(DEFAULT_REPORTING_INTERVAL_S[category]).toBeGreaterThan(0);
    }
  });
});

describe('formatSilenceMessage', () => {
  it('includes minutes silent and the expected cadence', () => {
    const result = findSilentDevices([device({ lastSeenAt: minutesAgo(16) })], now)[0];
    const message = formatSilenceMessage(result);
    expect(message).toContain('16 min');
    expect(message).toContain('~5 min');
  });
});
