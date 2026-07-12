import * as fs from 'fs';
import * as path from 'path';
import { Pool, PoolClient } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { PartnerAuthContext, StaffAuthContext, StaffRole } from './auth';

// AWS's published RDS CA bundle, copied into a certs/ subdirectory alongside
// this file's bundled output by infra/lib/api-stack.ts's `afterBundling` hook
// (mirroring this same certs/ relative path so it resolves identically
// whether this module is running bundled in Lambda or unbundled from source
// — e.g. Vitest, ts-node — a real gap found while writing db.integration.test.ts:
// a flat path only worked post-bundling, so importing db.ts directly for a
// test threw ENOENT). Enables real TLS cert validation instead of trusting
// any certificate on the network path (Security Architecture §4.2).
const RDS_CA_BUNDLE = fs.readFileSync(path.join(__dirname, 'certs', 'rds-global-bundle.pem'), 'utf-8');

interface RdsSecret {
  username: string;
  password: string;
  host: string;
  port?: number;
  dbname?: string;
}

// Module-level singletons — reused across warm Lambda invocations
let pool: Pool | null = null;
let cachedSecret: RdsSecret | null = null;

async function getSecret(): Promise<RdsSecret> {
  if (cachedSecret) return cachedSecret;

  const client = new SecretsManagerClient({});
  const res = await client.send(new GetSecretValueCommand({
    SecretId: process.env.DB_SECRET_ARN!,
  }));

  cachedSecret = JSON.parse(res.SecretString!) as RdsSecret;
  return cachedSecret;
}

export async function getPool(): Promise<Pool> {
  if (pool) return pool;

  // Test Strategy §4 — integration tests need a real Postgres to verify RLS
  // (a mock would just return whatever the mock says, the exact blind spot
  // that let the telemetry table ship without RLS in the first place —
  // Multi-Tenant Architecture §2.2). The normal path below is hardcoded to
  // AWS RDS's TLS setup (ssl.ca: RDS_CA_BUNDLE) and would fail outright
  // against a local/CI ephemeral Postgres container, which doesn't present
  // that certificate — bypasses Secrets Manager and TLS entirely, connecting
  // via a plain connection string instead. Gated on a variable no real
  // Lambda deployment ever sets (DB_SECRET_ARN is what production uses,
  // TEST_DATABASE_URL only exists in a test runner's environment) — there is
  // no code path by which this branch can activate in a real deployment.
  if (process.env.TEST_DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2, ssl: false });
    pool.on('error', (err) => {
      console.error('PG pool error', err);
      pool = null;
    });
    return pool;
  }

  // Home-lab / minimal-cost dev posture — infra/lib/data-stack.ts's dev
  // branch skips Secrets Manager entirely (both the RDS credential's
  // storage AND this function's runtime GetSecretValue call), which is
  // what lets infra/lib/network-stack.ts run dev with zero NAT gateways:
  // this is the only reason apiFn/ingestFn ever needed real internet
  // egress in the first place. Checked before getSecret() below, not
  // after — calling getSecret() first would defeat the entire point by
  // making the Secrets Manager network call anyway. Real TLS validation
  // against the RDS CA bundle still applies here exactly as it does on
  // the Secrets Manager path below — this branch only changes where the
  // credential comes from, not the transport security of the DB
  // connection itself. Mirrors scripts/provision-devices.ts's own
  // pre-existing DB_PASSWORD-or-Secrets-Manager pattern (buildPool()),
  // not a new precedent invented here.
  if (process.env.DB_PASSWORD) {
    pool = new Pool({
      host:     process.env.DB_HOST!,
      port:     5432,
      database: process.env.DB_NAME ?? 'peaklogic',
      user:     process.env.DB_USER ?? 'peaklogic_admin',
      password: process.env.DB_PASSWORD,
      max: 2,
      idleTimeoutMillis:    60_000,
      connectionTimeoutMillis: 5_000,
      ssl: { ca: RDS_CA_BUNDLE, rejectUnauthorized: true },
    });
    pool.on('error', (err) => {
      console.error('PG pool error', err);
      pool = null;
    });
    return pool;
  }

  const secret = await getSecret();

  pool = new Pool({
    host:     process.env.DB_HOST!,
    port:     secret.port ?? 5432,
    database: process.env.DB_NAME ?? 'peaklogic',
    user:     secret.username,
    password: secret.password,
    max: 2,                           // keep connection count low per Lambda container
    idleTimeoutMillis:    60_000,
    connectionTimeoutMillis: 5_000,
    ssl: { ca: RDS_CA_BUNDLE, rejectUnauthorized: true },
  });

  pool.on('error', (err) => {
    console.error('PG pool error', err);
    pool = null; // force re-init on next request
  });

  return pool;
}

// ── Channel Partner Portal (Security Architecture §2.4, added v1.1) ──

export type ChannelPartnerRole = 'partner_admin' | 'technician';

export interface ChannelPartnerSession {
  channelPartnerUserId: string;
  role: ChannelPartnerRole;
}

