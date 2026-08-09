// PeakLogic one-pager: Azure vs. DigitalOcean.
//
// Deliberately its own small stylesheet rather than importing style.mjs's
// STYLE wholesale — that sheet is tuned for the long-form documents (a
// full-bleed cover page, a table of contents, section numbering meant to
// run for pages). A one-pager needs the opposite discipline: everything
// sized to land on one printed page. What IS shared with the rest of the
// document family, on purpose, is the token values themselves (colors,
// type stack) copied from style.mjs's :root block, so this reads as a
// PeakLogic document and not a one-off.
//
// Content is the user-supplied comparison verbatim, laid out rather than
// rewritten — this is a strategic brief, not marketing copy, and the
// numbers/claims in it are the user's to own.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'Investor Documents');

const ROWS = [
  ['IoT ingestion', true, 'Azure IoT Hub (enterprise-grade)', false, 'Not available'],
  ['Device provisioning (DPS)', true, 'Automated secure onboarding', false, 'Not available'],
  ['Device Update (ADU)', true, 'Secure firmware lifecycle', false, 'Not available'],
  ['Enterprise identity (SSO/SCIM)', true, 'Entra ID', false, 'Not supported'],
  ['Private networking', true, 'VNETs, Private Endpoints', null, 'Limited'],
  ['Compliance certifications', true, 'SOC 2, HIPAA, ISO, FedRAMP', null, 'Minimal'],
  ['Global redundancy', true, '60+ regions', null, 'Limited'],
  ['Multi-tenant SaaS architecture', true, 'First-class support', null, 'DIY only'],
  ['Event-driven telemetry pipelines', true, 'Native services', false, 'Not available'],
  ['Cost', null, 'Higher, enterprise-grade', null, 'Lower, developer-friendly'],
  ['Best for', null, 'IoT platforms, enterprise SaaS, regulated industries', null, 'Small apps, MVPs, simple hosting'],
];

const REASONS = [
  {
    n: '1',
    h: 'Purpose-built for IoT at scale',
    b: 'Azure IoT Hub, DPS, and Device Update provide secure ingestion, provisioning, and lifecycle management for thousands of distributed devices. DigitalOcean has no IoT-native services.',
  },
  {
    n: '2',
    h: 'Enterprise security & compliance',
    b: 'Entra ID, private networking, RBAC, and compliance certifications (SOC 2, HIPAA, ISO, FedRAMP) support regulated wastewater and municipal environments. DigitalOcean lacks enterprise identity and compliance depth.',
  },
  {
    n: '3',
    h: 'Multi-tenant architecture for operators & municipalities',
    b: 'Azure PostgreSQL with Row-Level Security enables strict tenant isolation across operators, service providers, and municipalities. DigitalOcean requires custom engineering to approximate this.',
  },
  {
    n: '4',
    h: 'SCADA-adjacent reliability',
    b: 'Azure provides global redundancy, SLAs, and event-driven pipelines required for critical operations. DigitalOcean is not designed for mission-critical industrial workloads.',
  },
  {
    n: '5',
    h: 'Seamless integration with PeakLogic’s architecture',
    b: 'PeakLogic’s cloud-native design (IoT Hub → Functions → PostgreSQL → PeakView360) aligns directly with Azure’s strengths. DigitalOcean cannot support the ingestion, security, or compliance requirements of the platform.',
  },
  {
    n: '6',
    h: 'Long-term scalability',
    b: 'Azure supports thousands of sites, millions of messages, and enterprise integrations. DigitalOcean is optimized for small apps and early-stage projects.',
  },
];

const check = (label) =>
  `<span class="mk mk--pos"><svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8.5 L6 12.5 L14 3.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span> ${label}`;
const cross = (label) =>
  `<span class="mk mk--neg"><svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3 L13 13 M13 3 L3 13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></span> ${label}`;
const plain = (label) => `<span class="mk mk--flat">—</span> ${label}`;

const cell = (ok, label) => (ok === true ? check(label) : ok === false ? cross(label) : plain(label));

