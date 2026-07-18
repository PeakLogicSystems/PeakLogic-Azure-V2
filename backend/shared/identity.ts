import { DefaultAzureCredential, ClientSecretCredential, type TokenCredential } from '@azure/identity';
import * as crypto from 'crypto';

// Microsoft Graph-based user provisioning — the Azure port's replacement for
// the AWS Cognito `AdminCreateUserCommand` / `AdminAddUserToGroupCommand`
// calls that lived inline in settings-team.ts / partner-users.ts /
// admin-staff.ts / admin-tenant-actions.ts. Concentrated here so the route
// handlers call one clean interface, and all the Entra-specific mapping
// lives in one place.
//
// ⚠️ VERIFY AGAINST A REAL ENTRA TENANT BEFORE RELYING ON THIS. Written
// against Microsoft's documented Graph patterns (Security Architecture §2.1/
// §8 item 4), but — exactly like the AWS-side code, which was never run
// against real Cognito either (the whole backend was typecheck/synth-verified,
// never deployed) — these Graph calls typecheck but are unverified at
// runtime. Specifically unconfirmed: (a) External ID (CIAM) create-vs-invite
// semantics, (b) the exact `extension_<appId>_<name>` custom-attribute
// property names for the tenantId / channelPartnerId claims, (c) that
// creating a user returns the same `id` (directory object id) that shows up
// as the `oid` claim the DB subject columns key on (Security Architecture
// §2.5). All three are real deploy-time verification items.

export type EntraTenantKind = 'customers' | 'partners' | 'staff';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

// Credential per tenant kind. Staff = PeakLogic's OWN workforce tenant, so a
// managed identity (DefaultAzureCredential) works directly. Customers/
// Partners are SEPARATE External ID tenants — Graph is per-tenant, so
// managing users in them needs an app registration WITH a client secret IN
// each of those tenants (env-supplied), not the home managed identity. This
// cross-tenant management-credential need is a real Azure structural fact
// with no AWS Cognito equivalent (one account managed all pools there).
function credentialFor(kind: EntraTenantKind): TokenCredential {
  if (kind === 'staff') {
    return new DefaultAzureCredential();
  }
  const prefix = kind === 'customers' ? 'ENTRA_CUSTOMERS' : 'ENTRA_PARTNERS';
  const tenantId = process.env[`${prefix}_TENANT_ID`];
  const clientId = process.env[`${prefix}_MGMT_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_MGMT_CLIENT_SECRET`];
  if (!tenantId || !clientId || !clientSecret) {
    throw Object.assign(
      new Error(
        `Missing Graph management credentials for the '${kind}' External ID tenant — ` +
        `expected ${prefix}_TENANT_ID, ${prefix}_MGMT_CLIENT_ID, ${prefix}_MGMT_CLIENT_SECRET. ` +
        'No default (this project\'s "fail loud, never silently default a credential" rule).',
      ),
      { statusCode: 500 },
    );
  }
  return new ClientSecretCredential(tenantId, clientId, clientSecret);
}

async function graph<T>(kind: EntraTenantKind, method: string, path: string, body?: unknown): Promise<T> {
  const token = await credentialFor(kind).getToken(GRAPH_SCOPE);
  if (!token) {
    throw Object.assign(new Error('Could not acquire a Microsoft Graph token'), { statusCode: 500 });
  }
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(
      new Error(`Graph ${method} ${path} failed: ${res.status} ${text}`),
      { statusCode: 502 },
    );
  }
  return (res.status === 204 ? (undefined as T) : ((await res.json()) as T));
}

// Meets a strong password policy without needing to know the tenant's exact
// rules — the user is forced to reset on first sign-in anyway (Entra's
// self-service flow), so this value never persists.
function generateTempPassword(): string {
  return `Aa1!${crypto.randomBytes(24).toString('base64url')}`;
}

// Resolves a role name → the App Role id to assign (customers/staff only —
// partner roles come from the DB, not a token claim, Security Architecture
// §2.4). Config-driven, per this project's no-hardcoded-ids discipline.
function appRoleIdFor(kind: EntraTenantKind, roleName: string): string {
  const prefix = kind === 'customers' ? 'ENTRA_CUSTOMERS' : 'ENTRA_STAFF';
  const envKey = `${prefix}_APPROLE_${roleName.toUpperCase()}`;
  const id = process.env[envKey];
  if (!id) {
    throw Object.assign(
      new Error(`Missing App Role id ${envKey} for role '${roleName}' in the '${kind}' tenant.`),
      { statusCode: 500 },
    );
  }
  return id;
}

