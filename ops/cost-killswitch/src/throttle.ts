import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

/**
 * The graduated tier below the 100% database-stop (architecture-review
 * Gap 4/ADR-003). The prior design was binary — 50%/80% email, 100% stop
 * the production database — which is itself an availability failure
 * deliberately introduced by the platform: a telemetry spike could shut
 * off the very database serving live alarms. This gives the budget an
 * intermediate 90% action that costs nothing to run and nothing to be
 * wrong about: it sets a flag, it does not stop anything.
 *
 * Mechanism: writes a Key Vault secret (`cost-throttle-active` = 'true'),
 * since no App Configuration resource exists in this infrastructure and
 * Key Vault is already provisioned and already the pattern this codebase
 * uses for shared runtime state (backend/shared/db.ts's SecretClient
 * usage for DB credentials). Any budget-conscious background workload
 * (backend/shared/cost-throttle.ts's isCostThrottleActive()) can check
 * this flag and skip its own non-critical work — Policy Engine
 * notification fan-out and agent Timer functions are the two named
 * candidates once either exists as deployed code; neither is wired to
 * check it yet, since neither runs in production today. This mirrors an
 * established pattern in this codebase (disableDeviceIdentity() was built
 * as real, tested code before DPS enrollment existed to make it anything
 * but a no-op) — the control exists ready for its first real consumer,
 * not before one to justify it.
 *
 * Deliberately LATCHES, same as the (separate, agent-specific)
 * AGENT_KILLSWITCH's own documented behavior (CLAUDE.md: "lowering spend
 * does not quietly re-arm the team") — this flag does not clear itself
 * when next month's budget period starts at $0 again. A human clearing
 * it (or a future ops workflow) is a deliberate choice: an unattended
 * mechanism that silently re-enables background cost drivers the moment
 * a number resets is exactly the kind of "worked as designed, still
 * surprised everyone" failure this whole review exists to catch.
 */

const THROTTLE_SECRET_NAME = 'cost-throttle-active';

export async function setThrottleFlag(keyVaultUri: string, active: boolean): Promise<void> {
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(keyVaultUri, credential);
  await client.setSecret(THROTTLE_SECRET_NAME, active ? 'true' : 'false');
}
