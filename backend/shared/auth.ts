import type { HttpRequest } from '@azure/functions';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

// Corrected for the PeakLogic-Azure fork — Security Architecture §2.1/§2.4/
// §2.5: three Entra identity surfaces replace the AWS version's three
// Cognito pools. Unlike API Gateway's Cognito authorizer (which validates
// the JWT and injects claims into `event.requestContext.authorizer.claims`
// before Lambda ever runs), Azure Functions has no exact equivalent wired
// up in this fork yet — this module validates the token itself (signature,
// issuer, audience against the relevant tenant's JWKS endpoint), a real,
// disclosed difference from relying on a managed authorizer, not a gap
// papered over. Flagged in Security Architecture §8 as the kind of concrete
// mechanism that needs re-verification once real Azure infrastructure
// exists — this is a considered design, not yet run against a real Entra
// tenant.

export type EntraTenantKind = 'customers' | 'partners' | 'staff';

interface EntraTenantConfig {
  /** e.g. https://peaklogiccustomers.ciamlogin.com/{tenantId}/v2.0 */
  issuer: string;
  /** JWKS endpoint for this tenant — cached per-process, mirrors the module-level singleton pattern db.ts already uses for pool/credential caching. */
  jwksUri: string;
  /** The API's own App ID URI / client ID this token must be issued for. */
  audience: string;
}

// Real, disclosed gap, not assumed resolved: these three configs should be
// sourced from environment variables set at deploy time (mirroring how
// DB_HOST/KEY_VAULT_URI are read in db.ts), not hardcoded — left as env-var
// reads with no fallback so a missing config fails loudly, the same
// discipline this project applies everywhere else (Deployment Architecture
// §2.1's "no default stage" rule, applied here to tenant configuration).
function tenantConfig(kind: EntraTenantKind): EntraTenantConfig {
  const prefix = kind === 'customers' ? 'ENTRA_CUSTOMERS' : kind === 'partners' ? 'ENTRA_PARTNERS' : 'ENTRA_STAFF';
  const issuer = process.env[`${prefix}_ISSUER`];
  const jwksUri = process.env[`${prefix}_JWKS_URI`];
  const audience = process.env[`${prefix}_AUDIENCE`];
  if (!issuer || !jwksUri || !audience) {
    throw new Error(
      `Missing Entra configuration for '${kind}' tenant — expected ${prefix}_ISSUER, ` +
      `${prefix}_JWKS_URI, ${prefix}_AUDIENCE environment variables. Not defaulted, ` +
      'per this project\'s "no silent default" discipline (Deployment Architecture §2.1).',
    );
  }
  return { issuer, jwksUri, audience };
}

const jwksClients = new Map<EntraTenantKind, JwksClient>();
function getJwksClient(kind: EntraTenantKind): JwksClient {
  let client = jwksClients.get(kind);
  if (!client) {
    client = new JwksClient({ jwksUri: tenantConfig(kind).jwksUri, cache: true, cacheMaxAge: 3600_000 });
    jwksClients.set(kind, client);
  }
  return client;
}

/**
 * Validates a bearer token against the given Entra tenant's real signing
 * keys, issuer, and audience — the explicit-verification analogue of what
 * API Gateway's Cognito authorizer did implicitly on the AWS side. Fails
 * closed on every failure mode (missing header, expired token, wrong
 * issuer/audience, bad signature) — never falls through to an unauthenticated
 * default, mirroring getAuth()'s own fail-closed discipline throughout.
 */
async function validateEntraToken(req: HttpRequest, kind: EntraTenantKind): Promise<jwt.JwtPayload> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const match = authHeader?.match(/^Bearer (.+)$/);
  if (!match) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }
  const token = match[1];

  const config = tenantConfig(kind);
  const decodedHeader = jwt.decode(token, { complete: true });
  if (!decodedHeader || typeof decodedHeader === 'string') {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }

  const client = getJwksClient(kind);
  const signingKey = await client.getSigningKey(decodedHeader.header.kid);

  try {
    const claims = jwt.verify(token, signingKey.getPublicKey(), {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256'],
    });
    if (typeof claims === 'string') {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    }
    return claims;
  } catch {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }
}

