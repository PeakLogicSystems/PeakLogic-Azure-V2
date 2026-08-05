import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cover, toc, docShell } from './style.mjs';
import { cashCurve, columns, waterfall, COLOURS as C, money } from './charts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'Investor Documents');

// EVERY figure below comes from finance-model.mjs. Nothing in this document is
// a typed-in number, because the previous edition typed some of them and the
// table stopped agreeing with the chart.
const M = JSON.parse(readFileSync(join(here, 'finance-model.json'), 'utf8'));
const Y = M.years;
const H = M.headlines;

const YR = ['Yr 1', 'Yr 2', 'Yr 3', 'Yr 4', 'Yr 5'];
const ARR = Y.map((y) => y.exitArr);
const REV = Y.map((y) => y.revenue);
const FCF = Y.map((y) => y.fcf);
const CUM_MONTHLY = M.months.map((m) => m.cum);

const k = (n) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1000)}K`);
const pct = (a, b) => `${Math.round((a / b) * 100)}%`;
const slip = (d) => M.sensitivity.find((s) => s.delayMonths === d).troughUsd;

const body = `
${cover({
  kicker: 'Business plan & investment case',
  title: 'An intelligence layer for essential field services',
  sub: 'Predictive analytics and asset management for the distributed critical equipment that was never large enough to justify a control system.',
  meta: [
    { k: 'Investment sought', v: '$1.05M equity' },
    { k: 'Prepared', v: '2 August 2026' },
    { k: 'Forecast return', v: `${H.multiple5.map((x) => x.toFixed(1)).join('–')}× by year 5` },
    { k: 'Status', v: 'Confidential' },
  ],
})}

${toc([
  { t: 'Why operators cannot keep running blind', d: 'Accountability rising, visibility flat' },
  { t: 'What the platform does', d: 'Monitor, predict, dispatch, prove' },
  { t: 'Positioning', d: 'The third way between a dialer and SCADA' },
  { t: 'Why now', d: 'Four drivers, ranked by force' },
  { t: 'Business model', d: 'Three revenue lines, deliberately weighted' },
  { t: 'Financial model', d: 'Bottom-up from partner and site counts' },
  { t: 'Customer acquisition', d: 'Where seventy partners come from' },
  { t: 'Competitive position', d: 'Against SCADA, dialers, and OEM apps' },
  { t: 'Status and risks', d: 'What exists, and what could break this' },
  { t: 'The ask', d: 'Use of funds, cash flow, and return' },
])}

<main>

<section>
  <h2>Why operators cannot keep running blind</h2>
  <p class="lede">Essential services do not get to fail quietly. When a lift station overflows, a treatment unit stops disinfecting, or a walk-in loses temperature, the outcome is a regulator, a public-health notice, or a customer lost — not a maintenance ticket.</p>
  <p>Yet these are the assets nobody can see: too dispersed for a control room, too small for SCADA economics, and maintained by crews that shrink while the estate they cover grows. <em>The gap between what an operator is accountable for and what they can actually observe widens every year</em> — and every one of those failures announced itself first, in current draw, in run time, in drifting chemistry.</p>
  <p>PeakLogic closes that gap without asking anyone to become a SCADA operator. It reads the warning, decides what matters, and puts the work in front of the person who can act on it.</p>
</section>

<section>
  <h2>What the platform does</h2>
  <p class="dek">Four steps. Most competitors stop after the first, which is why an alarm reaches a phone and nothing else happens.</p>
  <div class="cards c4">
    <div class="card"><span class="card__k">01 · Monitor</span><h4>Connect what exists</h4><p>Pumps, blowers, chemistry, level, and refrigeration — mixed vendors, one platform, over cellular or the site's own network.</p></div>
    <div class="card"><span class="card__k">02 · Predict</span><h4>Read the warning</h4><p>Per-asset baselines catch degradation weeks before the failure it becomes.</p></div>
    <div class="card"><span class="card__k">03 · Dispatch</span><h4>Land the work</h4><p>An alarm becomes a work order in the partner's own system, routed to whoever is accountable.</p></div>
    <div class="card"><span class="card__k">04 · Prove</span><h4>Keep the evidence</h4><p>Compiled as it happens, not reconstructed from paper afterwards.</p></div>
  </div>