/**
 * Runs fn inside a transaction with channel-partner RLS set (Database
 * Schema §4.4's channel_partner_isolation policies + channel_partner_read
 * policies on sites/assets/devices/telemetry/alerts). Mirrors withTenant()
 * above, but the identity resolved here comes from a DB lookup, not
 * directly off the JWT (see getPartnerAuth()'s doc comment for why).
 *
 * Also rejects a suspended channel partner (Multi-Tenant Architecture
 * §3.3) — portal-only enforcement, mirroring §3.2's tenant-suspension
 * scoping: this has no effect on the partner's attributed tenants' own
 * service, since withTenant() is a completely separate code path that
 * never checks channel_partners.status.
 *
 * Ordering matters: app.current_channel_partner_id must be set BEFORE the
 * channel_partner_users lookup below, since that table's own RLS policy
 * requires it — querying it first, with nothing set yet, would silently
 * return zero rows (not an error) and this function would incorrectly
 * reject a valid partner user as "not found." Caught while designing this
 * function, not found empirically after shipping a bug.
 */
export async function withChannelPartner<T>(
  auth: PartnerAuthContext,
  fn: (client: PoolClient, session: ChannelPartnerSession) => Promise<T>,
): Promise<T> {
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.current_channel_partner_id = $1', [auth.channelPartnerId]);

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

    await client.query('SET LOCAL app.current_channel_partner_user_id = $1', [cpu.id]);
    await client.query('SET LOCAL app.current_channel_partner_role = $1', [cpu.role]);

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
}

/**
 * Runs fn inside a transaction with tenant RLS set.
 * Every DB operation that touches tenant data MUST go through this.
 *
 * Also rejects suspended tenants (Multi-Tenant Architecture §3.2) — this
 * covers every route that reaches this function, i.e. the human-facing API.
 * It does NOT cover backend/ingest/handler.ts's telemetry writes, which
 * intentionally bypass withTenant() via an unscoped pool connection — a
 * suspended tenant's already-connected devices keep reporting telemetry
 * rather than losing data, and access resumes immediately on unsuspend.
 * Blocking ingestion too would be a separate, deliberate product decision,
 * not implied by this fix.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    // SET LOCAL scopes the variable to this transaction only — safe for connection pooling
    await client.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);

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

// ── Internal Administration Console (Database Schema §4.5 / Security Architecture §2.5, added v1.2) ──

export interface StaffSession {
  staffUserId: string;
  role: StaffRole;
}

/**
 * Resolves auth.sub → peaklogic_staff_users row and sets the two staff
 * session variables both this function and withStaffActingOnTenant() below
 * depend on. Not exported — both public entry points below call it as the
 * shared first half of their sequence, so the cognito_sub → id resolution
 * only exists once.
 *
 * Ordering is load-bearing, not stylistic: app.current_staff_cognito_sub
 * and app.current_staff_role are set from the JWT (auth.sub/auth.role,
 * known before any query runs) BEFORE the peaklogic_staff_users lookup,
 * because that table's own staff_self_or_superadmin RLS policy is keyed on
 * cognito_sub, not id — id is exactly what this lookup exists to discover,
 * so a policy keyed on id would make the lookup circular (see Database
 * Schema §4.5's "Corrected during implementation" note). app.current_staff_
 * user_id is only set afterward, once the row (and therefore the id) is
 * actually known.
 */
async function resolveStaffSession(client: PoolClient, auth: StaffAuthContext): Promise<StaffSession> {
  await client.query('SET LOCAL app.current_staff_cognito_sub = $1', [auth.sub]);
  await client.query('SET LOCAL app.current_staff_role = $1', [auth.role]);

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

  await client.query('SET LOCAL app.current_staff_user_id = $1', [staffUser.id]);
  return { staffUserId: staffUser.id, role: auth.role };
}

/**
 * Runs fn inside a transaction with only staff RLS set (no
 * app.current_tenant_id) — for the console's own-scope endpoints: viewing/
 * creating peaklogic_staff_users, viewing/creating account_assignments,
 * superadmin-only tenant/channel-partner creation (Security Architecture
 * §2.5). Not "acting as" any tenant, so does not touch tenant_isolation or
 * staff_tenant_access at all.
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
 * The "act as" handoff (Database Schema §4.5, IA-5). Verifies an
 * account_assignments row (itself RLS-scoped by account_assignment_
 * visibility — an account_manager session literally cannot see a row
 * proving assignment to a tenant it isn't assigned to) BEFORE setting
 * app.current_tenant_id, then defers entirely to the already-existing,
 * already-hardened tenant_isolation policies every tenant-side route
 * already runs under — deliberately NOT a repeat of the channel-partner
 * portal's pattern of adding new permissive read policies to multiple
 * operational tables, since this needs cross-tenant WRITE, not read-only,
 * and re-verifying write-capable policies across many tables is exactly
 * the class of mistake this project's history (the unclaimed_lookup leak,
 * Multi-Tenant Architecture §2.2) has shown is easy to get wrong.
 *
 * superadmin skips the assignment check entirely (Domain Model §2.8:
 * unconditional access, not expressed as a very large set of assignment
 * rows) but still runs through the identical BEGIN/SET LOCAL/COMMIT shape
 * as account_manager — kept as one code path, not two that could drift.
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

    await client.query('SET LOCAL app.current_tenant_id = $1', [targetTenantId]);

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
