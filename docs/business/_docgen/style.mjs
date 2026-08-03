// Shared print design system for the PeakLogic business document family.
//
// One stylesheet across the business plan, product description, and
// infrastructure forecast, so the three read as a set rather than three
// separately-styled one-offs. Every document is self-contained — inline CSS,
// inline SVG, no external requests — because these are printed to PDF and
// distributed as files.
//
// Deliberately built for PAPER first and screen second. That inverts the usual
// order and drives most of the decisions below: serif display face for the
// hierarchy, tabular figures everywhere numbers align, `break-inside: avoid` on
// anything that would read as nonsense split across a page boundary, and table
// headers that repeat when a table runs long.

export const STYLE = `
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
  --neg:        #a52020;
  --warn:       #8a5205;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --sans: "Inter", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: "SF Mono", "Cascadia Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace;
}

* { box-sizing: border-box; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font-family: var(--sans); font-size: 10.2pt; line-height: 1.52;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
.page { max-width: 190mm; margin: 0 auto; padding: 18mm 0 24mm; }

/* ── Cover ─────────────────────────────────────────────────────────── */
.cover { min-height: 232mm; display: flex; flex-direction: column; break-after: page; page-break-after: always; }
.cover__mark { display: flex; align-items: center; gap: 9px; }
.cover__word { font-family: var(--sans); font-weight: 800; font-size: 15pt; letter-spacing: -.02em; }
.cover__word span { color: var(--accent-2); }
.cover__mid { margin-top: auto; }
.cover__kicker { font-family: var(--mono); font-size: 8.5pt; letter-spacing: .22em; text-transform: uppercase; color: var(--accent); }
.cover h1 {
  font-family: var(--serif); font-weight: 400; font-size: 40pt; line-height: 1.02;
  letter-spacing: -.018em; margin: 14px 0 0; max-width: 20ch;
}
.cover__sub { font-size: 13pt; color: var(--ink-2); margin-top: 16px; max-width: 54ch; line-height: 1.45; }
.cover__rule { height: 3px; background: var(--accent); width: 68px; margin: 26px 0 0; }
.cover__meta { margin-top: auto; padding-top: 30px; border-top: 1px solid var(--rule);
  display: flex; justify-content: space-between; gap: 20px; font-size: 8.6pt; color: var(--ink-3); }
.cover__meta b { display: block; color: var(--ink); font-size: 9.4pt; font-weight: 650; margin-bottom: 2px; }

/* ── Contents ──────────────────────────────────────────────────────── */
.toc { break-after: page; page-break-after: always; }
.toc ol { list-style: none; counter-reset: toc; margin: 0; padding: 0; }
.toc li { counter-increment: toc; display: flex; align-items: baseline; gap: 10px;
  padding: 7px 0; border-bottom: 1px solid var(--rule-2); font-size: 11pt; }
.toc li::before { content: counter(toc, decimal-leading-zero); font-family: var(--mono);
  font-size: 8.5pt; color: var(--accent); flex: none; width: 22px; }
.toc li span { color: var(--ink-3); font-size: 9.4pt; margin-left: auto; text-align: right; max-width: 46%; }

/* ── Structure ─────────────────────────────────────────────────────── */
main { counter-reset: sec; }
section { counter-increment: sec; break-inside: auto; margin-bottom: 26px; }
section > h2 {
  font-family: var(--serif); font-weight: 400; font-size: 19pt; letter-spacing: -.012em;
  margin: 0 0 4px; padding-top: 12px; border-top: 2px solid var(--ink);
  break-after: avoid; page-break-after: avoid; text-wrap: balance;
}
section > h2::before { content: counter(sec) ".  "; font-family: var(--mono); font-size: 11pt; color: var(--accent); }
.dek { color: var(--ink-2); font-size: 10.4pt; max-width: 72ch; margin: 0 0 14px; }
h3 { font-size: 11pt; font-weight: 700; margin: 16px 0 5px; letter-spacing: -.004em; break-after: avoid; }
p { margin: 0 0 9px; max-width: 76ch; }
p:last-child { margin-bottom: 0; }
ul, ol.body { margin: 0 0 10px; padding-left: 17px; }
li { margin-bottom: 4px; max-width: 74ch; }
b, strong { font-weight: 650; color: var(--ink); }
em { font-style: normal; color: var(--accent); font-weight: 600; }
code { font-family: var(--mono); font-size: .87em; background: var(--tint); padding: 1px 4px; border-radius: 3px; }
a { color: inherit; text-decoration: none; }

/* ── Lede ──────────────────────────────────────────────────────────── */
.lede { font-family: var(--serif); font-size: 14pt; line-height: 1.45; color: var(--ink);
  max-width: 62ch; margin: 0 0 16px; }

/* ── Pull statement ────────────────────────────────────────────────── */
.pull { border-left: 3px solid var(--accent); padding: 4px 0 4px 20px; margin: 16px 0;
  break-inside: avoid; page-break-inside: avoid; }
.pull p { font-family: var(--serif); font-size: 13pt; line-height: 1.45; max-width: 64ch; }

/* ── Tables ────────────────────────────────────────────────────────── */
.tbl { width: 100%; border-collapse: collapse; margin: 4px 0 6px; font-size: 9.2pt; }
.tbl thead { display: table-header-group; }  /* repeat headers across pages */
.tbl th { text-align: left; font-size: 7.6pt; text-transform: uppercase; letter-spacing: .1em;
  color: var(--ink-3); font-weight: 700; padding: 8px 9px; border-bottom: 1.5px solid var(--ink); white-space: nowrap; }
.tbl td { padding: 7px 9px; border-bottom: 1px solid var(--rule-2); vertical-align: top; }
.tbl tbody tr:last-child td { border-bottom: 1px solid var(--rule); }
.tbl .n { text-align: right; font-family: var(--mono); font-size: 8.8pt;
  font-variant-numeric: tabular-nums; white-space: nowrap; }
.tbl .tot td { font-weight: 700; background: var(--tint); border-top: 1.5px solid var(--ink); }
.tbl .pos { color: var(--pos); }
.tbl .neg { color: var(--neg); }
.cap { font-size: 8.4pt; color: var(--ink-3); margin: 5px 0 0; max-width: 84ch; line-height: 1.45; }
figure { margin: 0 0 16px; break-inside: avoid; page-break-inside: avoid; }

/* ── Metric row ────────────────────────────────────────────────────── */
.metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin: 6px 0 14px;
  border: 1px solid var(--rule); border-radius: 4px; overflow: hidden; break-inside: avoid; }
.metrics.three { grid-template-columns: repeat(3, 1fr); }
.metric { padding: 12px 14px; border-right: 1px solid var(--rule); }
.metric:last-child { border-right: none; }
.metric__l { font-size: 7.4pt; text-transform: uppercase; letter-spacing: .1em; color: var(--ink-3); font-weight: 700; }
.metric__v { font-size: 19pt; font-weight: 700; letter-spacing: -.028em; margin-top: 3px;
  font-variant-numeric: tabular-nums; line-height: 1; }
.metric__s { font-size: 8.2pt; color: var(--ink-3); margin-top: 4px; line-height: 1.35; }
.metric--key { background: var(--accent-pale); }
.metric--key .metric__v { color: var(--accent); }

/* ── Cards ─────────────────────────────────────────────────────────── */
.cards { display: grid; gap: 11px; margin: 4px 0 12px; }
.cards.c2 { grid-template-columns: 1fr 1fr; }
.cards.c3 { grid-template-columns: repeat(3, 1fr); }
.cards.c4 { grid-template-columns: repeat(4, 1fr); }
.card { border: 1px solid var(--rule); border-radius: 4px; padding: 13px 15px;
  break-inside: avoid; page-break-inside: avoid; }
.card h4 { font-size: 10pt; margin: 0 0 5px; font-weight: 700; }
.card p { font-size: 9.2pt; color: var(--ink-2); margin: 0; max-width: none; }
.card__k { font-family: var(--mono); font-size: 7.6pt; letter-spacing: .12em;
  text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 5px; }

/* ── Numbered driver blocks ────────────────────────────────────────── */
.driver { display: flex; gap: 16px; padding: 15px 0; border-top: 1px solid var(--rule-2);
  break-inside: avoid; page-break-inside: avoid; }
.driver:first-of-type { border-top: none; }
.driver__n { font-family: var(--serif); font-size: 26pt; line-height: .9; color: var(--accent);
  opacity: .28; flex: none; width: 40px; }
.driver__b { min-width: 0; }
.driver h3 { margin-top: 0; font-size: 11.5pt; }
.driver p { font-size: 9.6pt; color: var(--ink-2); }

.tag { display: inline-block; font-size: 7.4pt; font-weight: 700; letter-spacing: .06em;
  text-transform: uppercase; padding: 2px 7px; border-radius: 2px; margin-bottom: 6px; }
.tag--pos { background: #e3f4ea; color: var(--pos); }
.tag--warn { background: #fbf0da; color: var(--warn); }
.tag--neg { background: #fae5e5; color: var(--neg); }
.tag--acc { background: var(--accent-pale); color: var(--accent); }

/* ── Layer stack (product architecture) ────────────────────────────── */
.stack { border: 1px solid var(--rule); border-radius: 4px; overflow: hidden;
  margin: 6px 0 6px; break-inside: avoid; page-break-inside: avoid; }
.stack__row { display: grid; grid-template-columns: 118px 1fr; align-items: start;
  gap: 0; border-bottom: 1px solid var(--rule-2); }
.stack__row:last-child { border-bottom: none; }
.stack__l { padding: 11px 13px; background: var(--tint); border-right: 1px solid var(--rule);
  font-size: 7.4pt; text-transform: uppercase; letter-spacing: .1em; color: var(--ink-3);
  font-weight: 700; align-self: stretch; }
.stack__r { padding: 10px 14px; }
.stack__n { font-size: 10.4pt; font-weight: 700; letter-spacing: -.006em; }
.stack__n em { font-style: normal; color: var(--accent); }
.stack__d { font-size: 9pt; color: var(--ink-2); margin-top: 2px; }
.stack__flow { display: flex; align-items: center; gap: 8px; padding: 7px 14px;
  background: var(--accent-pale); font-family: var(--mono); font-size: 7.8pt;
  letter-spacing: .06em; color: var(--accent); text-transform: uppercase; }

.foot { margin-top: 30px; padding-top: 12px; border-top: 1px solid var(--rule);
  font-size: 8.2pt; color: var(--ink-3); line-height: 1.5; }

@page { size: A4; margin: 15mm 12mm 14mm; }
@media print {
  .page { max-width: none; padding: 0; }
  section { break-inside: auto; }
}
`;