function apiServicePrincipalObjectId(kind: EntraTenantKind): string {
  const prefix = kind === 'customers' ? 'ENTRA_CUSTOMERS' : 'ENTRA_STAFF';
  const id = process.env[`${prefix}_API_SP_OBJECT_ID`];
  if (!id) {
    throw Object.assign(
      new Error(`Missing ${prefix}_API_SP_OBJECT_ID (the API app's service-principal object id) for the '${kind}' tenant.`),
      { statusCode: 500 },
    );
  }
  return id;
}

// Maps a domain custom attribute (tenantId / channelPartnerId) to its Graph
// extension-property name. The extension property name is
// `extension_<appIdNoHyphens>_<attributeName>` — config-supplied because the
// appId is the External ID tenant's b2c/CIAM extensions-app id, not something
// this code can derive.
function customAttributeProps(kind: EntraTenantKind, input: { tenantId?: string; channelPartnerId?: string }): Record<string, string> {
  const props: Record<string, string> = {};
  if (input.tenantId) {
    const name = process.env.ENTRA_CUSTOMERS_TENANTID_EXT_PROP;
    if (!name) throw Object.assign(new Error('Missing ENTRA_CUSTOMERS_TENANTID_EXT_PROP (the extension_… property name carrying tenantId).'), { statusCode: 500 });
    props[name] = input.tenantId;
  }
  if (input.channelPartnerId) {
    const name = process.env.ENTRA_PARTNERS_CHANNELPARTNERID_EXT_PROP;
    if (!name) throw Object.assign(new Error('Missing ENTRA_PARTNERS_CHANNELPARTNERID_EXT_PROP (the extension_… property name carrying channelPartnerId).'), { statusCode: 500 });
    props[name] = input.channelPartnerId;
  }
  return props;
}

export interface CreatedEntraUser {
  /** Directory object id — the stable `oid` the DB subject columns store. */
  oid: string;
}

/**
 * Creates a user in the given Entra tenant and (for customers/staff)
 * assigns the matching App Role. Returns the directory object id, which is
 * the `oid` claim value the DB `cognito_sub` columns key on.
 *
 * Direct 1:1 replacement for the AWS AdminCreateUser + AdminAddUserToGroup
 * call sites. Admin-invited only (no self-service) — the temp password is
 * force-reset on first sign-in via Entra's own flow; PeakLogic's own invite
 * email (not built yet) would carry the sign-in link, matching the AWS
 * code's `MessageAction: 'SUPPRESS'` posture.
 */
export async function createEntraUser(
  kind: EntraTenantKind,
  input: { email: string; displayName?: string; tenantId?: string; channelPartnerId?: string; appRole?: string },
): Promise<CreatedEntraUser> {
  const email = input.email.trim();

  const user = await graph<{ id: string }>(kind, 'POST', '/users', {
    accountEnabled: true,
    displayName: input.displayName ?? email,
    mailNickname: email.split('@')[0],
    userPrincipalName: email,
    identities: [
      { signInType: 'emailAddress', issuer: process.env[`ENTRA_${kind.toUpperCase()}_ISSUER_DOMAIN`] ?? undefined, issuerAssignedId: email },
    ],
    passwordProfile: { forceChangePasswordNextSignIn: true, password: generateTempPassword() },
    ...customAttributeProps(kind, input),
  });

  if (input.appRole && kind !== 'partners') {
    await graph(kind, 'POST', `/users/${user.id}/appRoleAssignments`, {
      principalId: user.id,
      resourceId: apiServicePrincipalObjectId(kind),
      appRoleId: appRoleIdFor(kind, input.appRole),
    });
  }

  return { oid: user.id };
}

/**
 * Entra manages password change and MFA enrollment through its OWN
 * self-service flows (SSPR / the My-Sign-Ins security-info page), NOT via a
 * backend API call the way Cognito's ChangePassword/GetUser did with the
 * caller's access token. So the `/v1/settings/password` and `/v1/settings/mfa`
 * endpoints can't proxy these — they return the self-service URL for the
 * client to deep-link the user to. This is the honest Entra architecture, a
 * real, disclosed behavior change from the AWS endpoints (Security
 * Architecture §2.2/§6), not a stub.
 */
export function entraSelfServiceUrl(concern: 'password' | 'mfa'): string {
  const url = concern === 'password'
    ? process.env.ENTRA_SELF_SERVICE_PASSWORD_URL
    : process.env.ENTRA_SELF_SERVICE_SECURITY_INFO_URL;
  // Microsoft's standard hosted endpoints if unset — documented defaults,
  // not secrets.
  return url ?? (concern === 'password'
    ? 'https://passwordreset.microsoftonline.com/'
    : 'https://mysignins.microsoft.com/security-info');
}
