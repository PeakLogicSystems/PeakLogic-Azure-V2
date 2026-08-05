// The five-year financial model — ONE monthly engine.
//
// Why this file exists: the plan previously quoted two models side by side. An
// annual model produced the revenue table and the cash-flow chart, while a
// separate monthly model sized the raise. They disagreed — 24-month gross
// profit was $431K in one and $259K in the other, and the deepest cash position
// was $690K in one and $819K in the other. Both numbers appeared in the same
// document. An investor who adds up the table and gets a different answer to
// the chart stops reading, and is right to.
//
// So everything below is derived monthly from the same inputs, and the annual
// table is a rollup of the months rather than a parallel calculation. If the
// two ever disagree again it is because someone edited the rollup by hand.
//
// Run: node finance-model.mjs   → writes finance-model.json, prints a summary.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ── Inputs ───────────────────────────────────────────────────────────────────

/** Year-end targets. Everything else is derived from these and the pricing. */
const PLAN = [
  { yr: 1, partners: 3, channel: 120, direct: 30, campuses: 1, fleet: 40 },
  { yr: 2, partners: 8, channel: 480, direct: 120, campuses: 3, fleet: 60 },
  { yr: 3, partners: 20, channel: 1450, direct: 350, campuses: 8, fleet: 73 },
  { yr: 4, partners: 40, channel: 3200, direct: 800, campuses: 16, fleet: 80 },
  { yr: 5, partners: 70, channel: 6400, direct: 1600, campuses: 28, fleet: 91 },
];

const PRICING = {
  /** Partner platform fee per month, by the partner's own fleet size. */
  platform: (fleet) => (fleet <= 25 ? 250 : fleet <= 150 ? 750 : fleet <= 500 ? 2000 : 4000),
  channelPerSiteMo: 22,
  directPerSiteMo: 38,
  campusPerYear: 25_000,
  hardwarePerSite: 1800,
  hardwareMargin: 0.2,
  softwareMargin: 0.82,
};

/**
 * Fully-loaded cost of one senior role.
 *
 * Base plus employer taxes, medical, dental, retirement and statutory
 * insurance — a loading of roughly 21%. Quoting base salary alone is the most
 * common way an early-stage plan understates its own burn.
 */
const LOADED = 180_000 + 13_770 + 14_000 + 700 + 7_200 + 2_000; // 217,670

/**
 * When people actually start, by month.
 *
 * Headcount follows PARTNER count, not site count — partners install, we do
 * not. The two founding roles are there from month 1; everyone after that is
 * hired against a partner book that already exists.
 */
const HIRES = [
  { month: 1, n: 2, what: 'Head of Platform, Head of Engineering' },
  { month: 27, n: 1, what: 'Partner success' },
  { month: 33, n: 1, what: 'Field / commissioning engineer' },
  { month: 39, n: 1, what: 'Support engineer' },
  { month: 45, n: 1, what: 'Partner success (2)' },
  { month: 51, n: 1, what: 'Platform engineer' },
  { month: 55, n: 1, what: 'Support engineer (2)' },
  { month: 58, n: 1, what: 'Field engineer (2)' },
];

/** Non-payroll operating cost per year — cloud, compliance, insurance, legal, travel, tooling. */
const OTHER_OPEX = [78_000, 96_000, 150_000, 230_000, 340_000];

/** One-off compliance spend, in the month it lands. */
const ONE_OFFS = [
  { month: 8, amount: 22_000, what: 'SOC 2 Type 1 + readiness' },
  { month: 14, amount: 14_000, what: 'Third-party penetration test' },
  { month: 21, amount: 30_000, what: 'SOC 2 Type 2' },
];

const INVESTMENT = 1_050_000;

// ── Monthly build ────────────────────────────────────────────────────────────

/**
 * Sites and partners arrive through the year, not on 31 December.
 *
 * Linear within each year. It is the honest shape for a channel model — each
 * partner installs at a steady weekly rate — and it is what makes recurring
 * revenue in year 1 a fraction of the year-end run rate rather than a full
 * twelve months of it.
 */
function interpolate(month, key) {
  const yr = Math.ceil(month / 12);
  const within = month - (yr - 1) * 12; // 1..12
  const start = yr === 1 ? 0 : PLAN[yr - 2][key];
  const end = PLAN[yr - 1][key];
  return start + ((end - start) * within) / 12;
}

const months = [];
let prevSites = 0;
let cum = 0;
let trough = { month: 0, cum: 0 };

