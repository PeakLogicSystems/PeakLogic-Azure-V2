import { Registry } from 'azure-iothub';

// Water-Sector Security Hardening Strategy §3/§5 Tier 0.3 — the direct
// analog of the 2026-07-26/27 water-sector attacks' operator-lockout
// technique, in reverse: a decommissioned or stolen device's credential
// must stop being trusted immediately, not just stop appearing in the app.
// Before this, devices.ts's remove() only flipped a DB status flag —
// IOT_HUB_REGISTRY_CONNECTION (iot.bicep's registryReadWrite policy, added
// alongside this file) is the ONLY thing that actually revokes the
// underlying IoT Hub device identity.
//
// HONEST LIMITATION, not silently glossed over: DPS enrollment (Device &
// Command Security Architecture §2, Hub Enrollment & Identity Design) is
// still unbuilt — no code path creates a real IoT Hub device identity for
// any device yet. Until it does, calling this on a real decommission is a
// safe, logged no-op (the device was never enrolled, so there is nothing to
// disable) — this module activates for real the moment DPS enrollment
// ships, the same "build the mechanism now, it activates once its
// prerequisite exists" pattern this project already uses elsewhere
// (e.g. AI_ANALYTICS_ENABLED, POLICY_ENGINE_ENABLED).
//
// Deliberately best-effort and never-throwing, mirroring
// backend/shared/poison-messages.ts's recordPoisonMessage() — an IoT
// Hub-side failure (or IoT Hub not being deployed to this stage at all)
// must never block the DB-side decommission, which is the actual
// tenant-facing, safety-relevant operation.
//
// Device identity naming: the IoT Hub deviceId is the device's serial
// number, matching Device & Command Security Architecture §2's "leaf-cert
// CN = serial" convention — no separate id-mapping table needed.

let cachedRegistry: Registry | null = null;

function getRegistry(): Registry | null {
  const connectionString = process.env.IOT_HUB_REGISTRY_CONNECTION;
  if (!connectionString) return null;
  if (!cachedRegistry) {
    cachedRegistry = Registry.fromConnectionString(connectionString);
  }
  return cachedRegistry;
}

function isDeviceNotFound(err: unknown): boolean {
  const name = (err as { name?: string } | undefined)?.name ?? '';
  return name === 'DeviceNotFoundError';
}

export async function disableDeviceIdentity(deviceSerial: string): Promise<void> {
  const registry = getRegistry();
  if (!registry) {
    // No IoT Hub deployed to this stage yet (iotHubDeployed=false, api.bicep)
    // — nothing to revoke. Not an error; see the header comment.
    return;
  }

  try {
    const { responseBody: device } = await registry.get(deviceSerial);
    if (device.status === 'disabled') return; // already disabled — idempotent, not an error
    await registry.update({ ...device, deviceId: deviceSerial, status: 'disabled' });
  } catch (err) {
    if (isDeviceNotFound(err)) {
      // Expected until DPS enrollment ships — this device was never
      // provisioned a real IoT Hub identity. See header comment.
      return;
    }
    // Best-effort: log and move on. The caller's DB-side decommission must
    // proceed regardless — see devices.ts's remove().
    console.error('disableDeviceIdentity: failed to revoke IoT Hub device identity', deviceSerial, err);
  }
}
