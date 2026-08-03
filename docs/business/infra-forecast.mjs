// Azure infrastructure and compute forecast for PeakLogic.
//
// Every figure traces to a stated assumption about telemetry volume and to Azure
// list pricing (East US, pay-as-you-go, 2026). The purpose is to answer three
// questions an investor or a CTO will ask: what does the cloud actually cost per
// site, at what site counts does each service change tier, and does the cost
// curve stay comfortably beneath the revenue curve.

const f = (n) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`);
const f2 = (n) => `$${n.toFixed(2)}`;

// ── Telemetry assumptions ────────────────────────────────────────────────
// Readings are BATCHED: one message per site per interval carrying every metric.
// Sending one message per metric would multiply IoT Hub cost eightfold for no
// operational gain, and IoT Hub bills per message, not per byte under 4KB.
const METRICS_PER_SITE = 8;
const SAMPLE_SECONDS = 60;
const MSG_PER_SITE_DAY = (24 * 3600) / SAMPLE_SECONDS; // 1,440 batched messages
const READINGS_PER_SITE_DAY = MSG_PER_SITE_DAY * METRICS_PER_SITE; // 11,520 rows
const BYTES_PER_READING = 48; // metric, value, ts, device fk — narrow row
const HOT_DAYS = 90; // full resolution retained in Postgres
const ARCHIVE_COMPRESSION = 0.12; // zstd on columnar batches

// ── Azure list pricing (East US, PAYG) ───────────────────────────────────
const PRICE = {
  iotHubFree: { msgDay: 8000, usd: 0 },
  iotHubS1: { msgDay: 400_000, usd: 25 },
  iotHubS2: { msgDay: 6_000_000, usd: 250 },
  iotHubS3: { msgDay: 300_000_000, usd: 2500 },
  functionsFreeExec: 1_000_000,
  functionsPerMillionExec: 0.20,
  functionsPerGbSec: 0.000016,
  functionsFreeGbSec: 400_000,
  pgB1ms: { vcore: 1, gb: 2, usd: 14 },
  pgB2s: { vcore: 2, gb: 4, usd: 29 },
  pgD2ds: { vcore: 2, gb: 8, usd: 138 },
  pgD4ds: { vcore: 4, gb: 16, usd: 276 },
  pgD8ds: { vcore: 8, gb: 32, usd: 552 },
  pgStoragePerGb: 0.115,
  blobHotPerGb: 0.018,
  blobCoolPerGb: 0.010,
  logAnalyticsFreeGb: 5,
  logAnalyticsPerGb: 2.30,
  apimConsumptionFreeCalls: 1_000_000,
  apimPerMillionCalls: 3.50,
  egressFreeGb: 100,
  egressPerGb: 0.087,
  keyVaultOps: 3, // flat, trivial
};

function iotHub(msgDay) {
  if (msgDay <= PRICE.iotHubFree.msgDay) return { tier: 'F1 free', usd: 0, units: 1 };
  if (msgDay <= PRICE.iotHubS1.msgDay) return { tier: 'S1 ×1', usd: 25, units: 1 };
  if (msgDay <= PRICE.iotHubS1.msgDay * 10) {
    const u = Math.ceil(msgDay / PRICE.iotHubS1.msgDay);
    return { tier: `S1 ×${u}`, usd: u * 25, units: u };
  }
  const u = Math.ceil(msgDay / PRICE.iotHubS2.msgDay);
  return { tier: `S2 ×${u}`, usd: u * 250, units: u };
}

function postgres(hotGb, sites) {
  // Sized on concurrent write throughput first, storage second.
  const writesPerSec = (sites * READINGS_PER_SITE_DAY) / 86_400;
  let sku;
  if (sites <= 250 && writesPerSec < 40) sku = ['B2s', PRICE.pgB2s.usd];
  else if (sites <= 1500) sku = ['D2ds_v5', PRICE.pgD2ds.usd];
  else if (sites <= 5000) sku = ['D4ds_v5', PRICE.pgD4ds.usd];
  else sku = ['D8ds_v5', PRICE.pgD8ds.usd];
  const storage = Math.max(32, hotGb * 1.6) * PRICE.pgStoragePerGb; // index + WAL overhead
  return { sku: sku[0], compute: sku[1], storage, usd: sku[1] + storage, writesPerSec };
}

const YEARS = [
  { yr: 1, sites: 150, arr: 97_000 },
  { yr: 2, sites: 600, arr: 328_000 },
  { yr: 3, sites: 1800, arr: 922_000 },
  { yr: 4, sites: 4000, arr: 1_970_000 },
  { yr: 5, sites: 8000, arr: 3_750_000 },
];

console.log('ASSUMPTIONS');
console.log(`  ${METRICS_PER_SITE} metrics per site, sampled every ${SAMPLE_SECONDS}s, batched into one message`);
console.log(`  ${MSG_PER_SITE_DAY.toLocaleString()} messages and ${READINGS_PER_SITE_DAY.toLocaleString()} readings per site per day`);
console.log(`  ${HOT_DAYS} days at full resolution in Postgres, then compressed to blob archive\n`);

const rows = [];
for (const y of YEARS) {
  const msgDay = y.sites * MSG_PER_SITE_DAY;
  const readingsDay = y.sites * READINGS_PER_SITE_DAY;
  const hotGb = (readingsDay * HOT_DAYS * BYTES_PER_READING) / 1e9;
  const archiveGbYr = (readingsDay * 365 * BYTES_PER_READING * ARCHIVE_COMPRESSION) / 1e9;

  const hub = iotHub(msgDay);
  const pg = postgres(hotGb, y.sites);

  // Functions: one ingest execution per message, plus scheduled sweeps and API.
  const execMonth = msgDay * 30 + 200_000;
  const gbSec = execMonth * 0.35 * 0.5; // ~350ms at 0.5GB
  const fnUsd =
    Math.max(0, (execMonth - PRICE.functionsFreeExec) / 1e6) * PRICE.functionsPerMillionExec +
    Math.max(0, gbSec - PRICE.functionsFreeGbSec) * PRICE.functionsPerGbSec;

  // Observability grows with the estate but is sampled, not full-fidelity.
  const logGb = 2 + y.sites * 0.004 * 30;
  const logUsd = Math.max(0, logGb - PRICE.logAnalyticsFreeGb) * PRICE.logAnalyticsPerGb;

  // API calls: portals and the operator app polling, plus partner integrations.
  const apiCalls = y.sites * 900 * 30;
  const apimUsd = Math.max(0, (apiCalls - PRICE.apimConsumptionFreeCalls) / 1e6) * PRICE.apimPerMillionCalls;

  const blobUsd = archiveGbYr * PRICE.blobCoolPerGb; // cumulative handled below
  const egressGb = y.sites * 0.9;
  const egressUsd = Math.max(0, egressGb - PRICE.egressFreeGb) * PRICE.egressPerGb;

  const total = hub.usd + pg.usd + fnUsd + logUsd + apimUsd + blobUsd + egressUsd + PRICE.keyVaultOps;
  rows.push({ ...y, msgDay, hotGb, archiveGbYr, hub, pg, fnUsd, logUsd, apimUsd, blobUsd, egressUsd, total });
}

console.log('MONTHLY AZURE COST');
console.log('Yr  Sites   Msg/day     IoT Hub     Postgres        Functions  LogAn   APIM   Blob  Egress    TOTAL/mo   $/site/mo');
for (const r of rows) {
  console.log(
    `${String(r.yr).padStart(2)} ${String(r.sites).padStart(6)} ${r.msgDay.toLocaleString().padStart(10)}  ` +
      `${(r.hub.tier + ' ' + f(r.hub.usd)).padEnd(12)}${(r.pg.sku + ' ' + f(r.pg.usd)).padEnd(16)}` +
      `${f(r.fnUsd).padStart(8)} ${f(r.logUsd).padStart(7)} ${f(r.apimUsd).padStart(6)} ${f(r.blobUsd).padStart(6)} ${f(r.egressUsd).padStart(6)}  ` +
      `${f(r.total).padStart(9)}  ${f2(r.total / r.sites).padStart(10)}`,
  );
}

console.log('\nCOST AGAINST REVENUE');
console.log('Yr  Infra/yr    ARR        Infra as % of ARR   Gross margin impact');
for (const r of rows) {
  const yr = r.total * 12;
  console.log(
    `${String(r.yr).padStart(2)} ${f(yr).padStart(9)} ${f(r.arr).padStart(10)}  ${((yr / r.arr) * 100).toFixed(1).padStart(15)}%   ${(100 - (yr / r.arr) * 100).toFixed(1)}% left before other COGS`,
  );
}

console.log('\nSCALING INFLECTION POINTS');
const points = [
  [Math.ceil(PRICE.iotHubFree.msgDay / MSG_PER_SITE_DAY), 'IoT Hub leaves the free tier (F1 → S1)'],
  [Math.ceil(PRICE.iotHubS1.msgDay / MSG_PER_SITE_DAY), 'IoT Hub needs a second S1 unit'],
  [Math.ceil(PRICE.functionsFreeExec / (MSG_PER_SITE_DAY * 30)), 'Functions exceeds the 1M free monthly executions'],
  [250, 'Postgres moves off Burstable — sustained writes exceed what B-series credits sustain'],
  [1500, 'Postgres → D4ds: index maintenance on telemetry becomes the bottleneck'],
  [2000, 'Introduce table partitioning by month; full-scan vacuum starts to hurt'],
  [3500, 'Read replica for reporting so analytics stops competing with ingest'],
  [5000, 'Postgres → D8ds, and archive tiering moves from nightly to streaming'],
  [Math.ceil(PRICE.iotHubS1.msgDay * 10 / MSG_PER_SITE_DAY), 'IoT Hub → S2; also the point to evaluate Event Hubs directly'],
];
points.sort((a, b) => a[0] - b[0]);
for (const [n, what] of points) console.log(`  ~${String(n).padStart(5)} sites   ${what}`);

// Machine-readable output beside the document, so the business plan and this
// model can be checked against each other without re-deriving anything.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'infra-forecast.json'), JSON.stringify(rows, null, 2));