for (let m = 1; m <= 60; m++) {
  const yr = Math.ceil(m / 12);
  const partners = interpolate(m, 'partners');
  const channel = interpolate(m, 'channel');
  const direct = interpolate(m, 'direct');
  const campuses = interpolate(m, 'campuses');
  const sites = channel + direct;
  const fleet = PLAN[yr - 1].fleet;

  // Recurring is billed on the base that exists DURING the month.
  const recurring =
    partners * PRICING.platform(fleet) +
    channel * PRICING.channelPerSiteMo +
    direct * PRICING.directPerSiteMo +
    (campuses * PRICING.campusPerYear) / 12;

  const added = Math.max(0, sites - prevSites);
  const hardware = added * PRICING.hardwarePerSite;

  const revenue = recurring + hardware;
  const grossProfit = recurring * PRICING.softwareMargin + hardware * PRICING.hardwareMargin;

  const heads = HIRES.filter((h) => h.month <= m).reduce((n, h) => n + h.n, 0);
  const payroll = (heads * LOADED) / 12;
  const other = OTHER_OPEX[yr - 1] / 12;
  const oneOff = ONE_OFFS.filter((o) => o.month === m).reduce((n, o) => n + o.amount, 0);
  const opex = payroll + other + oneOff;

  const net = grossProfit - opex;
  cum += net;
  if (cum < trough.cum) trough = { month: m, cum };

  months.push({ m, yr, partners, sites, channel, direct, campuses, heads, recurring, hardware, revenue, grossProfit, opex, payroll, net, cum });
  prevSites = sites;
}

// ── Annual rollup — a SUM of the months above, never a parallel calculation ──

const years = PLAN.map((p, i) => {
  const ms = months.filter((x) => x.yr === i + 1);
  const sum = (k) => ms.reduce((n, x) => n + x[k], 0);
  const exit = ms[ms.length - 1];
  // Exit ARR is the run rate implied by the closing base, annualised.
  const exitArr =
    p.partners * PRICING.platform(p.fleet) * 12 +
    p.channel * PRICING.channelPerSiteMo * 12 +
    p.direct * PRICING.directPerSiteMo * 12 +
    p.campuses * PRICING.campusPerYear;
  return {
    yr: p.yr,
    partners: p.partners,
    sites: p.channel + p.direct,
    direct: p.direct,
    exitArr,
    revenue: sum('revenue'),
    recurring: sum('recurring'),
    hardware: sum('hardware'),
    grossProfit: sum('grossProfit'),
    recurringGp: sum('recurring') * PRICING.softwareMargin,
    hardwareGp: sum('hardware') * PRICING.hardwareMargin,
    opex: sum('opex'),
    fcf: sum('net'),
    cum: exit.cum,
    heads: exit.heads,
  };
});

// ── Derived headlines ────────────────────────────────────────────────────────

const firstPositiveMonth = months.find((x, i) => x.net > 0 && months.slice(i, i + 3).every((y) => y.net > 0));
const firstPositiveYear = years.find((y) => y.fcf > 0);
const m24 = months[23];
const opex24 = months.slice(0, 24).reduce((n, x) => n + x.opex, 0);
const gp24 = months.slice(0, 24).reduce((n, x) => n + x.grossProfit, 0);
const gpMixCrossover = years.find((y) => y.recurringGp > y.hardwareGp);

// Return, on a blend of ARR and revenue multiples.
const y5 = years[4];
const ev5 = [(y5.exitArr * 4 + y5.revenue * 1.5) / 2, (y5.exitArr * 6 + y5.revenue * 2.5) / 2];
const EQUITY = 0.25;
const irr = (mult, n) => (Math.pow(mult, 1 / n) - 1) * 100;

/**
 * What a slip costs.
 *
 * The buffer on the raise has to be justified by something, not asserted. The
 * single most likely thing to go wrong is that partner recruitment runs late —
 * every other number in the plan hangs off partner count. So the model is re-run
 * with the whole ramp delayed, and the deepest cash position under that delay is
 * what the raise actually has to survive.
 */
