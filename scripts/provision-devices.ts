#!/usr/bin/env ts-node
/**
 * PeakLogic Device Provisioning Script
 *
 * For each device serial this script:
 *   1. Creates an AWS IoT Core Thing (type: PeakLogicSensor)
 *   2. Generates an X.509 certificate + private key
 *   3. Attaches the PeakLogicDevicePolicy to the certificate
 *   4. Attaches the certificate to the Thing
 *   5. Saves cert + firmware config files to ./device-certs/{serial}/
 *   6. Inserts a DB record  (tenant_id = NULL, status = provisioning)
 *      — ready for a customer to claim via the onboarding wizard
 *
 * Prerequisites:
 *   AWS credentials configured (aws configure / IAM role / env vars)
 *   DB accessible (see .env.example)
 *   CDK stacks deployed  (IoT policy + thing type must already exist)
 *
 * Usage:
 *   cd scripts && npm install
 *
 *   # Provision 5 new devices (auto-increment serials)
 *   npx ts-node provision-devices.ts --count 5
 *
 *   # Provision specific serials
 *   npx ts-node provision-devices.ts --serials PLG-0001,PLG-0002,PLG-0003
 *
 *   # DB-only mode — skips IoT Core (useful for local dev / testing the wizard)
 *   npx ts-node provision-devices.ts --count 5 --db-only
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

import {
  IoTClient,
  CreateThingCommand,
  CreateKeysAndCertificateCommand,
  AttachThingPrincipalCommand,
  AttachPolicyCommand,
  DescribeEndpointCommand,
} from '@aws-sdk/client-iot';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { Pool, PoolClient } from 'pg';

// Disclosed, deliberate scope boundary (2026-08-09): this whole file is
// AWS IoT Core device provisioning — porting it to Azure IoT Hub/DPS is
// real, separate, tracked work (hub-enrollment-and-identity-design.md),
// not attempted here. migrate.ts's own DB-credential resolution (this
// file's closest sibling — buildClient() below used to mirror it exactly)
// was ported to Key Vault while fixing the CI migration-validate step;
// this file's copy was deliberately left AWS-only rather than silently
// scope-creeping a CI/CD fix into IoT provisioning. Port both together
// when DPS enrollment work actually starts.

// ── Constants ─────────────────────────────────────────────────────────────────

const THING_TYPE    = 'PeakLogicSensor';
const POLICY_NAME   = 'PeakLogicDevicePolicy';
const SERIAL_PREFIX = 'PLG';
const CERTS_DIR     = path.join(process.cwd(), '..', 'device-certs');

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
};

const sym = {
  ok:   `${C.green}✓${C.reset}`,
  err:  `${C.red}✗${C.reset}`,
  skip: `${C.dim}~${C.reset}`,
  warn: `${C.yellow}⚠${C.reset} `,
};

// ── Arg parsing ───────────────────────────────────────────────────────────────

interface Args {
  count?:   number;
  serials?: string[];
  dbOnly:   boolean;
  region:   string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get  = (flag: string) => { const i = argv.indexOf(flag); return i !== -1 ? argv[i + 1] : undefined; };
  const has  = (flag: string) => argv.includes(flag);

  const countStr    = get('--count');
  const serialsStr  = get('--serials');

  if (!countStr && !serialsStr) {
    console.error(`\nUsage:\n  ts-node provision-devices.ts --count N\n  ts-node provision-devices.ts --serials A,B,C\n`);
    process.exit(1);
  }

  return {
    count:   countStr   ? parseInt(countStr, 10) : undefined,
    serials: serialsStr ? serialsStr.split(',').map(s => s.trim().toUpperCase()) : undefined,
    dbOnly:  has('--db-only'),
    region:  get('--region') ?? process.env.AWS_REGION ?? 'us-east-1',
  };
}

// ── DB ────────────────────────────────────────────────────────────────────────

async function buildPool(): Promise<Pool> {
  let password = process.env.DB_PASSWORD;

  if (!password && process.env.DB_SECRET_ARN) {
    const sm = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
    const res = await sm.send(new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }));
    const secret = JSON.parse(res.SecretString!) as { password: string };
    password = secret.password;
  }

  const ssl = process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false };

  return new Pool({
    host:     process.env.DB_HOST ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? 'peaklogic',
    user:     process.env.DB_USER ?? 'peaklogic_admin',
    password,
    ssl,
    connectionTimeoutMillis: 10_000,
  });
}

// ── Serial generation ─────────────────────────────────────────────────────────

async function nextSerials(client: PoolClient, count: number): Promise<string[]> {
  // Multi-Tenant Architecture v1.1 — must see EVERY device ever
  // provisioned, claimed or not, to avoid generating a duplicate serial.
  // Relies on app.provisioning_context being set on this client (main())
  // — a narrower "unclaimed only" policy would silently undercount
  // already-claimed devices and risk a real collision.
  const { rows } = await client.query<{ serial: string }>(
    `SELECT serial FROM devices WHERE serial LIKE $1 ORDER BY serial DESC LIMIT 1`,
    [`${SERIAL_PREFIX}-%`],
  );

  let next = 1;
  if (rows.length > 0) {
    const n = parseInt(rows[0].serial.split('-')[1] ?? '0', 10);
    if (!isNaN(n)) next = n + 1;
  }

  return Array.from({ length: count }, (_, i) =>
    `${SERIAL_PREFIX}-${String(next + i).padStart(4, '0')}`,
  );
}

function thingName(serial: string): string {
  // IoT Core thing names: lowercase, hyphens only
  return serial.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

// ── IoT Core provisioning ─────────────────────────────────────────────────────

interface Creds {
  thingName:      string;
  endpoint:       string;
  certificateArn: string;
  certPem:        string;
  privateKey:     string;
}

async function provisionThing(
  iot: IoTClient,
  serial: string,
  name: string,
  endpoint: string,
): Promise<Creds> {
  await iot.send(new CreateThingCommand({
    thingName:    name,
    thingTypeName: THING_TYPE,
    attributePayload: { attributes: { serial } },
  }));

  const certRes = await iot.send(new CreateKeysAndCertificateCommand({ setAsActive: true }));
  const { certificateArn, certificatePem, keyPair } = certRes;

  if (!certificateArn || !certificatePem || !keyPair?.PrivateKey) {
    throw new Error('IoT Core did not return certificate material');
  }

  // Attach policy → cert (authorises MQTT connect/publish/subscribe)
  await iot.send(new AttachPolicyCommand({ policyName: POLICY_NAME, target: certificateArn }));

  // Attach cert → thing
  await iot.send(new AttachThingPrincipalCommand({ thingName: name, principal: certificateArn }));

  return { thingName: name, endpoint, certificateArn, certPem: certificatePem, privateKey: keyPair.PrivateKey };
}

// ── Save credential bundle ────────────────────────────────────────────────────

function saveCerts(serial: string, creds: Creds): string {
  const dir = path.join(CERTS_DIR, serial);
  fs.mkdirSync(dir, { recursive: true });

  // Files flashed onto the physical device
  fs.writeFileSync(path.join(dir, 'certificate.pem'), creds.certPem,    { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'private.key'),     creds.privateKey,  { mode: 0o600 });

  // Firmware config — everything needed to connect
  const config = {
    serial,
    thingName:      creds.thingName,
    endpoint:       creds.endpoint,
    port:           8883,
    clientId:       creds.thingName,
    topics: {
      telemetry: `peaklogic/${creds.thingName}/telemetry`,
      commands:  `peaklogic/${creds.thingName}/commands`,
    },
    certificateArn: creds.certificateArn,
    rootCaUrl: 'https://www.amazontrust.com/repository/AmazonRootCA1.pem',
  };
  fs.writeFileSync(path.join(dir, 'device-config.json'), JSON.stringify(config, null, 2));

  return dir;
}

// ── Results summary ───────────────────────────────────────────────────────────

interface Result {
  serial:  string;
  state:   'ok' | 'skipped' | 'failed';
  detail?: string;
}

function printSummary(results: Result[], dbOnly: boolean) {
  const ok      = results.filter(r => r.state === 'ok').length;
  const skipped = results.filter(r => r.state === 'skipped').length;
  const failed  = results.filter(r => r.state === 'failed').length;

  console.log(`\n${C.bold}Summary:${C.reset}  ${C.green}${ok} provisioned${C.reset}  ·  ${skipped} skipped  ·  ${failed > 0 ? C.red : ''}${failed} failed${failed > 0 ? C.reset : ''}\n`);

  if (!dbOnly && ok > 0) {
    console.log(`${sym.warn}${C.yellow}device-certs/${C.reset} contains private keys — store securely and never commit to git.`);
    console.log(`${C.dim}   Each folder has: certificate.pem · private.key · device-config.json${C.reset}\n`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}${C.cyan}PeakLogic — Device Provisioning${C.reset}\n`);

  const args = parseArgs();

  console.log(`${C.dim}Mode   : ${args.dbOnly ? 'DB-only (IoT Core skipped)' : 'Full (IoT Core + DB)'}${C.reset}`);
  console.log(`${C.dim}Region : ${args.region}${C.reset}\n`);

  const pool = await buildPool().catch(e => {
    console.error(`${sym.err} DB connection failed: ${e.message}`);
    process.exit(1);
  });

  // Multi-Tenant Architecture v1.1 — a single, dedicated client for this
  // script's whole run, not pool.query() per call. Needed for two reasons:
  // (1) app.provisioning_context (set below) is session-scoped (plain SET,
  // not SET LOCAL — there's no per-request transaction here to scope it
  // to), so every query in this script must reuse the SAME underlying
  // connection or the setting wouldn't apply; pool.query() may check out a
  // different connection per call. (2) devices now has FORCE ROW LEVEL
  // SECURITY — this script's SELECTs/INSERT would be silently blocked
  // without this marker (see the new provisioning_lookup/
  // provision_unclaimed policies, docs/data-model.sql).
  const client = await pool.connect();
  await client.query("SET app.provisioning_context = 'true'");

  // Resolve serial list
  const serials = args.serials ?? await nextSerials(client, args.count!);
  console.log(`Provisioning ${C.bold}${serials.length}${C.reset} device(s): ${serials.join(', ')}\n`);

  // Resolve IoT endpoint once (reused per device to avoid quota on DescribeEndpoint)
  let endpoint = '';
  let iot: IoTClient | null = null;

  if (!args.dbOnly) {
    iot = new IoTClient({ region: args.region });
    const ep = await iot.send(new DescribeEndpointCommand({ endpointType: 'iot:Data-ATS' }));
    endpoint = ep.endpointAddress!;
    console.log(`${C.dim}IoT endpoint: ${endpoint}${C.reset}\n`);
  }

  const results: Result[] = [];

  for (const serial of serials) {
    const name = thingName(serial);

    // Idempotency — skip if DB record already exists (claimed or not —
    // relies on app.provisioning_context, same reasoning as nextSerials())
    const { rows } = await client.query('SELECT id FROM devices WHERE serial = $1', [serial]);
    if (rows.length > 0) {
      console.log(`  ${sym.skip} ${serial.padEnd(12)} already exists — skipped`);
      results.push({ serial, state: 'skipped' });
      continue;
    }

    try {
      let certNote = '(db-only)';

      if (iot && !args.dbOnly) {
        const creds = await provisionThing(iot, serial, name, endpoint);
        const dir   = saveCerts(serial, creds);
        certNote    = path.relative(process.cwd(), dir);
      }

      // provision_unclaimed's WITH CHECK (tenant_id IS NULL) permits this
      // insert regardless of app.provisioning_context — no REST API route
      // creates devices, so this INSERT is only ever reachable from this
      // trusted, offline script in the first place.
      await client.query(
        `INSERT INTO devices (serial, thing_name, status, tenant_id)
         VALUES ($1, $2, 'provisioning', NULL)
         ON CONFLICT (serial) DO NOTHING`,
        [serial, name],
      );

      console.log(`  ${sym.ok} ${serial.padEnd(12)} thing: ${C.dim}${name.padEnd(26)}${C.reset} certs: ${C.dim}${certNote}${C.reset}`);
      results.push({ serial, state: 'ok' });

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ${sym.err} ${serial.padEnd(12)} ${C.red}${msg}${C.reset}`);
      results.push({ serial, state: 'failed', detail: msg });
    }
  }

  client.release();
  await pool.end();
  printSummary(results, args.dbOnly);
}

main().catch(e => {
  console.error(`\n${sym.err} ${C.red}Fatal:${C.reset}`, e instanceof Error ? e.message : e);
  process.exit(1);
});
