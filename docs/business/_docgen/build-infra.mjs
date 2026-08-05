import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cover, toc, docShell } from './style.mjs';
import { columns, line, stacked, milestones, COLOURS as C, money } from './charts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..');
const out = join(here, '..', 'Investor Documents');
const rows = JSON.parse(readFileSync(join(src, 'infra-forecast.json'), 'utf8'));

const yrs = rows.map((r) => `Yr ${r.yr}`);
const perSite = rows.map((r) => r.total / r.sites);
const pctArr = rows.map((r) => ((r.total * 12) / r.arr) * 100);

const body = `
${cover({
  kicker: 'Technical & financial due diligence',
  title: 'Infrastructure & Compute Forecast',
  sub: 'What the cloud costs per site, where the platform changes gear, and why infrastructure never threatens the software margin.',
  meta: [
    { k: 'Document', v: 'Artifact #39 · v1.0' },
    { k: 'Prepared', v: '2 August 2026' },
    { k: 'Basis', v: 'Azure list rates, East US' },
    { k: 'Status', v: 'Model · not yet metered' },
  ],
})}

${toc([
  { t: 'What this answers', d: 'Three questions, in the order they get asked' },
  { t: 'Telemetry assumptions', d: 'The load-bearing numbers' },
  { t: 'Cost per site', d: 'Monthly Azure spend, years 1–5' },
  { t: 'Cost against revenue', d: 'Infrastructure as a share of ARR' },
  { t: 'Where the money goes', d: 'Composition, and the first optimisation' },
  { t: 'Scaling inflection points', d: 'When to act, and on what' },
  { t: 'Exclusions', d: 'What these figures do not carry' },
  { t: 'Method', d: 'Reproducing and challenging the model' },
])}

<main>

<section>
  <h2>What this answers</h2>
  <p class="lede">Infrastructure costs <b>$0.72–$0.91 per site per month</b> against $22–38 of recurring revenue, stays under 2% of ARR at every stage of the plan, and falls as the estate grows.</p>
  <div class="metrics">
    <div class="metric metric--key"><div class="metric__l">Cost per site</div><div class="metric__v">$0.72</div><div class="metric__s">per month at 8,000 sites</div></div>
    <div class="metric"><div class="metric__l">Share of ARR</div><div class="metric__v">1.8%</div><div class="metric__s">never exceeds 2.0%</div></div>
    <div class="metric"><div class="metric__l">Year-5 spend</div><div class="metric__v">$68.8K</div><div class="metric__s">annual, 8,000 sites</div></div>
    <div class="metric"><div class="metric__l">First hard gate</div><div class="metric__v">250</div><div class="metric__s">sites — Postgres leaves Burstable</div></div>
  </div>
  <p>Three questions get asked of this platform, in this order. What does the cloud actually cost per site, given the recurring price is $22–38 and infrastructure has to disappear inside it. At what site counts does each service change tier, so capacity is planned rather than discovered. And does the cost curve stay under the revenue curve — the question behind the other two.</p>
</section>

<section>
  <h2>Telemetry assumptions</h2>
  <p class="dek">Every figure in this document derives from these six numbers. Change one and the model moves.</p>
  <table class="tbl">
    <thead><tr><th>Assumption</th><th class="n">Value</th><th>Rationale</th></tr></thead>
    <tbody>
      <tr><td>Metrics per site</td><td class="n">8</td><td>Matches the tile count on both configured site types</td></tr>
      <tr><td>Sample interval</td><td class="n">60 s</td><td>Below the fastest silence-detection window, so a dead sensor is caught inside one sweep</td></tr>
      <tr><td>Messages per site / day</td><td class="n">1,440</td><td><b>Batched</b> — one message carrying all eight metrics</td></tr>
      <tr><td>Readings per site / day</td><td class="n">11,520</td><td>8 metrics × 1,440 messages</td></tr>
      <tr><td>Bytes per reading</td><td class="n">48</td><td>Narrow row: device key, metric, value, timestamp</td></tr>
      <tr><td>Full-resolution retention</td><td class="n">90 d</td><td>In Postgres, then compressed to blob at ~12% of raw</td></tr>
    </tbody>
  </table>
  <div class="pull"><p>Batching is the most consequential decision here. IoT Hub bills per message under 4&nbsp;KB, so one message per metric would multiply that line <em>eightfold</em> for identical data — the difference between S1&nbsp;×7 and S2&nbsp;×3 at 1,800 sites.</p></div>
</section>

<section>
  <h2>Cost per site</h2>
  <p class="dek">Priced at pay-as-you-go list rates. No reserved instances, no enterprise agreement, no negotiated discount — each of which is available later and only improves these figures.</p>

  ${line({
    categories: yrs,
    values: perSite.map((v) => Math.round(v * 100) / 100),
    format: (v) => `$${v.toFixed(2)}`,
    caption: 'Monthly infrastructure cost per site',
    yLabel: '$ / site / mo',
    note: 'Cost per site falls as the estate grows: the fixed floor — database compute, observability baseline, Key Vault — amortises across more sites. There is no point at which this inverts.',
  })}

  <table class="tbl">
    <thead><tr><th>Yr</th><th class="n">Sites</th><th class="n">Msg/day</th><th>IoT Hub</th><th>PostgreSQL</th><th class="n">Functions</th><th class="n">Log&nbsp;Analytics</th><th class="n">APIM</th><th class="n">Egress</th><th class="n">Total/mo</th><th class="n">$/site</th></tr></thead>
    <tbody>
      ${rows
        .map(
          (r) => `<tr>
        <td>${r.yr}</td><td class="n">${r.sites.toLocaleString()}</td><td class="n">${(r.msgDay / 1000).toFixed(0)}K</td>
        <td>${r.hub.tier}</td><td>${r.pg.sku}</td>
        <td class="n">${money(r.fnUsd)}</td><td class="n">${money(r.logUsd)}</td><td class="n">${money(r.apimUsd)}</td><td class="n">${money(r.egressUsd)}</td>
        <td class="n"><b>${money(r.total)}</b></td><td class="n">$${(r.total / r.sites).toFixed(2)}</td></tr>`,
        )
        .join('')}
    </tbody>
  </table>
  <p class="cap">Monthly figures. IoT Hub and PostgreSQL tiers shown as provisioned; all other lines are consumption-priced.</p>
</section>

<section>
  <h2>Cost against revenue</h2>
  ${columns({
    categories: yrs,
    series: [
      { name: 'ARR', colour: C.accent, values: rows.map((r) => r.arr) },
      { name: 'Infrastructure (annual)', colour: C.accent2, values: rows.map((r) => r.total * 12) },
    ],
    caption: 'Annual recurring revenue against annual infrastructure cost',
    note: 'Drawn to a shared axis. Infrastructure is visible only as a hairline at this scale, which is the point.',
  })}
  <table class="tbl">
    <thead><tr><th>Year</th><th class="n">Infrastructure / yr</th><th class="n">ARR</th><th class="n">Infra as % of ARR</th></tr></thead>
    <tbody>
      ${rows.map((r) => `<tr><td>Year ${r.yr}</td><td class="n">${money(r.total * 12)}</td><td class="n">${money(r.arr)}</td><td class="n">${(((r.total * 12) / r.arr) * 100).toFixed(1)}%</td></tr>`).join('')}
    </tbody>
  </table>
  <p>The 82% software gross margin assumed in the business plan is not at risk from cloud spend. It is at risk from support and field cost, which is where scrutiny belongs.</p>
</section>

<section>
  <h2>Where the money goes</h2>
  ${stacked({
    categories: yrs,
    series: [
      { name: 'IoT Hub', colour: '#4c2a9c', values: rows.map((r) => r.hub.usd) },
      { name: 'PostgreSQL', colour: '#7c5ad4', values: rows.map((r) => r.pg.usd) },
      { name: 'Functions', colour: '#a58ae4', values: rows.map((r) => r.fnUsd) },
      { name: 'Log Analytics', colour: '#c9b8f0', values: rows.map((r) => r.logUsd) },
      { name: 'APIM + egress', colour: '#e2d9f8', values: rows.map((r) => r.apimUsd + r.egressUsd + r.blobUsd) },
    ],
    caption: 'Monthly cost composition',
    note: 'Two lines dominate, and neither is the one intuition suggests.',
  })}
  <div class="cards c3">
    <div class="card"><span class="card__k">Largest by year 3</span><h4>Log Analytics</h4><p>Observability, not compute — $490/mo rising to $2,200. It is also the most compressible: moving verbose diagnostics to a Basic table roughly halves it. The first optimisation to make, not the first thing to buy more of.</p></div>
    <div class="card"><span class="card__k">Least elastic</span><h4>PostgreSQL</h4><p>The largest fixed commitment. Everything else scales smoothly with usage; the database steps, and each step needs planning ahead of the load rather than in response to it.</p></div>
    <div class="card"><span class="card__k">Cheaper than expected</span><h4>IoT Hub</h4><p>$500/mo at 8,000 sites, precisely because telemetry is batched. This is the line that would have dominated under a naive per-metric design.</p></div>
  </div>
</section>

<section>
  <h2>Scaling inflection points</h2>
  <p class="dek">Site counts at which something must change. These are planning triggers, not failures.</p>
  ${milestones({
    points: [
      { at: 6, label: 'IoT Hub → S1' },
      { at: 24, label: 'Functions past free tier' },
      { at: 250, label: 'Postgres leaves Burstable', key: true },
      { at: 278, label: 'Second S1 unit' },
      { at: 1500, label: 'Postgres → D4ds' },
      { at: 2000, label: 'Partition telemetry', key: true },
      { at: 2778, label: 'IoT Hub → S2' },
      { at: 3500, label: 'Read replica' },
      { at: 8000, label: 'Postgres → D8ds' },
    ],
    caption: 'When the platform changes gear',
    note: 'Log scale. Marked points need a decision; the rest are automatic.',
  })}
  <table class="tbl">
    <thead><tr><th class="n">Sites</th><th>What changes</th><th>Action required</th></tr></thead>
    <tbody>
      <tr><td class="n">~6</td><td>IoT Hub leaves the free tier</td><td>None — $25/mo</td></tr>
      <tr><td class="n">~24</td><td>Functions exceeds 1M free monthly executions</td><td>None — marginal cost is pennies</td></tr>
      <tr class="tot"><td class="n">~250</td><td>PostgreSQL must leave Burstable</td><td><b>First real decision.</b> B-series runs on CPU credits; sustained ingest exhausts them and latency collapses without warning. Migrate <em>before</em> this point.</td></tr>
      <tr><td class="n">~278</td><td>IoT Hub needs a second S1 unit</td><td>Additive and instant; no migration</td></tr>
      <tr><td class="n">~1,500</td><td>PostgreSQL → D4ds_v5</td><td>Index maintenance on telemetry becomes the bottleneck ahead of raw CPU</td></tr>
      <tr class="tot"><td class="n">~2,000</td><td>Partition telemetry by month</td><td>Vacuum and scan cost on one large table starts to hurt. Partitioning also makes the 90-day retention drop a metadata operation.</td></tr>
      <tr><td class="n">~2,778</td><td>IoT Hub → S2</td><td>Also the point to evaluate consuming Event Hubs directly</td></tr>
      <tr><td class="n">~3,500</td><td>Read replica for reporting</td><td>Analytics begins competing with ingest; a replica is cheaper than sizing the primary for both</td></tr>
      <tr><td class="n">~5,000</td><td>PostgreSQL → D8ds_v5; streaming archival</td><td>Nightly batch archival no longer completes inside its window</td></tr>
    </tbody>
  </table>
  <div class="pull"><p>The one to plan for is <em>250 sites</em>. Everything before it is automatic and everything after it is a scheduled migration with a known cost — but Burstable-to-General-Purpose is the only transition where mistiming produces an outage rather than a bill.</p></div>
</section>

<section>
  <h2>Exclusions</h2>
  <p class="dek">Stated plainly, because a forecast that omits its own gaps is not usable.</p>
  <div class="cards c2">
    <div class="card"><h4>Non-production environments</h4><p>Dev and staging add roughly 25–30% in years 1–2, less thereafter as they stay small while production grows.</p></div>
    <div class="card"><h4>Hub-side compute</h4><p>The on-premises appliance is customer hardware, costed inside the $1,800 site kit rather than here.</p></div>
    <div class="card"><h4>AI inference</h4><p>Tier 3 prescriptive analytics is design-only. When it ships it becomes the fastest-growing line in this model and needs its own forecast.</p></div>
    <div class="card"><h4>Reserved-instance discount</h4><p>One- and three-year commitments cut database compute 30–55%. Not assumed; available once load is proven.</p></div>
  </div>
</section>

<section>
  <h2>Method</h2>
  <p>Every figure is produced by <code>docs/business/infra-forecast.mjs</code>, committed alongside this document. The assumptions above are arguable, and an argument about them should be settled by changing an input and re-running rather than by debating a spreadsheet nobody can see.</p>
  <p>Prices last verified against Azure list rates on 2 August 2026. Re-run before quoting externally.</p>
</section>

<p class="foot">PeakLogic · Infrastructure &amp; Compute Forecast · Artifact #39 v1.0 · Prepared 2 August 2026. Figures are modelled projections against published list pricing, not metered bills; no environment has been deployed. Confidential.</p>
</main>`;

writeFileSync(join(out, 'peaklogic-infrastructure-forecast.html'), docShell('PeakLogic — Infrastructure & Compute Forecast', body));
console.log('infrastructure forecast built');