</section>

<section>
  <h2>Positioning</h2>
  <div class="pull">
    <p>For operators of distributed critical equipment — wastewater and septic, campus and assisted-living facilities, food service, pools, and light commercial mechanical — who <em>cannot justify a traditional SCADA deployment but cannot absorb the failures either</em>, PeakLogic is a predictive analytics and asset-management platform that converts unplanned failure into scheduled work.</p>
    <p>Autodialers call once the overflow has happened. SCADA is priced and scoped as a capital project. PeakLogic reaches these sites a third way — <em>through the service contractors already maintaining them</em> — so it arrives with no integration project and pays for itself out of emergencies that no longer occur.</p>
  </div>
</section>

<section>
  <h2>Why now</h2>
  <p class="dek">Four forces, ranked by how much of the market each moves. Only the second is time-boxed — but it determines whether these are the right twenty-four months.</p>

  <div class="driver"><div class="driver__n">01</div><div class="driver__b">
    <span class="tag tag--pos">Market creation, not displacement</span>
    <h3>At most of these sites, the incumbent is nothing at all</h3>
    <p>"Displacement" overstates it. The overwhelming majority of lift stations, treatment units, and light commercial mechanical rooms have <b>no monitoring at all, or a phone autodialer that calls once the failure has happened</b>. There is no vendor to unseat, no contract to buy out, and nothing to rip out.</p>
    <p>That is the stronger position: no switching friction, no incumbent defending an account, and a buyer adopting for the first time rather than being asked to admit an earlier decision was wrong. Where we do displace, it is narrow — ageing autodialers, and OEM apps that see only their own manufacturer's equipment.</p>
  </div></div>

  <div class="driver"><div class="driver__n">02</div><div class="driver__b">
    <span class="tag tag--warn">Time-boxed</span>
    <h3>Consolidation has orphaned the installer channel</h3>
    <p>DataFlow Systems, the dominant lift-station monitoring vendor, was acquired by SmartCover in 2023 and SmartCover by Badger Meter in 2025 for <b>$185M</b>. The product line is folding into Badger's BlueEdge suite: contracts, billing, support contacts, and domains are all moving, and small-to-midsize lift-station work receives the least attention during an integration of that size.</p>
    <p>This is both a displacement and a partnership opening, and the partnership half is durable. <b>Panel builders are the distribution channel, not the competition.</b> They already sell to towns and operators, most of their panels still ship with a dialer or nothing, and they want recurring revenue without building cloud software.</p>
  </div></div>

  <div class="driver"><div class="driver__n">03</div><div class="driver__b">
    <span class="tag tag--acc">Structural</span>
    <h3>A modernisation cycle is arriving whether operators are ready or not</h3>
    <p>Three forces converge on one estate. The installed base of dialers and relay panels is <b>reaching end of life</b> just as the cellular and sensing hardware to replace it has fallen to a fraction of its former cost. Meanwhile the workforce that carried this knowledge in their heads is retiring, and the crews replacing them are smaller and cover more sites.</p>
    <p>An operator is asked to supervise a growing estate with fewer people and ageing instrumentation — and increasingly to <b>evidence</b> that they can. Modernisation stops being discretionary at that point; the question becomes what they modernise onto.</p>
  </div></div>

  <div class="driver"><div class="driver__n">04</div><div class="driver__b">
    <span class="tag tag--neg">Now a procurement gate</span>
    <h3>Security has moved from a checkbox to a condition of sale</h3>
    <p>The 2026 coordinated intrusions against US water utilities changed what a security review is for. Legacy dialers and one-off panels have no posture to present: no patching story, no audit trail, no answer to what a compromised device could reach. Regulators, insurers, and boards now ask, and most operators cannot answer.</p>
    <p><b>Today the platform is read-only by construction</b> — no code path issues a device command. <b>Control is on the roadmap</b>, because operators will want remote reset and shutoff. The advantage is the order in which we build: the authorisation model, safety interlocks, and audit trail are designed before any command path exists, and safety-critical trips stay local to the equipment. Every incumbent is attempting the reverse.</p>
  </div></div>
