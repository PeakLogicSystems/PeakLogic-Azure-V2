// Water-Sector Security Hardening Strategy §5 Tier 0.5 — closes apim.bicep's
// own disclosed limitation: Consumption-tier APIM has no static outbound IP,
// so the Function App's raw hostname can't be locked to "APIM-only" traffic
// via IP restriction. apim.bicep's header comment names the documented fix
// (Microsoft Learn): APIM injects a shared-secret header, the backend
// validates it — implemented here, wired into api/handler.ts so it applies
// uniformly to every route without touching each one individually.
//
// ENFORCE-ONLY-IF-CONFIGURED, deliberately, unlike ops/cost-killswitch's
// isValidSecret() (which fails closed with no expected secret set at all).
// The two guard genuinely different things: cost-killswitch's secret is the
// SOLE auth for a function with no other gate; this header is a
// defense-in-depth ADDITION on top of the real, already-mandatory Entra JWT
// validation every route already goes through (shared/auth.ts). Requiring
// it unconditionally would break every request in every stage the moment
// this ships, ahead of apim.bicep's header-injection policy actually being
// added and this app setting actually being configured there — the same
// "off by default, enforced only once explicitly wired" posture already
// established repeatedly in this codebase (AI_ANALYTICS_ENABLED,
// POLICY_ENGINE_ENABLED). Constant-time comparison once a secret IS
// configured, for the same reason cost-killswitch's own comment gives: a
// cheap thing to close properly even though the primary boundary (JWT) is
// unaffected either way.

export function isDirectBackendCallAllowed(
  providedSecret: string | null | undefined,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) return true; // not configured for this stage yet — don't enforce, see header comment
  if (!providedSecret) return false;
  if (providedSecret.length !== expectedSecret.length) return false;

  let diff = 0;
  for (let i = 0; i < expectedSecret.length; i++) {
    diff |= providedSecret.charCodeAt(i) ^ expectedSecret.charCodeAt(i);
  }
  return diff === 0;
}