function troughWithDelay(delayMonths) {
  let c = 0;
  let low = 0;
  let prev = 0;
  for (let m = 1; m <= 60; m++) {
    const yr = Math.ceil(m / 12);
    const eff = m - delayMonths; // revenue-side months slide; cost does not
    const at = (key) => (eff < 1 ? 0 : interpolate(Math.min(eff, 60), key));
    const partners = at('partners');
    const channel = at('channel');
    const direct = at('direct');
    const campuses = at('campuses');
    const sites = channel + direct;
    const fleet = PLAN[Math.max(0, Math.ceil(Math.max(eff, 1) / 12) - 1)].fleet;
    const recurring =
      partners * PRICING.platform(fleet) + channel * PRICING.channelPerSiteMo + direct * PRICING.directPerSiteMo + (campuses * PRICING.campusPerYear) / 12;
    const hardware = Math.max(0, sites - prev) * PRICING.hardwarePerSite;
    const gp = recurring * PRICING.softwareMargin + hardware * PRICING.hardwareMargin;
    const heads = HIRES.filter((h) => h.month <= m).reduce((n, h) => n + h.n, 0);
    const opex = (heads * LOADED) / 12 + OTHER_OPEX[yr - 1] / 12 + ONE_OFFS.filter((o) => o.month === m).reduce((n, o) => n + o.amount, 0);
    c += gp - opex;
    if (c < low) low = c;
    prev = sites;
  }
  return Math.abs(low);
}

const sensitivity = [0, 3, 6, 9, 12].map((d) => ({ delayMonths: d, troughUsd: troughWithDelay(d) }));

const out = {
  generated: new Date().toISOString().slice(0, 10),
  sensitivity,
  inputs: { PLAN, PRICING: { ...PRICING, platform: 'fleet-banded: 250/750/2000/4000' }, LOADED, OTHER_OPEX, HIRES, ONE_OFFS, INVESTMENT },
  years,
  months,
  headlines: {
    firstPositiveMonth: firstPositiveMonth ? firstPositiveMonth.m : null,
    firstPositiveYear: firstPositiveYear ? firstPositiveYear.yr : null,
    troughMonth: trough.month,
    troughUsd: Math.abs(trough.cum),
    cash24: m24.cum,
    opex24,
    gp24,
    capitalGap24: opex24 - gp24,
    headroom: INVESTMENT / Math.abs(trough.cum) - 1,
    gpMixCrossoverYear: gpMixCrossover ? gpMixCrossover.yr : null,
    ev5,
    proceeds5: ev5.map((v) => v * EQUITY),
    multiple5: ev5.map((v) => (v * EQUITY) / INVESTMENT),
    irr5: ev5.map((v) => irr((v * EQUITY) / INVESTMENT, 5)),
  },
};

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'finance-model.json'), JSON.stringify(out, null, 2));

// ── Console summary ──────────────────────────────────────────────────────────

const f = (n) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1000)}K`);
console.log('Yr  Partners  Sites   ExitARR   Revenue   GrossProfit   Opex     Heads   FCF        Cumulative');
for (const y of years) {
  console.log(
    `${String(y.yr).padStart(2)} ${String(y.partners).padStart(8)} ${String(y.sites).padStart(6)} ${f(y.exitArr).padStart(9)} ` +
      `${f(y.revenue).padStart(9)} ${f(y.grossProfit).padStart(13)} ${f(y.opex).padStart(8)} ${String(y.heads).padStart(6)} ` +
      `${f(y.fcf).padStart(10)} ${f(y.cum).padStart(12)}`,
  );
}
console.log(`\nFirst month cash-flow positive (and staying so): month ${out.headlines.firstPositiveMonth}`);
console.log(`First FULL YEAR cash-flow positive:              year ${out.headlines.firstPositiveYear}`);
console.log(`Deepest cumulative cash position: ${f(trough.cum)} at month ${trough.month}`);
console.log(`Cash position at month 24: ${f(m24.cum)}`);
console.log(`24-month operating cost ${f(opex24)} · gross profit ${f(gp24)} · gap ${f(opex24 - gp24)}`);
console.log(`Raise ${f(INVESTMENT)} covers the trough with ${(out.headlines.headroom * 100).toFixed(0)}% headroom`);
console.log(`Recurring gross profit overtakes hardware in year ${out.headlines.gpMixCrossoverYear}`);
console.log(`Year-5 EV ${f(ev5[0])}–${f(ev5[1])} · 25% → ${out.headlines.multiple5.map((x) => x.toFixed(1) + 'x').join('–')} · IRR ${out.headlines.irr5.map((x) => x.toFixed(0) + '%').join('–')}`);
console.log('\nSENSITIVITY — partner recruitment runs late (costs unchanged)');
for (const s of sensitivity) {
  console.log(`  ${String(s.delayMonths).padStart(2)} months late → deepest cash ${f(-s.troughUsd)}  ${s.troughUsd <= INVESTMENT ? 'covered' : 'NOT COVERED'} by ${f(INVESTMENT)}`);
}
