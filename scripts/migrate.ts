#!/usr/bin/env ts-node
/**
 * PeakLogic Database Migration Runner
 *
 * Applies versioned schema migrations from ./migrations using
 * node-pg-migrate (Database Schema §4.2). Deliberately not wired into
 * `cdk deploy` — an infrastructure deploy should never have the side
 * effect of silently altering a live schema.
 *
 * NOTE: this wrapper and the baseline migration have not yet been run
 * against a real database. node-pg-migrate's exact SQL-migration file
 * convention and programmatic API surface can vary by installed
 * version — verify both against the installed package's own docs
 * before relying on this for a real migration, per Database Schema
 * §4.2's "recommendation, not yet implemented" caveat.
 *
 * Prerequisites:
 *   npm install (installs node-pg-migrate)
 *   DB accessible (see .env.example — same DB_* vars as provision-devices.ts)
 *
 * Usage:
 *   npx ts-node migrate.ts up      # apply all pending migrations
 *   npx ts-node migrate.ts down    # roll back the most recent migration
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

import { Client } from 'pg';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import runner from 'node-pg-migrate';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// ── DB ────────────────────────────────────────────────────────────────────────
// Mirrors provision-devices.ts's connection resolution — same env vars,
// same DB_SECRET_ARN -> Secrets Manager fallback.

async function buildClient(): Promise<Client> {
  let password = process.env.DB_PASSWORD;

  if (!password && process.env.DB_SECRET_ARN) {
    const sm = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
    const res = await sm.send(new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }));
    const secret = JSON.parse(res.SecretString!) as { password: string };
    password = secret.password;
  }

  const ssl = process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false };

  return new Client({
    host:     process.env.DB_HOST ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? 'peaklogic',
    user:     process.env.DB_USER ?? 'peaklogic_admin',
    password,
    ssl,
    connectionTimeoutMillis: 10_000,
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  const client = await buildClient();
  await client.connect();

  try {
    await runner({
      dbClient: client,
      dir: MIGRATIONS_DIR,
      direction,
      migrationsTable: 'pgmigrations',
      count: direction === 'down' ? 1 : Infinity,
    });
    console.log(`Migrations (${direction}) complete.`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