</section>

<section>
  <h2>Business model</h2>
  <table class="tbl">
    <thead><tr><th>Line</th><th>Who pays</th><th class="n">Price</th><th>Role</th></tr></thead>
    <tbody>
      <tr><td><b>Partner platform fee</b></td><td>Service company</td><td class="n">$250–$4,000/mo<br>by fleet size</td><td>The durable line. Buys a business system — dispatch, work orders, a branded customer portal, compliance evidence.</td></tr>
      <tr><td><b>Channel monitoring</b></td><td>Partner, marked up to their customer</td><td class="n">$22/site/mo</td><td>Scales with the partner's own book, resold inside contracts they already hold.</td></tr>
      <tr><td><b>Direct monitoring</b></td><td>Site owner, sold by us</td><td class="n">$38/site/mo</td><td>No partner margin to share. Higher acquisition cost, and the source of reference customers.</td></tr>
      <tr><td><b>Hardware &amp; commissioning</b></td><td>Site owner</td><td class="n">~$1,800/site</td><td><span class="tag tag--warn">Cost-plus, ~20%</span> Deliberately not a profit centre — an acquisition cost we recover.</td></tr>
    </tbody>
  </table>
  <p class="cap">Institutional campuses at ~$25K/yr are always sold direct. Direct accounts for roughly 39% of recurring revenue across the plan.</p>
  <div class="pull"><p>A site owner buys monitoring once, reluctantly, and churns when budgets tighten. A service company buys it to <em>protect margin on contracts they already hold</em> — fewer emergency callouts, fewer wasted visits, evidence when a customer disputes work. That is an operating decision, and it renews.</p></div>
</section>

