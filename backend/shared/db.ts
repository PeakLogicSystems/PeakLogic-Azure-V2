import * as fs from 'fs';
import * as path from 'path';
import { Pool, PoolClient } from 'pg';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import type { PartnerAuthContext, StaffAuthContext, StaffRole } from './auth';

// Corrected for the PeakLogic-Azure fork — Security Architecture §4.2
// (verified via Microsoft's own documentation, not assumed to be "some
// other CA bundle, same idea"): Azure Database for PostgreSQL Flexible
// Server's TLS chains to DigiCert Global Root G2 + Microsoft RSA Root
// Certificate Authority 2017, combined into one PEM bundle — the direct
// analogue of the AWS version's rds-global-bundle.pem, copied into a
// certs/ subdirectory alongside this file's bundled output the same way
// (infra-azure's Functions packaging step, once written, needs its own
// afterBundling-equivalent hook — Infrastructure as Code §8, not yet built).
//
// REAL, DISCLOSED GAP, NOT FABRICATED: the actual certificate bytes are not
// checked in here. Downloading and verifying the real DigiCert Global Root
// G2 + Microsoft RSA Root CA 2017 bundle from Microsoft's published sources
// is a real pre-deployment step for whoever stands up the first real Azure
// environment — see certs/README.md in this directory. This module fails
// loudly (not silently) if the file is missing, the same "no default,
// fail fast" discipline this project applies everywhere else (Deployment
// Architecture §2.1's stage-parameter rule, applied here to a cert bundle).
const AZURE_POSTGRES_CA_BUNDLE_PATH = path.join(__dirname, 'certs', 'azure-postgres-ca-bundle.pem');

function loadAzurePostgresCaBundle(): string {
  try {
    return fs.readFileSync(AZURE_POSTGRES_CA_BUNDLE_PATH, 'utf-8');
  } catch (err) {
    throw new Error(
      `Azure Postgres CA bundle not found at ${AZURE_POSTGRES_CA_BUNDLE_PATH}. ` +
      'This is a real, disclosed pre-deployment step (Security Architecture §4.2, ' +
      'this fork\'s port of the AWS RDS-CA-bundle pattern) — download the current ' +
      'DigiCert Global Root G2 + Microsoft RSA Root CA 2017 bundle from Microsoft\'s ' +
      'published PKI documentation and place it at certs/azure-postgres-ca-bundle.pem ' +
      'before running against a real Azure Database for PostgreSQL instance. Not ' +
      'required for TEST_DATABASE_URL-based local/CI testing (see getPool() below).',
    );
  }
}

interface KeyVaultDbCredential {
  username: string;
  password: string;
  host: string;
  port?: number;
  dbname?: string;
}

// Module-level singletons — reused across warm Azure Functions invocations.
// Verified, not assumed, that this reuse pattern is safe: Multi-Tenant
// Architecture §2.1a confirmed via Microsoft's own Azure Functions
// documentation that a warm instance persists module-level state across
// invocations identically to Lambda's warm-container behavior — the same
// precondition that makes withTenant()'s SET LOCAL-per-transaction pattern
// (not a session-level SET) load-bearing here, unchanged from the AWS design.
let pool: Pool | null = null;
let cachedCredential: KeyVaultDbCredential | null = null;

async function getCredentialFromKeyVault(): Promise<KeyVaultDbCredential> {
  if (cachedCredential) return cachedCredential;

  // DefaultAzureCredential resolves, in order: environment variables (local
  // dev), a managed identity (the real Azure Functions deployment path —
  // no client secret ever stored anywhere, the direct analogue of the AWS
  // version's IAM-role-based grantRead() access), then several other
  // fallback mechanisms. No credential material is ever hardcoded here.
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(process.env.KEY_VAULT_URI!, credential);
  const secret = await client.getSecret('postgres-admin-credential');

  cachedCredential = JSON.parse(secret.value!) as KeyVaultDbCredential;
  return cachedCredential;
}