const tableRows = ROWS.map(
  ([cap, azOk, azLabel, doOk, doLabel]) =>
    `<tr><td class="cap-col">${cap}</td><td>${cell(azOk, azLabel)}</td><td>${cell(doOk, doLabel)}</td></tr>`,
).join('');

const reasonCards = REASONS.map(
  (r) => `<div class="reason">
    <div class="reason__n">${r.n}</div>
    <div class="reason__b"><h4>${r.h}</h4><p>${r.b}</p></div>
  </div>`,
).join('');

const STYLE = `
:root {
  --ink:        #14161d;
  --ink-2:      #3d4356;
  --ink-3:      #6b7285;
  --rule:       #d6dae4;
  --rule-2:     #eef0f5;
  --paper:      #ffffff;
  --tint:       #f6f7fa;
  --accent:     #4c2a9c;
  --accent-2:   #7c5ad4;
  --accent-pale:#efe9fb;
  --pos:        #15683f;
  --pos-pale:   #e3f4ea;
  --neg:        #a52020;
  --neg-pale:   #fae5e5;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --sans: "Inter", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: "SF Mono", "Cascadia Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--paper); color: var(--ink); font-family: var(--sans);
  font-size: 9.3pt; line-height: 1.28; -webkit-font-smoothing: antialiased;
}
.page { width: 186mm; margin: 0 auto; padding: 5mm 0; }

header.top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 9px; }
.mark { display: flex; align-items: center; gap: 8px; }
.mark__word { font-family: var(--sans); font-weight: 800; font-size: 14pt; letter-spacing: -.02em; }
.mark__word span { color: var(--accent-2); }
.top__right { text-align: right; }
.kicker { font-family: var(--mono); font-size: 7.4pt; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); }
.kicker + .kicker { margin-top: 3px; color: var(--ink-3); letter-spacing: .1em; }

h1 { font-family: var(--serif); font-weight: 400; font-size: 23pt; letter-spacing: -.015em;
  margin: 4px 0 2px; line-height: 1.05; }
h1 span { color: var(--accent); }
.sub { font-size: 10.8pt; color: var(--ink-2); margin: 0 0 7px; max-width: 90ch; }
.rule { height: 2.4px; background: var(--accent); width: 52px; margin: 0 0 8px; }
.lede { font-size: 9.3pt; color: var(--ink-2); max-width: none; margin: 0 0 7px; }
.lede b { color: var(--ink); font-weight: 650; }

h2.sec { font-family: var(--serif); font-weight: 400; font-size: 13pt; letter-spacing: -.01em;
  margin: 0 0 5px; padding-top: 6px; border-top: 1.5px solid var(--ink); }

table.cmp { width: 100%; border-collapse: collapse; margin: 0 0 8px; font-size: 8.4pt; }
table.cmp th { text-align: left; font-size: 7.1pt; text-transform: uppercase; letter-spacing: .08em;
  color: var(--ink-3); font-weight: 700; padding: 5px 9px; border-bottom: 1.5px solid var(--ink); }
table.cmp th:not(:first-child) { text-align: left; }
table.cmp td { padding: 4.5px 9px; border-bottom: 1px solid var(--rule-2); vertical-align: top; white-space: nowrap; }
table.cmp td.cap-col { font-weight: 650; color: var(--ink); white-space: normal; width: 27%; }
table.cmp tbody tr:last-child td { border-bottom: 1px solid var(--rule); }
table.cmp tbody tr:nth-last-child(-n+2) td { font-style: italic; color: var(--ink-2); white-space: normal; }
.mk { display: inline-grid; place-items: center; width: 14px; height: 14px; border-radius: 50%;
  vertical-align: -2.5px; margin-right: 2px; }
.mk--pos { background: var(--pos-pale); color: var(--pos); }
.mk--neg { background: var(--neg-pale); color: var(--neg); }
.mk--flat { background: var(--tint); color: var(--ink-3); font-size: 8.4pt; line-height: 1; }

.reasons { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 18px; margin: 0 0 9px; }
.reason { display: flex; flex-direction: column; gap: 3px; padding: 4px 0 0; border-top: 1.5px solid var(--rule); break-inside: avoid; }
.reason:nth-child(-n+3) { border-top: none; padding-top: 0; }
.reason__n { font-family: var(--serif); font-size: 15pt; line-height: 1; color: var(--accent); opacity: .35; }
.reason h4 { font-size: 8.9pt; margin: 0 0 1px; font-weight: 700; letter-spacing: -.004em; }
.reason p { font-size: 7.9pt; color: var(--ink-2); margin: 0; line-height: 1.34; }

.summary { border: 1.5px solid var(--accent); background: var(--accent-pale); border-radius: 6px;
  padding: 9px 15px; margin: 2px 0 8px; }
.summary__k { font-family: var(--mono); font-size: 7.4pt; letter-spacing: .13em; text-transform: uppercase;
  color: var(--accent); font-weight: 700; margin-bottom: 5px; }
.summary p { font-family: var(--serif); font-size: 10.2pt; line-height: 1.36; color: var(--ink); margin: 0 0 4px; max-width: none; }
.summary p:last-child { margin-bottom: 0; }
.summary b { color: var(--accent); font-weight: 700; }

.foot { margin-top: 6px; padding-top: 5px; border-top: 1px solid var(--rule); display: flex;
  justify-content: space-between; gap: 16px; font-size: 7.4pt; color: var(--ink-3); }

@page { size: A4; margin: 12mm 12mm 12mm; }
@media print { .page { width: auto; padding: 0; } }
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>PeakLogic — Azure vs. DigitalOcean</title><style>${STYLE}</style></head>
<body><div class="page">

<header class="top">
  <div class="mark">
    <svg width="22" height="17" viewBox="4 10 24 18" aria-hidden="true">
      <path d="M4 28 L12 10 L18 20 L23 12 L28 28 Z" fill="#4c2a9c"/>
      <path d="M18 20 L23 12 L28 28 Z" fill="#22a05c" opacity=".85"/>
    </svg>
    <span class="mark__word">Peak<span>Logic</span></span>
  </div>
  <div class="top__right">
    <div class="kicker">Strategic Brief · Cloud Platform</div>
    <div class="kicker">Internal — Confidential</div>
  </div>
</header>

<h1>Azure vs. <span>DigitalOcean</span></h1>
<p class="sub">Choosing the Right Cloud Foundation for Essential Field Services</p>
<div class="rule"></div>
<p class="lede">PeakLogic delivers intelligence, control, compliance automation, and operator-assistive workflows across
distributed wastewater, environmental, and facility systems. The cloud foundation behind PeakLogic must support secure
IoT ingestion, multi-tenant isolation, regulatory compliance, and SCADA-adjacent reliability. This brief summarizes why
<b>Microsoft Azure</b> is the correct strategic platform compared to <b>DigitalOcean</b>.</p>

<h2 class="sec">Side-by-side comparison</h2>
<table class="cmp">
  <thead><tr><th>Capability</th><th>Azure</th><th>DigitalOcean</th></tr></thead>
  <tbody>${tableRows}</tbody>
</table>

<h2 class="sec">Why Azure is the right direction for PeakLogic</h2>
<div class="reasons">${reasonCards}</div>

<div class="summary">
  <div class="summary__k">Executive summary</div>
  <p><b>Azure</b> is a full-scale enterprise cloud platform built for IoT, security, compliance, and global scale. <b>DigitalOcean</b> is a developer-friendly cloud built for simple applications.</p>
  <p>For a platform delivering intelligence, control, compliance, and risk reduction across essential field services, Azure provides the reliability, security, and operational depth PeakLogic requires.</p>
</div>

<div class="foot">
  <span>PeakLogic &middot; Cloud Platform Comparison &middot; ${new Date().toISOString().slice(0, 10)}</span>
  <span>INTERNAL — CONFIDENTIAL</span>
</div>

</div></body></html>`;

writeFileSync(join(out, 'peaklogic-azure-vs-digitalocean.html'), html);
console.log('one-pager built');
