import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

// A CMMS connector's credential_ref (docs/data-model.sql's cmms_connectors
// table) is a Key Vault secret NAME, never the secret itself — the same
// secretless-in-the-DB invariant db.ts's getCredentialFromKeyVault()
// establishes for the Postgres admin credential. This is the CMMS-side
// equivalent, but generic over the secret NAME (db.ts's resolver is
// hardcoded to the one fixed 'postgres-admin-credential' name; every CMMS
// connector has its own, so this caches per-name, not as a single value).
//
// Each vendor adapter decides its own secret's internal JSON shape (e.g.
// ServiceTitan's is { clientId, clientSecret, appKey, webhookSigningSecret,
// servicetitanTenantId } — see adapters/servicetitan.ts) and parses it
// itself; this module only fetches and caches the raw string.

const cache = new Map<string, string>();

export async function resolveConnectorSecret(credentialRef: string): Promise<string> {
  const cached = cache.get(credentialRef);
  if (cached) return cached;

  // DefaultAzureCredential resolves to this Function App's own managed
  // identity in a real deployment — no client secret ever stored anywhere,
  // same pattern as every other Key Vault access in this codebase.
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(process.env.KEY_VAULT_URI!, credential);
  const secret = await client.getSecret(credentialRef);
  if (!secret.value) {
    throw new Error(`Key Vault secret "${credentialRef}" has no value`);
  }

  cache.set(credentialRef, secret.value);
  return secret.value;
}

/** Test-only — mirrors db.ts's __resetPoolForTests() naming convention. */
export function __resetCredentialCacheForTests(): void {
  cache.clear();
}