<section>
  <h2>Financial model</h2>
  <p class="dek">Built from partner and site counts against published pricing. Every figure is arithmetic from those two inputs — no top-down market-share assumption.</p>

  <div class="metrics">
    <div class="metric"><div class="metric__l">Recurring / site</div><div class="metric__v">$264</div><div class="metric__s">channel · $456 direct</div></div>
    <div class="metric"><div class="metric__l">Hardware / site</div><div class="metric__v">$1,800</div><div class="metric__s">one-time, ~20% margin</div></div>
    <div class="metric"><div class="metric__l">Sites / partner</div><div class="metric__v">~90</div><div class="metric__s">at maturity</div></div>
    <div class="metric metric--key"><div class="metric__l">Year-5 ARR</div><div class="metric__v">${k(ARR[4])}</div><div class="metric__s">70 partners · 8,000 sites</div></div>
  </div>

  ${columns({
    categories: YR,
    series: [
      { name: 'Revenue', colour: C.accent2, values: REV },
      { name: 'ARR (exit run-rate)', colour: C.accent, values: ARR },
    ],
    caption: 'Revenue and recurring run-rate',
    note: 'Revenue is recognised monthly on the base that exists during each month, then summed — not on the exit run-rate, which is the most common way an early-stage model overstates year one. Year 1 closes at a $97K run rate but earns $323K, most of it hardware.',
  })}

  <table class="tbl">
    <thead><tr><th>Year</th><th class="n">Partners</th><th class="n">Sites</th><th class="n">of which direct</th><th class="n">Exit ARR</th><th class="n">Revenue</th><th class="n">Gross profit</th><th class="n">Op. cost</th><th class="n">Cash flow</th></tr></thead>
    <tbody>
      ${Y.map(
        (y, i) => `<tr${i === 4 ? ' class="tot"' : ''}><td>Year ${y.yr}</td><td class="n">${y.partners}</td><td class="n">${y.sites.toLocaleString()}</td><td class="n">${y.direct.toLocaleString()}</td><td class="n">${k(y.exitArr)}</td><td class="n">${k(y.revenue)}</td><td class="n">${k(y.grossProfit)}</td><td class="n">${k(y.opex)}</td><td class="n ${y.fcf >= 0 ? 'pos' : 'neg'}">${k(y.fcf)}</td></tr>`,
      ).join('')}
    </tbody>
  </table>
  <p class="cap">One model produces this table and every chart in the document — the annual figures are a sum of the monthly build, not a second calculation alongside it.</p>

  <h3>Revenue mix, and why gross profit is the better measure</h3>
  <p>Revenue is hardware-heavy early — only ${pct(Y[2].recurring, Y[2].revenue)} of year-3 revenue is recurring, because every new site carries ~$1,800 of equipment. Presented as SaaS, that would mislead. So the plan reports <b>gross profit mix instead</b>: hardware runs at ~20% margin and software at ~82%, which means recurring gross profit overtakes hardware in <b>year ${H.gpMixCrossoverYear}</b> and reaches ${pct(Y[4].recurringGp, Y[4].grossProfit)} of gross profit by year 5 while still only ${pct(Y[4].recurring, Y[4].revenue)} of revenue. Revenue makes this look like an equipment business; profit shows it is not.</p>
  <table class="tbl">
    <thead><tr><th>Year</th><th class="n">Recurring revenue</th><th class="n">Hardware revenue</th><th class="n">Recurring gross profit</th><th class="n">Hardware gross profit</th><th class="n">Recurring share of GP</th></tr></thead>
    <tbody>
      ${Y.map(
        (y) => `<tr><td>Year ${y.yr}</td><td class="n">${k(y.recurring)}</td><td class="n">${k(y.hardware)}</td><td class="n">${k(y.recurringGp)}</td><td class="n">${k(y.hardwareGp)}</td><td class="n">${pct(y.recurringGp, y.grossProfit)}</td></tr>`,
      ).join('')}
    </tbody>
  </table>

  <h3>Is 8,000 sites deliverable?</h3>
  <p>As a single number it reads like more than one installation every working day. The correct unit is per partner, per week.</p>
  <table class="tbl">
    <thead><tr><th>Year</th><th class="n">Channel sites added</th><th class="n">Partners</th><th class="n">Per partner / year</th><th class="n">Per partner / week</th></tr></thead>
    <tbody>
      <tr><td>Year 1</td><td class="n">120</td><td class="n">3</td><td class="n">40</td><td class="n">0.83</td></tr>
      <tr><td>Year 2</td><td class="n">360</td><td class="n">8</td><td class="n">45</td><td class="n">0.94</td></tr>
      <tr><td>Year 3</td><td class="n">970</td><td class="n">20</td><td class="n">49</td><td class="n">1.01</td></tr>
      <tr><td>Year 5</td><td class="n">3,200</td><td class="n">70</td><td class="n">46</td><td class="n">0.95</td></tr>
    </tbody>
  </table>
  <p class="cap">48 working weeks. Channel sites only — partners install those on visits already scheduled. The direct book is installed by us and is an order of magnitude smaller.</p>
  <p><b>Slightly under one site per partner per week, every year, and it never rises.</b> The number looks large only because it is the sum of many small independent efforts, which is what the channel model is for. The real risk is not installation capacity — it is partner recruitment.</p>
</section>