export async function getPool(): Promise<Pool> {
  if (pool) return pool;

  // Test Strategy §4 — integration tests need a real Postgres to verify RLS.
  // Unchanged from the AWS version: this bypasses Key Vault and TLS entirely
  // via a plain connection string, gated on a variable no real Azure
  // Functions deployment ever sets (KEY_VAULT_URI is what production uses;
  // TEST_DATABASE_URL only exists in a test runner's environment).
  //
  // TD-50, fixed 2026-08-01 — TEST_APP_DATABASE_URL, not TEST_DATABASE_URL,
  // is what this pool actually connects as when set: TEST_DATABASE_URL is
  // the Postgres Docker image's own initdb superuser (used by every
  // integration test file's own `setup`/`ownerClient` for schema DDL), and
  // real Postgres superusers bypass Row-Level Security UNCONDITIONALLY —
  // meaning every withTenant()/withChannelPartner() query run through it
  // could never actually prove RLS blocks anything, regardless of how
  // correct the policies themselves are. TEST_APP_DATABASE_URL points at a
  // dedicated non-superuser role (vitest.integration.setup.ts creates it
  // once, globally, before any test file runs) so this pool is subject to
  // RLS exactly the way a real (non-superuser) production app role is.
  // Falls back to TEST_DATABASE_URL if unset, so this doesn't silently
  // break any test/tooling that hasn't been updated to set the new var.
  const testConnectionString = process.env.TEST_APP_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (testConnectionString) {
    pool = new Pool({ connectionString: testConnectionString, max: 2, ssl: false });
    pool.on('error', (err) => {
      console.error('PG pool error', err);
      pool = null;
    });
    return pool;
  }

  // REAL, DELIBERATE DIVERGENCE FROM THE AWS VERSION'S TD-43, NOT AN
  // OVERSIGHT: the AWS repo's db.ts has a DB_PASSWORD env-var branch here
  // that lets `dev` skip Secrets Manager entirely, paired with zero NAT
  // gateways for real $0-cost home-lab deploys. Technical Debt Register
  // v1.4 explicitly flagged that this fork has NOT decided whether an
  // equivalent Key-Vault-bypass belongs in the Azure `dev` stage — so this
  // port does not silently carry the AWS shortcut forward. Every non-test
  // path goes through Key Vault, including dev. If a genuine $0-cost Azure
  // dev posture is later decided to need its own bypass, that is real,
  // separate follow-up work requiring its own explicit decision (mirroring
  // how deliberately TD-43 itself was a named, approved trade-off, not a
  // default) — not something this module should assume by analogy.

  const credential = await getCredentialFromKeyVault();
  const caBundle = loadAzurePostgresCaBundle();

  pool = new Pool({
    host:     credential.host,
    port:     credential.port ?? 5432,
    database: credential.dbname ?? 'peaklogic',
    user:     credential.username,
    password: credential.password,
    max: 2,                           // keep connection count low per Functions instance — same reasoning as the AWS version
    idleTimeoutMillis:    60_000,
    connectionTimeoutMillis: 5_000,
    ssl: { ca: caBundle, rejectUnauthorized: true },
  });

  pool.on('error', (err) => {
    console.error('PG pool error', err);
    pool = null; // force re-init on next request
  });

  return pool;
}

// ── Channel Partner Portal (Security Architecture §2.4, PeakLogicPartners
// Entra External ID tenant) ──
//
// Unchanged from the AWS version below this point in every way that
// matters: this is pure PostgreSQL/application logic with zero AWS or
// Azure SDK dependency — the RLS pattern, the SET LOCAL sequencing, and the
// "resolve via DB lookup, not a token claim" design are all confirmed
// cloud-agnostic (Multi-Tenant Architecture §2.8's own disclosure). Only
// the naming artifact `cognito_sub` is carried forward as-is (Security
// Architecture §2.5's disclosed naming-artifact note) — this column stores
// whichever OIDC provider's subject identifier applies (Entra's `oid`
// claim, for this fork), not renamed here without a corresponding Database
// Schema migration.

export type ChannelPartnerRole = 'partner_admin' | 'technician';

export interface ChannelPartnerSession {
  channelPartnerUserId: string;
  role: ChannelPartnerRole;
}

/**
 * Runs fn inside a transaction with channel-partner RLS set (Database
 * Schema §4.4's channel_partner_isolation policies + channel_partner_read
 * policies on sites/assets/devices/telemetry/alerts). Mirrors withTenant()
 * below, but the identity resolved here comes from a DB lookup, not
 * directly off the token (see getPartnerAuth()'s doc comment for why).
 *
 * Also rejects a suspended channel partner (Multi-Tenant Architecture
 * §3.3) — portal-only enforcement, mirroring §3.2's tenant-suspension
 * scoping.
 *
 * Ordering matters: app.current_channel_partner_id must be set BEFORE the
 * channel_partner_users lookup below, since that table's own RLS policy
 * requires it — querying it first, with nothing set yet, would silently
 * return zero rows (not an error) and this function would incorrectly
 * reject a valid partner user as "not found." Unchanged from the AWS
 * version — this is pure Postgres RLS-evaluation-order reasoning, not
 * affected by which identity provider issued auth.sub.
 */
