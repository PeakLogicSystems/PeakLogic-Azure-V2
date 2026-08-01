import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Water-Sector Security Hardening Strategy §5 Tier 0.3 — real regression
// coverage for the device-identity revocation path, not a formality. Mocks
// azure-iothub's Registry the same way cmms.test.ts mocks postWebhook —
// this function's job is picking the right call per state (no connection
// string / device not found / already disabled / real disable), not
// exercising the real SDK.

const mockGet = vi.fn();
const mockUpdate = vi.fn();

vi.mock('azure-iothub', () => ({
  Registry: {
    fromConnectionString: vi.fn(() => ({ get: mockGet, update: mockUpdate })),
  },
}));

import { disableDeviceIdentity } from './device-identity';

describe('disableDeviceIdentity', () => {
  const ORIGINAL_ENV = process.env.IOT_HUB_REGISTRY_CONNECTION;

  beforeEach(() => {
    mockGet.mockReset();
    mockUpdate.mockReset();
  });

  afterEach(() => {
    process.env.IOT_HUB_REGISTRY_CONNECTION = ORIGINAL_ENV;
  });

  it('no-ops when IoT Hub has not been deployed to this stage (no connection string)', async () => {
    delete process.env.IOT_HUB_REGISTRY_CONNECTION;
    await expect(disableDeviceIdentity('SN-001')).resolves.toBeUndefined();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('no-ops when the device was never enrolled via DPS (DeviceNotFoundError)', async () => {
    process.env.IOT_HUB_REGISTRY_CONNECTION = 'HostName=fake;SharedAccessKeyName=registryReadWrite;SharedAccessKey=fake';
    const err = new Error('not found');
    err.name = 'DeviceNotFoundError';
    mockGet.mockRejectedValue(err);

    await expect(disableDeviceIdentity('SN-002')).resolves.toBeUndefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('is idempotent — does not call update when the device is already disabled', async () => {
    process.env.IOT_HUB_REGISTRY_CONNECTION = 'HostName=fake;SharedAccessKeyName=registryReadWrite;SharedAccessKey=fake';
    mockGet.mockResolvedValue({ responseBody: { deviceId: 'SN-003', status: 'disabled' } });

    await disableDeviceIdentity('SN-003');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('disables an enabled device identity', async () => {
    process.env.IOT_HUB_REGISTRY_CONNECTION = 'HostName=fake;SharedAccessKeyName=registryReadWrite;SharedAccessKey=fake';
    mockGet.mockResolvedValue({ responseBody: { deviceId: 'SN-004', status: 'enabled' } });
    mockUpdate.mockResolvedValue({ responseBody: { deviceId: 'SN-004', status: 'disabled' } });

    await disableDeviceIdentity('SN-004');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [updatedDevice] = mockUpdate.mock.calls[0];
    expect(updatedDevice.status).toBe('disabled');
    expect(updatedDevice.deviceId).toBe('SN-004');
  });

  it('does not throw when the registry call fails for a reason other than DeviceNotFoundError', async () => {
    process.env.IOT_HUB_REGISTRY_CONNECTION = 'HostName=fake;SharedAccessKeyName=registryReadWrite;SharedAccessKey=fake';
    mockGet.mockRejectedValue(new Error('transient network error'));

    await expect(disableDeviceIdentity('SN-005')).resolves.toBeUndefined();
  });
});