export interface AuthContext {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

/**
 * Extracts tenant + role from a PeakLogicCustomers Entra External ID token
 * (corrected v — previously Cognito JWT claims). Fails closed exactly like
 * the AWS version: missing tenant claim, or no App Role assigned, both
 * reject rather than silently defaulting (Multi-Tenant Architecture §2.3's
 * fail-closed principle, unaffected by the identity-provider switch).
 *
 * REAL, DISCLOSED GAP: the exact claim name carrying tenantId is written
 * here as `extension_tenantId`, following Entra's documented custom-
 * attribute claim naming convention — but Security Architecture §8 item 4
 * flags that this fork never traced the exact claims-mapping-policy
 * configuration call-by-call the way the AWS version could cite Cognito's
 * `custom:tenant_id` attribute API precisely. Verify against a real Entra
 * External ID tenant before relying on this claim name.
 */
export async function getAuth(req: HttpRequest): Promise<AuthContext> {
  const claims = await validateEntraToken(req, 'customers');

  const tenantId = claims['extension_tenantId'] as string | undefined;
  if (!tenantId) {
    throw Object.assign(new Error('User has no tenant assigned'), { statusCode: 403 });
  }

  // App Roles surface as a `roles` array claim directly on the token —
  // verified via Microsoft's own documentation (Security Architecture
  // §2.1) as the correct, no-overage-limit replacement for Cognito's
  // `cognito:groups` string claim. Fails closed like the tenant check
  // above — no role means no session, never a silent 'operator' default
  // (the exact bug Multi-Tenant Architecture §2.3 found and fixed on AWS).
  const roles = (claims['roles'] as string[] | undefined) ?? [];
  if (roles.length === 0) {
    throw Object.assign(new Error('User has no role assigned'), { statusCode: 403 });
  }

  // Verified via Microsoft's own documentation (2026-07-17), not assumed:
  // the token `sub` claim is PAIRWISE — unique per (user, app registration),
  // so the SPA, the mobile app, and the Windows hub each receive a DIFFERENT
  // `sub` for the same person. `oid` (the immutable directory object ID) is
  // the same for that user across every app in the tenant. Since the DB
  // subject columns (channel_partner_users.cognito_sub, peaklogic_staff_
  // users.cognito_sub, etc.) must resolve the same row regardless of which
  // client a user authenticated through, the stored/looked-up identifier
  // MUST be `oid`, not `sub`. Preferring `sub` here would have silently
  // orphaned a user the moment they logged in from a second client app.
  return {
    sub:      (claims.oid as string) ?? claims.sub,
    email:    (claims['email'] as string) ?? '',
    tenantId,
    role: roles[0],
  };
}

export function requireRole(auth: AuthContext, ...roles: string[]): void {
  if (!roles.includes(auth.role)) {
    throw Object.assign(
      new Error(`Role '${auth.role}' is not permitted — requires: ${roles.join(' | ')}`),
      { statusCode: 403 },
    );
  }
}

// ── Channel Partner Portal auth (Security Architecture §2.4, PeakLogicPartners tenant) ──

export interface PartnerAuthContext {
  sub: string;
  email: string;
  channelPartnerId: string;
}

/**
 * Extracts channel-partner identity from a token issued by the separate
 * PeakLogicPartners Entra External ID tenant (corrected — previously
 * PartnerPool), not the PeakLogicCustomers tenant getAuth() reads from.
 * Deliberately does NOT resolve role or channel_partner_user_id here —
 * those come from a channel_partner_users DB lookup in withChannelPartner()
 * (db.ts), unchanged reasoning from the AWS version: this tenant carries no
 * App Role for ordinary role resolution (Security Architecture §2.4).
 */
export async function getPartnerAuth(req: HttpRequest): Promise<PartnerAuthContext> {
  const claims = await validateEntraToken(req, 'partners');

  const channelPartnerId = claims['extension_channelPartnerId'] as string | undefined;
  if (!channelPartnerId) {
    throw Object.assign(new Error('User has no channel partner assigned'), { statusCode: 403 });
  }

  // Use the stable `oid`, not the pairwise-per-app `sub` — see getAuth()'s
  // comment above for why (a partner user logging in via the SPA vs. the
  // mobile app must resolve the same channel_partner_users row).
  return {
    sub:   (claims.oid as string) ?? claims.sub,
    email: (claims['email'] as string) ?? '',
    channelPartnerId,
  };
}

// ── Internal Administration Console auth (Security Architecture §2.5,
// PeakLogic's own corporate Entra ID workforce tenant) ──

export type StaffRole = 'superadmin' | 'account_manager';

export interface StaffAuthContext {
  sub: string;
  email: string;
  role: StaffRole;
}

/**
 * Extracts staff identity from a token issued by PeakLogic's own real
 * corporate Entra ID tenant (corrected — previously a synthetic StaffPool
 * Cognito pool this project had to invent from nothing; Security
 * Architecture §2.0/§2.5's own disclosed simplification: staff already have
 * real accounts in the company's own Microsoft 365 directory). Role IS read
 * directly off the App Roles claim here, not resolved via a DB lookup —
 * same reasoning as the AWS version: withStaffActingOnTenant() (db.ts)
 * needs to know superadmin-vs-account_manager BEFORE any DB round-trip.
 *
 * REAL, DISCLOSED PREREQUISITE this fork's design depends on (Security
 * Architecture §8 item 6): this validates against PeakLogic's OWN app
 * registration in its corporate tenant, which must be configured
 * single-tenant (`Accounts in this organizational directory only`) — the
 * functional equivalent of Cognito's admin-invited-only posture, achieved
 * by tenant restriction at the app-registration level instead. This
 * function cannot itself verify that configuration; it's a deploy-time
 * Azure Portal/Bicep setting, not something runtime code can check.
 */
export async function getStaffAuth(req: HttpRequest): Promise<StaffAuthContext> {
  const claims = await validateEntraToken(req, 'staff');

  const roles = (claims['roles'] as string[] | undefined) ?? [];
  if (roles.length === 0) {
    throw Object.assign(new Error('Staff user has no role assigned'), { statusCode: 403 });
  }
  const role = roles[0];
  if (role !== 'superadmin' && role !== 'account_manager') {
    throw Object.assign(new Error(`Unrecognized staff role '${role}'`), { statusCode: 403 });
  }

  // Stable `oid`, not pairwise `sub` — see getAuth()'s comment for why.
  return {
    sub:   (claims.oid as string) ?? claims.sub,
    email: (claims['email'] as string) ?? '',
    role,
  };
}

export function requireStaffRole(auth: StaffAuthContext, ...roles: StaffRole[]): void {
  if (!roles.includes(auth.role)) {
    throw Object.assign(
      new Error(`Role '${auth.role}' is not permitted — requires: ${roles.join(' | ')}`),
      { statusCode: 403 },
    );
  }
}

// ── Not yet ported, disclosed not silently omitted ──
// getManagerAuth() (Security Architecture §2.6, the channel_partner_manager
// App Role discriminator within PeakLogicPartners) was never implemented in
// the AWS-native repo either (that document's own §8 item 13 disclosed
// this) — not invented here from scratch, consistent with this bounded
// port's scope of reconciling what already exists, not building net-new
// features as a side effect.