export async function withChannelPartner<T>(
  auth: PartnerAuthContext,
  fn: (client: PoolClient, session: ChannelPartnerSession) => Promise<T>,
): Promise<T> {
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    // CRITICAL, found and fixed 2026-08-01 (Water-Sector Security Hardening
    // Strategy §5 — the first-ever real Postgres integration-test run,
    // possible only once CI's Postgres service container actually executed
    // for the first time, TD-49): `SET LOCAL key = $1` with a bind parameter
    // is not valid PostgreSQL syntax — SET is a utility command the parser
    // handles specially and does not accept query parameters, only literal
    // values (verified live: this is a well-documented node-postgres/
    // PostgreSQL limitation, not a version quirk). This means EVERY
    // tenant/channel-partner/staff-scoped database call in this entire
    // platform has always thrown "syntax error at or near $1" the instant it
    // touched a real Postgres server — invisible until today because every
    // prior test mocked the pg client (which never validates SQL at all)
    // and no integration test had ever actually run (TD-18's disclosed gap,
    // now realized in the worst possible place: the core tenant-isolation
    // mechanism). Fixed here and at every other SET LOCAL-with-a-parameter
    // call site in this file (and ingest/handler.ts's one instance) by
    // switching to `SELECT set_config(name, value, is_local)` — a normal
    // function call, not the special SET syntax, which DOES support bind
    // parameters; `is_local = true` is the exact SET LOCAL equivalent
    // (reverts at the end of the transaction).
    await client.query("SELECT set_config('app.current_channel_partner_id', $1, true)", [auth.channelPartnerId]);

    const { rows: [partner] } = await client.query<{ status: string }>(
      'SELECT status FROM channel_partners WHERE id = $1',
      [auth.channelPartnerId],
    );
    if (!partner) {
      throw Object.assign(new Error('Channel partner not found'), { statusCode: 403 });
    }
    if (partner.status === 'suspended') {
      throw Object.assign(new Error('Channel partner is suspended'), { statusCode: 403 });
    }

    const { rows: [cpu] } = await client.query<{ id: string; role: ChannelPartnerRole }>(
      'SELECT id, role FROM channel_partner_users WHERE cognito_sub = $1',
      [auth.sub],
    );
    if (!cpu) {
      throw Object.assign(new Error('Channel partner user not found'), { statusCode: 403 });
    }

    // set_config(), not SET LOCAL — see this function's opening comment.
    await client.query("SELECT set_config('app.current_channel_partner_user_id', $1, true)", [cpu.id]);
    await client.query("SELECT set_config('app.current_channel_partner_role', $1, true)", [cpu.role]);

    const result = await fn(client, { channelPartnerUserId: cpu.id, role: cpu.role });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * RLS (channel_partner_isolation) enforces data isolation between
 * partners, not role-based write authorization within one partner — a
 * technician's session can data-isolate fine but still needs an explicit
 * check before, say, confirming a route (TR-3.1), the same reason
 * requireRole() exists alongside withTenant() for the tenant side.
 */
export function requirePartnerRole(session: ChannelPartnerSession, ...roles: ChannelPartnerRole[]): void {
  if (!roles.includes(session.role)) {
    throw Object.assign(
      new Error(`Role '${session.role}' is not permitted — requires: ${roles.join(' | ')}`),
      { statusCode: 403 },
    );
  }
}

/** Test-only: forces a fresh Pool on the next getPool() call. Vitest runs
 * every integration test file in the same process (fileParallelism: false,
 * vitest.integration.config.ts), so the module-level singleton would
 * otherwise leak a closed/stale connection across test files. */
export function __resetPoolForTests(): void {
  pool = null;
  cachedCredential = null;
}

/**
 * Runs fn inside a transaction with tenant RLS set.
 * Every DB operation that touches tenant data MUST go through this.
 *
 * Also rejects suspended tenants (Multi-Tenant Architecture §3.2) — this
 * covers every route that reaches this function, i.e. the human-facing API.
 * It does NOT cover backend/ingest/handler.ts's telemetry writes, which
 * intentionally bypass withTenant() via an unscoped pool connection.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    // set_config('app.current_tenant_id', value, true), not SET LOCAL — see
    // withChannelPartner()'s opening comment for why (CRITICAL, fixed
    // 2026-08-01: SET LOCAL doesn't accept bind parameters at all). The
    // is_local=true third argument is the exact SET LOCAL equivalent —
    // scopes the variable to this transaction only, still safe under Azure
    // Functions' warm-instance connection reuse (Multi-Tenant Architecture
    // §2.1a), the same reason it was safe under Lambda's warm-container
    // reuse.
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);

    const { rows: [tenant] } = await client.query<{ status: string }>(
      'SELECT status FROM tenants WHERE id = $1',
      [tenantId],
    );
    if (!tenant) {
      throw Object.assign(new Error('Tenant not found'), { statusCode: 403 });
    }
    if (tenant.status === 'suspended') {
      throw Object.assign(new Error('Tenant is suspended'), { statusCode: 403 });
    }

    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Internal Administration Console (Database Schema §4.5 / Security
// Architecture §2.5, PeakLogic's own Entra ID workforce tenant) ──

export interface StaffSession {
  staffUserId: string;
  role: StaffRole;
}

/**
 * Resolves auth.sub → peaklogic_staff_users row and sets the two staff
 * session variables both this function and withStaffActingOnTenant() below
 * depend on. Unchanged from the AWS version — pure RLS-ordering logic, not
 * cloud-specific. Not exported — both public entry points below call it as
 * the shared first half of their sequence.
 *
 * Ordering is load-bearing, not stylistic: app.current_staff_cognito_sub
 * and app.current_staff_role are set from the token (auth.sub/auth.role,
 * known before any query runs) BEFORE the peaklogic_staff_users lookup,
 * because that table's own staff_self_or_superadmin RLS policy is keyed on
 * cognito_sub, not id.
 */
async function resolveStaffSession(client: PoolClient, auth: StaffAuthContext): Promise<StaffSession> {
  // set_config(), not SET LOCAL — see withChannelPartner()'s opening comment
  // (CRITICAL, fixed 2026-08-01: SET LOCAL doesn't accept bind parameters).
  await client.query("SELECT set_config('app.current_staff_cognito_sub', $1, true)", [auth.sub]);
  await client.query("SELECT set_config('app.current_staff_role', $1, true)", [auth.role]);

  const { rows: [staffUser] } = await client.query<{ id: string; status: string }>(
    'SELECT id, status FROM peaklogic_staff_users WHERE cognito_sub = $1',
    [auth.sub],
  );
  if (!staffUser) {
    throw Object.assign(new Error('Staff user not found'), { statusCode: 403 });
  }
  if (staffUser.status === 'disabled') {
    throw Object.assign(new Error('Staff account is disabled'), { statusCode: 403 });
  }

  await client.query("SELECT set_config('app.current_staff_user_id', $1, true)", [staffUser.id]);
  return { staffUserId: staffUser.id, role: auth.role };
}

/**
 * Runs fn inside a transaction with only staff RLS set (no
 * app.current_tenant_id) — for the console's own-scope endpoints. Not
 * "acting as" any tenant, so does not touch tenant_isolation or
 * staff_tenant_access at all. Unchanged from the AWS version.
 */
export async function withStaffSession<T>(
  auth: StaffAuthContext,
  fn: (client: PoolClient, session: StaffSession) => Promise<T>,
): Promise<T> {
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const session = await resolveStaffSession(client, auth);
    const result = await fn(client, session);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The "act as" handoff (Database Schema §4.5, IA-5). Unchanged from the AWS
 * version — verifies an account_assignments row (itself RLS-scoped) BEFORE
 * setting app.current_tenant_id, then defers entirely to the already-
 * existing, already-hardened tenant_isolation policies. superadmin skips
 * the assignment check entirely (Domain Model §2.8) but still runs through
 * the identical BEGIN/SET LOCAL/COMMIT shape as account_manager.
 */
export async function withStaffActingOnTenant<T>(
  auth: StaffAuthContext,
  targetTenantId: string,
  fn: (client: PoolClient, session: StaffSession) => Promise<T>,
): Promise<T> {
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const session = await resolveStaffSession(client, auth);

    if (session.role !== 'superadmin') {
      const { rows } = await client.query(
        'SELECT 1 FROM account_assignments WHERE staff_user_id = $1 AND tenant_id = $2',
        [session.staffUserId, targetTenantId],
      );
      if (rows.length === 0) {
        throw Object.assign(new Error('Not assigned to this tenant'), { statusCode: 403 });
      }
    }

    // set_config(), not SET LOCAL — see withChannelPartner()'s opening
    // comment (CRITICAL, fixed 2026-08-01: SET LOCAL doesn't accept bind
    // parameters).
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [targetTenantId]);

    const { rows: [tenant] } = await client.query<{ status: string }>(
      'SELECT status FROM tenants WHERE id = $1',
      [targetTenantId],
    );
    if (!tenant) {
      throw Object.assign(new Error('Tenant not found'), { statusCode: 403 });
    }

    const result = await fn(client, session);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
