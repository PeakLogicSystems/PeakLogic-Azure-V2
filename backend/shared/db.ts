import * as fs from 'fs';
import * as path from 'path';
import { Pool, PoolClient } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// AWS's published RDS CA bundle, copied alongside this file's bundled output by
// infra/lib/api-stack.ts's `afterBundling` hook. Enables real TLS cert validation
// instead of trusting any certificate on the network path (Security Architecture §4.2).
const RDS_CA_BUNDLE = fs.readFileSync(path.join(__dirname, 'rds-global-bundle.pem'), 'utf-8');

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

/**
 * Runs fn inside a transaction with tenant RLS set.
 * Every DB operation that touches tenant data MUST go through this.
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
