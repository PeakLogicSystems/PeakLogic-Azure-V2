#!/usr/bin/env ts-node
/**
 * PeakLogic Database Migration Runner
 *
 * Applies versioned schema migrations from ./migrations using
 * node-pg-migrate (Database Schema §4.2). Deliberately not wired
 * automatically into an infra deploy — a Bicep deploy should never have
 * the side effect of silently altering a live schema; see
 * docs/architecture/cicd-pipeline.md for the explicit migration-validate
 * step CI now runs instead (architecture-review Gap 5/ADR-004).
 *
 * Ported to Azure 2026-08-09 — this file was AWS-only from the fork's
 * baseline through the entire Azure pivot (`@aws-sdk/client-secrets-
 * manager`, never touched), an oversight caught while wiring a real CI
 * migration-validate step: a step that ran this script would have failed
 * immediately in any Azure context, since AWS Secrets Manager doesn't
 * exist here. Now mirrors backend/shared/db.ts's own credential-resolution
 * pattern exactly (DefaultAzureCredential + Key Vault, secret name
 * `postgres-admin-credential`, same JSON shape) rather than inventing a
 * second convention.
 *
 * NOTE: this wrapper and the baseline migration have not yet been run
 * against a real Azure Postgres instance (no subscription exists yet) —
 * they HAVE now been run against a real ephemeral Postgres in CI (the same
 * `postgis/postgis:16-3.4` service container backend/'s integration tests
 * use), which is what CI/CD Pipeline's migration-validate step proves on
 * every push. node-pg-migrate's exact SQL-migration file convention and
 * programmatic API surface can still vary by installed version — verify
 * against the installed package's own docs before a first real production
 * run, per Database Schema §4.2's "recommendation, verified in CI, not yet
 * run against production" caveat.
 *
 * Prerequisites:
 *   npm install (installs node-pg-migrate)
 *   DB accessible (see .env.example)
 *
 * Usage:
 *   npx ts-node migrate.ts up      # apply all pending migrations
 *   npx ts-node migrate.ts down    # roll back the most recent migration
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

import { Client } from 'pg';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import runner from 'node-pg-migrate';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// ── DB ────────────────────────────────────────────────────────────────────────
// Mirrors backend/shared/db.ts's getCredentialFromKeyVault() exactly — same
// secret name, same JSON shape ({username, password, host, port?, dbname?}) —
// so there is only one place this convention is defined, not two that can
// drift. DB_DATABASE_URL is the one addition: a plain connection string,
// used for CI's ephemeral test Postgres and local dev, the direct analogue
// of db.ts's own TEST_DATABASE_URL/TEST_APP_DATABASE_URL bypass — gated on
// a variable no real Azure deployment ever sets, same reasoning.

interface KeyVaultDbCredential {
  username: string;
  password: string;
  host: string;
  port?: number;
  dbname?: string;
}

async function getCredentialFromKeyVault(): Promise<KeyVaultDbCredential> {
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(process.env.KEY_VAULT_URI!, credential);
  const secret = await client.getSecret('postgres-admin-credential');
  return JSON.parse(secret.value!) as KeyVaultDbCredential;
}

async function buildClient(): Promise<Client> {
  if (process.env.DB_DATABASE_URL) {
    return new Client({ connectionString: process.env.DB_DATABASE_URL, ssl: false });
  }

  const credential = await getCredentialFromKeyVault();
  return new Client({
    host:     credential.host,
    port:     credential.port ?? 5432,
    database: credential.dbname ?? 'peaklogic',
    user:     credential.username,
    password: credential.password,
    ssl: { rejectUnauthorized: true },
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