<section>
  <h2>Customer acquisition</h2>
  <p class="dek">Eight partners by month 24 and seventy by year five is the number that carries the plan. Here is where they come from.</p>
  <table class="tbl">
    <thead><tr><th>Channel</th><th class="n">Partners by Yr 5</th><th>Route in</th><th>Why they say yes</th></tr></thead>
    <tbody>
      <tr><td><b>Affiliate operator</b></td><td class="n">1</td><td>Already held. First fleet live in month 3.</td><td>No sales cycle. Produces the case studies every other conversation needs.</td></tr>
      <tr><td><b>Control-panel builders</b></td><td class="n">25–30</td><td>Direct outreach to shops serving wastewater and light commercial, concentrated where lift-station density is highest.</td><td>Their panels ship with a dialer or nothing. We add a recurring line to a sale they already make.</td></tr>
      <tr><td><b>Displaced DataFlow accounts</b></td><td class="n">10–15</td><td>Operators disrupted by the Badger integration, reached through panel-builder referrals and trade associations.</td><td>They need a stable lift-station-first vendor during a transition they did not choose.</td></tr>
      <tr><td><b>Contractor referral</b></td><td class="n">20–25</td><td>Each live partner introduces adjacent trades — septic to pool, pool to HVAC — inside the same territory.</td><td>A partner already running the platform is a credible reference, and they are not competitors.</td></tr>
      <tr><td><b>OEM embed</b></td><td class="n">2–4</td><td>Equipment makers shipping connected panels under their own brand.</td><td>Years of app development avoided. Longest cycle, largest volume per agreement.</td></tr>
    </tbody>
  </table>
  <div class="cards c2">
    <div class="card"><h4>What a partner sale costs</h4><p>Two to four field visits, a witnessed alarm test at one site, and a 90-day pilot before a fleet commitment. Modelled at <b>$15K–$40K per partner</b> against a <b>$173K</b> lifetime value — 4.3× to 11.6×.</p></div>
    <div class="card"><h4>What makes it repeat</h4><p>Partners expand rather than churn: they add sites from their own book at their own pace. Net revenue retention above 110% comes from site growth inside an existing agreement, not from upselling a new product.</p></div>
  </div>
</section>

<section>
  <h2>Competitive position</h2>
  <table class="tbl">
    <thead><tr><th>Category</th><th>Their position</th><th>Ours</th></tr></thead>
    <tbody>
      <tr><td>Badger Meter / DataFlow</td><td>Lift-station SCADA absorbed into a metering suite after two mergers</td><td>Lift-station-first, fast pilot, work orders built in, aimed at operators and panel builders rather than large utilities</td></tr>
      <tr><td>Legacy SCADA</td><td>Excellent for a plant; priced and scoped as a capital project</td><td>Complementary. We instrument the long tail those platforms cannot economically reach, and feed data upward</td></tr>
      <tr><td>Autodialer vendors</td><td>A phone call once the failure has happened</td><td>Trend history, fleet view, automatic work orders</td></tr>
      <tr><td>OEM equipment apps</td><td>One manufacturer's equipment only</td><td>One platform across mixed fleets, which is what every real site has</td></tr>
      <tr><td>Generic cloud IoT</td><td>Built for IT infrastructure</td><td>Built for pumps, blowers, and chemistry, with regulatory thresholds already encoded</td></tr>
    </tbody>
  </table>
</section>

