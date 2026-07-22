/**
 * Pure — no I/O. Validates the shared secret the Action Group's webhook
 * call must present, chosen over Azure's built-in Function-key mechanism
 * specifically because it's fully testable here rather than depending on
 * getting an unverified Bicep listKeys() expression exactly right against
 * a live subscription (see budget.bicep's header comment for the full
 * reasoning). Constant-time comparison — this guards a function with real,
 * dangerous power (it stops the production database), so even a timing
 * side-channel on the secret check is worth closing cheaply.
 */
export function isValidSecret(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!expected) return false; // misconfigured (no KILLSWITCH_SECRET app setting) — fail closed, never "any secret works"
  if (!provided) return false;
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