/** Standard cover block. */
export function cover({ kicker, title, sub, meta }) {
  const cells = meta.map((m) => `<div><b>${m.k}</b>${m.v}</div>`).join('');
  return `<header class="cover">
  <div class="cover__mark">
    <svg width="26" height="20" viewBox="4 10 24 18" aria-hidden="true">
      <path d="M4 28 L12 10 L18 20 L23 12 L28 28 Z" fill="#4c2a9c"/>
      <path d="M18 20 L23 12 L28 28 Z" fill="#22a05c" opacity=".85"/>
    </svg>
    <span class="cover__word">Peak<span>Logic</span></span>
  </div>
  <div class="cover__mid">
    <div class="cover__kicker">${kicker}</div>
    <h1>${title}</h1>
    <div class="cover__rule"></div>
    <p class="cover__sub">${sub}</p>
  </div>
  <div class="cover__meta">${cells}</div>
</header>`;
}

/** Contents list. */
export function toc(items) {
  return `<nav class="toc">
  <h2 style="font-family:var(--serif);font-weight:400;font-size:19pt;margin:0 0 12px;padding-top:12px;border-top:2px solid var(--ink)">Contents</h2>
  <ol>${items.map((i) => `<li>${i.t}<span>${i.d}</span></li>`).join('')}</ol>
</nav>`;
}

export const docShell = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>${STYLE}</style></head>
<body><div class="page">${body}</div></body></html>`;