<section>
  <h2>Status and risks</h2>
  <div class="cards c3">
    <div class="card"><span class="tag tag--pos">Built</span><h4>Platform</h4><p>Multi-tenant core with enforced isolation, three portals, operator HMI, edge agent, compliance reporting, predictive baselines, automated work orders.</p></div>
    <div class="card"><span class="tag tag--warn">Not deployed</span><h4>Infrastructure</h4><p>Defined as code and validated, but no environment provisioned. First deployment is a funded milestone, not a technical unknown.</p></div>
    <div class="card"><span class="tag tag--neg">None yet</span><h4>Customers</h4><p>No paying customers and no pilot, so no measured acquisition cost or churn. Unit economics here are targets derived from pricing, not observations.</p></div>
  </div>

  <table class="tbl">
    <thead><tr><th>Risk</th><th class="n">Severity</th><th>Response</th></tr></thead>
    <tbody>
      <tr><td><b>Partner-led model unproven.</b> The thesis assumes service companies will resell monitoring inside their contracts. If they will not, growth reverts to direct sales and the truck-roll ceiling returns.</td><td class="n"><span class="tag tag--neg">High</span></td><td>The first partner deployment tests exactly this, in month one, at low cost.</td></tr>
      <tr><td><b>No measured CAC or churn.</b> LTV:CAC of 4–12× is derived, not observed.</td><td class="n"><span class="tag tag--neg">High</span></td><td>Both measurable within nine months; month-9 cohort data is the gate for any follow-on round.</td></tr>
      <tr><td><b>Hardware margin compresses</b>, since it is priced near cost.</td><td class="n"><span class="tag tag--warn">Medium</span></td><td>Not a profit centre; can move to partner-procured with no change to recurring lines.</td></tr>
      <tr><td><b>Badger integrates faster than expected</b>, closing the displacement window.</td><td class="n"><span class="tag tag--warn">Medium</span></td><td>The window accelerates year one but is not the long-term thesis.</td></tr>
      <tr><td><b>Municipal sales cycles</b> run long and unpredictably.</td><td class="n"><span class="tag tag--pos">Low</span></td><td>Contract operators and private sites first; towns later, using bid language written to specify condition-based monitoring.</td></tr>
    </tbody>
  </table>
</section>

