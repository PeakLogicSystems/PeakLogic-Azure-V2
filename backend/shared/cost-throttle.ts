import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

// Architecture-review Gap 4/ADR-003 — the graduated tier below the cost
// kill switch's 100% database stop. ops/cost-killswitch's new /api/cost-
// throttle endpoint sets this Key Vault secret to 'true' when the budget
// reaches 90%; any budget-conscious background workload calls
// isCostThrottleActive() before doing non-critical work and skips it if
// true. Policy Engine notification fan-out and agent Timer functions are
// the two named candidates once either exists as deployed code — neither
// calls this yet, since neither runs in production today. Built ahead of
// its first real consumer on purpose, the same precedent
// disableDeviceIdentity() set before DPS enrollment existed to revoke.
//
// FAILS OPEN (returns false — "not throttled") on any error: an unset Key
// Vault, a transient read failure, or a misconfigured environment must
// never be interpreted as "throttle everything." A throttle check that can
// itself take down non-critical work by failing to read its own flag would
// be worse than not having the check at all. This mirrors
// disableDeviceIdentity()'s own "best-effort and never throws" posture and
// the Policy Engine's fail-safe-to-compiled-seed pattern — the established
// convention in this codebase for a safety-adjacent check that must not
// become a new single point of failure.
//
// Not unit-tested against a mocked SecretClient — same boundary
// db.ts/stop-server.ts already leave untested (the pure logic is tested;
// the Azure SDK I/O call itself is not, consistent with this project's own
// stated testing philosophy of prioritizing what a mock would hide a real
// bug behind — see docs/architecture/test-strategy.md §2).

const THROTTLE_SECRET_NAME = 'cost-throttle-active';

export async function isCostThrottleActive(): Promise<boolean> {
  const keyVaultUri = process.env.KEY_VAULT_URI;
  if (!keyVaultUri) return false;

  try {
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(keyVaultUri, credential);
    const secret = await client.getSecret(THROTTLE_SECRET_NAME);
    return secret.value === 'true';
  } catch {
    return false;
  }
}