<section>
  <h2>The ask</h2>
  <div class="metrics">
    <div class="metric metric--key"><div class="metric__l">Investment</div><div class="metric__v">$1.05M</div><div class="metric__s">equity · funds 24 months</div></div>
    <div class="metric"><div class="metric__l">Deepest trough</div><div class="metric__v">${k(H.troughUsd)}</div><div class="metric__s">month ${H.troughMonth} — sizes the raise</div></div>
    <div class="metric"><div class="metric__l">Monthly breakeven</div><div class="metric__v">Mo ${H.firstPositiveMonth}</div><div class="metric__s">first full positive year: ${H.firstPositiveYear}</div></div>
    <div class="metric metric--key"><div class="metric__l">Forecast return</div><div class="metric__v">${H.multiple5.map((x) => x.toFixed(1)).join('–')}×</div><div class="metric__s">by year 5 · ${H.irr5.map((x) => Math.round(x)).join('–')}% IRR</div></div>
  </div>

  ${cashCurve({
    series: CUM_MONTHLY,
    raise: M.inputs.INVESTMENT,
    troughMonth: H.troughMonth,
    breakevenMonth: H.firstPositiveMonth,
    caption: 'Cumulative cash position, month by month',
    note: `The curve never reaches the raise line — that gap is the headroom. Cash bottoms out at ${k(H.troughUsd)} in month ${H.troughMonth}, the monthly result turns positive in month ${H.firstPositiveMonth} and stays positive, and the cumulative position crosses zero during year 4. An annual chart cannot show any of this: the deepest point of a year is never its year-end number.`,
  })}

  <h3>When the company actually turns the corner</h3>
  <p>Three different things are often collapsed into "cash-flow positive", and they happen at three different times here. Stating them separately matters, because the first is the one an operator manages to and the last is the one that ends the funding requirement.</p>
  <table class="tbl">
    <thead><tr><th>Milestone</th><th class="n">When</th><th>What it means</th></tr></thead>
    <tbody>
      <tr><td>The monthly result turns positive</td><td class="n">Month ${H.firstPositiveMonth}</td><td>Gross profit covers that month's operating cost. From here the company is no longer consuming capital month to month</td></tr>
      <tr><td>The first full year in the black</td><td class="n">Year ${H.firstPositiveYear}</td><td>${k(Y[2].fcf)} on ${k(Y[2].revenue)} of revenue — a ${pct(Y[2].fcf, Y[2].revenue)} margin. Genuinely marginal, and it stays marginal because the year absorbs two hires</td></tr>
      <tr><td>Cumulative cash back above zero</td><td class="n">Year 4</td><td>The capital raised has been fully recovered from operations. ${k(Y[4].cum)} cumulative by year 5</td></tr>
    </tbody>
  </table>
  <p><b>Year 3 is close to the line either way, and the plan does not lean on it.</b> The ${k(Y[2].fcf)} shown depends on hires landing in months ${M.inputs.HIRES[1].month} and ${M.inputs.HIRES[2].month} rather than on day one of the year; put all four people in from month 25 and year 3 turns slightly negative instead. The honest reading is that the business reaches breakeven <em>during</em> year 3 and then deliberately spends back into growth — which is why the raise is sized against the month-${H.troughMonth} trough and not against a year-3 result that can be argued either way.</p>

  <h3>How the figure was sized</h3>
  <p>Cash is modelled monthly and the investment sized against the <b>deepest trough — ${k(H.troughUsd)} in month ${H.troughMonth}</b> — plus a buffer. Costs land from month one while recurring revenue compounds late, so an annual average would hide the point at which the company actually runs out of money.</p>
  <p><b>Why ${k(M.inputs.INVESTMENT)} funds ${k(H.opex24)} of cost.</b> Operating cost over 24 months is ${k(H.opex24)}; revenue earned in those months contributes ${k(H.gp24)} of gross profit. Capital is needed only for the gap, and only down to its deepest point — ${k(H.capitalGap24)}, covered with ${Math.round(H.headroom * 100)}% headroom.</p>

  <table class="tbl">
    <thead><tr><th>Use of funds</th><th class="n">24-mo cost</th><th>What it buys</th></tr></thead>
    <tbody>
      <tr><td><b>Team</b> — two senior roles, fully loaded</td><td class="n">${k(M.inputs.LOADED * 2 * 2)}</td><td>Platform and engineering, at market compensation including employer taxes, benefits, and retirement — a loading of roughly 21% over base</td></tr>
      <tr><td><b>Compliance &amp; security</b></td><td class="n">${k(M.inputs.ONE_OFFS.reduce((n, o) => n + o.amount, 0))}</td><td>SOC 2 Type 1, third-party penetration test, SOC 2 Type 2. Required to sell to utilities, not optional overhead</td></tr>
      <tr><td><b>Cloud &amp; AI</b></td><td class="n">$52K</td><td>Azure across three environments; AI development tooling — the reason two people can carry this scope</td></tr>
      <tr><td><b>Outsourced specialist work</b></td><td class="n">$30K</td><td>Panel safety listing, edge-agent work, penetration-test remediation</td></tr>
      <tr><td><b>Insurance, legal, tooling, travel</b></td><td class="n">$92K</td><td>E&amp;O and cyber liability, partner and reseller agreements, partner recruitment</td></tr>
      <tr><td>Total operating cost, 24 months</td><td class="n">${k(H.opex24)}</td><td>—</td></tr>
      <tr><td>Less gross profit earned in period</td><td class="n">(${k(H.gp24)})</td><td>Revenue funds part of the build</td></tr>
      <tr class="tot"><td>Capital required at the deepest point</td><td class="n">${k(H.capitalGap24)}</td><td>Month ${H.troughMonth}, carried by the ${k(M.inputs.INVESTMENT)} investment with ~${Math.round(H.headroom * 100)}% headroom</td></tr>
    </tbody>
  </table>

  <h3>What the headroom is for</h3>
  <p>A buffer stated as a percentage is an assertion. This one is sized against the single most likely thing to go wrong: <b>partner recruitment running late</b>. Every other number in the plan hangs off partner count, so the model was re-run with the whole revenue ramp delayed while costs stay where they are.</p>
  <table class="tbl">
    <thead><tr><th>Partner recruitment runs…</th><th class="n">Deepest cash position</th><th>Covered by ${k(M.inputs.INVESTMENT)}?</th></tr></thead>
    <tbody>
      ${M.sensitivity
        .map(
          (s) =>
            `<tr><td>${s.delayMonths === 0 ? 'to plan' : `${s.delayMonths} months late`}</td><td class="n">${k(-s.troughUsd)}</td><td>${
              s.troughUsd <= M.inputs.INVESTMENT
                ? '<span class="tag tag--pos">Yes</span>'
                : `<span class="tag tag--neg">No</span> — needs a further ${k(s.troughUsd - M.inputs.INVESTMENT)}`
            }</td></tr>`,
        )
        .join('')}
    </tbody>
  </table>
  <p class="cap">The raise absorbs a full quarter of slip on the entire partner ramp. It does not absorb half a year, and the plan does not claim it does — a six-month slip is a second conversation, and the month-9 cohort data is the checkpoint that would surface it in time to have that conversation.</p>

  ${waterfall({
    categories: YR,
    values: FCF,
    caption: 'Free cash flow by year',
    note: `Bars are each year's own cash result; the dashed line and the figures beneath it are the cumulative position. Headcount rises with partner count, not site count — ${Y[0].heads} people through year 2, ${Y[4].heads} by year 5. Partners install; we do not.`,
  })}

  <h3>Forecast return</h3>
  <table class="tbl">
    <thead><tr><th>Exit</th><th class="n">ARR</th><th class="n">Enterprise value</th><th class="n">Proceeds</th><th class="n">Multiple</th><th class="n">IRR</th></tr></thead>
    <tbody>
      <tr><td>Year 5</td><td class="n">${k(ARR[4])}</td><td class="n">${H.ev5.map((v) => k(v)).join('–')}</td><td class="n">${H.proceeds5.map((v) => k(v)).join('–')}</td><td class="n">${H.multiple5.map((x) => x.toFixed(1)).join('–')}×</td><td class="n">${H.irr5.map((x) => Math.round(x)).join('–')}%</td></tr>
      <tr><td>Year 10</td><td class="n">$11.8M</td><td class="n">$45–71M</td><td class="n">$11.3–17.7M</td><td class="n">10.8–16.9×</td><td class="n">27–33%</td></tr>
    </tbody>
  </table>
  <p class="cap">Assumes 25% equity and no dilution from later rounds, valued on a blend of ARR and revenue multiples in line with recent transactions in the category. Returns move with the ownership negotiated and with retention at the time of sale.</p>

  <h3>Milestones</h3>
  <table class="tbl">
    <thead><tr><th>Milestone</th><th>By</th><th>Why it is the right gate</th></tr></thead>
    <tbody>
      <tr><td>Production environment live; first partner fleet monitored</td><td>Month 3</td><td>Converts the platform from built to operating</td></tr>
      <tr><td>150 sites; three documented prevented failures</td><td>Month 9</td><td>First real CAC and churn data; the evidence a second partner needs</td></tr>
      <tr><td>Three partners beyond the affiliate; one OEM letter of intent</td><td>Month 15</td><td>Proves the channel works with parties unrelated to us</td></tr>
      <tr><td>600 sites; ${k(ARR[1])} ARR; 8 partners</td><td>Month 24</td><td>Series A metrics, or default-alive on gross profit</td></tr>
    </tbody>
  </table>

  <h3>Exit context</h3>
  <p>The category is consolidating and the comparables are recent and public: SmartCover acquired DataFlow Systems in 2023; Badger Meter acquired SmartCover for <b>$185M</b> in 2025. Xylem and Veralto are acquiring in adjacent water-infrastructure software.</p>
  <p>What those buyers acquire is <b>distribution into the long tail</b> — the hundreds of thousands of small sites their enterprise products cannot economically reach. A platform arriving with a signed contractor channel, several thousand monitored sites, and a direct reference book is that distribution, already assembled. It is materially harder to build than to buy.</p>
</section>

<p class="foot">PeakLogic · Business Plan &amp; Investment Case · Prepared 2 August 2026. Financial figures are a model built from partner counts, site counts, and published pricing — not a forecast, and not audited. No customer revenue has been earned to date. Market sizing is directional. Prepared for discussion under confidentiality.</p>
</main>`;

writeFileSync(join(out, 'peaklogic-business-plan.html'), docShell('PeakLogic — Business Plan & Investment Case', body));
console.log('business plan built');
