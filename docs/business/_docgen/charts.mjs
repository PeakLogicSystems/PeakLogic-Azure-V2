// Inline SVG charts for the business document family.
//
// Hand-built rather than pulled from a library, for three reasons: the
// documents must be self-contained files with no external requests, SVG prints
// at the printer's resolution rather than the screen's, and a library's
// defaults would need overriding on nearly every axis anyway.
//
// House rules, applied to every chart here:
//   · No chartjunk. No 3D, no shadows, no gradients, no redundant legends.
//   · Label the data directly where there is room, rather than making the
//     reader trace a value back to an axis.
//   · Gridlines are hairlines behind the data, never in front of it.
//   · Baselines start at zero. A truncated axis on a growth chart is a lie.

const INK = '#14161d';
const INK3 = '#6b7285';
const RULE = '#e4e7ee';
const ACC = '#4c2a9c';
const ACC2 = '#7c5ad4';
const POS = '#15683f';
const NEG = '#a52020';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Rounding matters more than it looks: a computed cost of 119.37632947200001
// printed verbatim on a chart is the single fastest way to make a financial
// model look unfinished, and the sub-$1,000 branch is exactly where computed
// (rather than typed) values land.
const money = (n) =>
  Math.abs(n) >= 1e6
    ? `$${(n / 1e6).toFixed(Math.abs(n) % 1e6 === 0 ? 0 : 1)}M`
    : Math.abs(n) >= 1000
      ? `$${Math.round(n / 1000).toLocaleString()}K`
      : `$${Math.round(n).toLocaleString()}`;

/**
 * A "nice" axis maximum, so gridlines land on round numbers.
 *
 * The candidate ladder is deliberately fine-grained (1, 1.2, 1.5, 2, …). A
 * coarse ladder rounds a $10.1M series up to a $20M axis and leaves the tallest
 * column occupying half the plot — technically honest, visually useless.
 */
function niceMax(v) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const norm = v / mag;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => norm <= s * 1.0001) ?? 10;
  return step * mag;
}

/**
 * Grouped column chart.
 * `series`: [{ name, colour, values:[] }] against shared `categories`.
 */
export function columns({ categories, series, height = 168, format = money, caption, note }) {
  const W = 680, H = height, L = 52, R = 10, T = 22, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)));
  const groups = categories.length;
  const gw = iw / groups;
  const bw = Math.min(26, (gw - 12) / series.length);

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const y = T + ih - ih * f;
      return `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="${RULE}" stroke-width="1"/>
<text x="${L - 7}" y="${y + 3}" text-anchor="end" font-size="8" fill="${INK3}" font-family="monospace">${format(max * f)}</text>`;
    })
    .join('');

  const bars = categories
    .map((c, i) => {
      const gx = L + gw * i + (gw - bw * series.length) / 2;
      const cols = series
        .map((s, j) => {
          const v = s.values[i];
          const h = Math.max(1, (v / max) * ih);
          const x = gx + bw * j;
          const y = T + ih - h;
          const lbl =
            series.length <= 2
              ? `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="7.5" fill="${INK3}" font-family="monospace">${format(v)}</text>`
              : '';
          return `<rect x="${x}" y="${y}" width="${bw - 2}" height="${h}" fill="${s.colour}" rx="1"/>${lbl}`;
        })
        .join('');
      return `${cols}<text x="${L + gw * i + gw / 2}" y="${H - 9}" text-anchor="middle" font-size="8.5" fill="${INK}">${esc(c)}</text>`;
    })
    .join('');

  const legend =
    series.length > 1
      ? `<g transform="translate(${L},10)">${series
          .map(
            (s, i) =>
              `<rect x="${i * 118}" y="-6" width="8" height="8" fill="${s.colour}" rx="1"/><text x="${i * 118 + 12}" y="1" font-size="8" fill="${INK3}">${esc(s.name)}</text>`,
          )
          .join('')}</g>`
      : '';

  return wrap(W, H, `${grid}${legend}${bars}`, caption, note);
}

/** Line chart with an emphasised endpoint and direct value labels. */
export function line({ categories, values, height = 150, format = money, colour = ACC, caption, note, yLabel }) {
  const W = 680, H = height, L = 52, R = 42, T = 20, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(...values));
  const x = (i) => L + (iw / Math.max(1, values.length - 1)) * i;
  const y = (v) => T + ih - (v / max) * ih;

  const grid = [0, 0.5, 1]
    .map((f) => {
      const yy = T + ih - ih * f;
      return `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" stroke="${RULE}" stroke-width="1"/>
<text x="${L - 7}" y="${yy + 3}" text-anchor="end" font-size="8" fill="${INK3}" font-family="monospace">${format(max * f)}</text>`;
    })
    .join('');

  const area = `M ${x(0)} ${T + ih} ` + values.map((v, i) => `L ${x(i)} ${y(v)}`).join(' ') + ` L ${x(values.length - 1)} ${T + ih} Z`;
  const path = values.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ');
  const dots = values
    .map((v, i) => {
      const last = i === values.length - 1;
      return `<circle cx="${x(i)}" cy="${y(v)}" r="${last ? 4 : 2.6}" fill="${last ? colour : '#fff'}" stroke="${colour}" stroke-width="1.6"/>
<text x="${x(i)}" y="${y(v) - 9}" text-anchor="middle" font-size="7.8" fill="${last ? colour : INK3}" font-family="monospace" font-weight="${last ? 700 : 400}">${format(v)}</text>`;
    })
    .join('');
  const cats = categories.map((c, i) => `<text x="${x(i)}" y="${H - 9}" text-anchor="middle" font-size="8.5" fill="${INK}">${esc(c)}</text>`).join('');
  const yl = yLabel ? `<text x="${L - 7}" y="${T - 8}" text-anchor="end" font-size="7.4" fill="${INK3}" font-family="monospace">${esc(yLabel)}</text>` : '';

  return wrap(W, H, `${grid}${yl}<path d="${area}" fill="${colour}" opacity=".07"/><path d="${path}" fill="none" stroke="${colour}" stroke-width="2"/>${dots}${cats}`, caption, note);
}

/**
 * Waterfall for cash flow — negative years read as drawdown, positive as build.
 *
 * Value labels sit OUTSIDE the bar on the side it grew: above a rising bar,
 * below a falling one. Placing both above put the label of every negative year
 * on top of its own bar, which is how the cash-flow figure ended up unreadable.
 */
export function waterfall({ categories, values, height = 190, format = money, caption, note }) {
  const W = 680, H = height, L = 56, R = 10, T = 30, B = 34;
  const iw = W - L - R, ih = H - T - B;
  let run = 0;
  const cum = values.map((v) => (run += v));
  const lo = Math.min(0, ...cum), hi = Math.max(0, ...cum);
  const span = niceMax(hi - lo) || 1;
  const zero = T + ih - ((0 - lo) / (hi - lo || 1)) * ih;
  const yOf = (v) => T + ih - ((v - lo) / (hi - lo || 1)) * ih;

  const gw = iw / categories.length;
  const bw = Math.min(46, gw - 20);
  let prev = 0;
  const bars = categories
    .map((c, i) => {
      const from = prev, to = cum[i];
      prev = to;
      const yA = yOf(Math.max(from, to)), yB = yOf(Math.min(from, to));
      const up = to >= from;
      const x = L + gw * i + (gw - bw) / 2;
      // Label outside the bar, on the side it grew towards.
      const ly = up ? yA - 6 : yB + 11;
      return `<rect x="${x}" y="${yA}" width="${bw}" height="${Math.max(1.5, yB - yA)}" fill="${up ? POS : NEG}" opacity=".85" rx="1"/>
<text x="${x + bw / 2}" y="${ly}" text-anchor="middle" font-size="7.8" fill="${up ? POS : NEG}" font-family="monospace" font-weight="700">${format(values[i])}</text>
<text x="${x + bw / 2}" y="${H - 20}" text-anchor="middle" font-size="8.5" fill="${INK}">${esc(c)}</text>`;
    })
    .join('');

  const cumLine = cum.map((v, i) => `${i ? 'L' : 'M'} ${L + gw * i + gw / 2} ${yOf(v)}`).join(' ');
  const axis = `<line x1="${L}" y1="${zero}" x2="${W - R}" y2="${zero}" stroke="${INK}" stroke-width="1"/>
<text x="${L - 7}" y="${zero + 3}" text-anchor="end" font-size="8" fill="${INK3}" font-family="monospace">$0</text>`;

  // The cumulative series is annotated on its own row at the foot of the plot,
  // not floated next to the line — floating it put it on top of whichever bar
  // happened to end nearest the right edge.
  const cumLabels = cum
    .map((v, i) => `<text x="${L + gw * i + gw / 2}" y="${H - 6}" text-anchor="middle" font-size="7.2" fill="${ACC}" font-family="monospace">${format(v)}</text>`)
    .join('');

  return wrap(
    W, H,
    `${axis}${bars}<path d="${cumLine}" fill="none" stroke="${ACC}" stroke-width="1.6" stroke-dasharray="3 2"/>
     <text x="${L}" y="${T - 12}" font-size="7.4" fill="${ACC}" font-family="monospace">— — cumulative cash position</text>
     ${cumLabels}`,
    caption, note,
  );
}

/**
 * Cumulative cash position, month by month, against the capital raised.
 *
 * This is the figure that actually answers "how much do you need, and when do
 * you stop needing it" — an annual bar chart cannot, because the deepest point
 * of the year is never the year-end number. The trough, the month the monthly
 * result turns positive, and the raise itself are all marked, so the reader can
 * see the headroom rather than being told it.
 */
export function cashCurve({ series, raise, troughMonth, breakevenMonth, height = 200, format = money, caption, note }) {
  const W = 680, H = height, L = 58, R = 14, T = 24, B = 30;
  const iw = W - L - R, ih = H - T - B;
  const lo = Math.min(-raise, ...series);
  const hi = Math.max(0, ...series);
  const x = (i) => L + (iw * i) / (series.length - 1);
  const y = (v) => T + ih - ((v - lo) / (hi - lo || 1)) * ih;

  const zero = y(0);
  const grid = `<line x1="${L}" y1="${zero}" x2="${W - R}" y2="${zero}" stroke="${INK}" stroke-width="1"/>
<text x="${L - 7}" y="${zero + 3}" text-anchor="end" font-size="8" fill="${INK3}" font-family="monospace">$0</text>
<line x1="${L}" y1="${y(-raise)}" x2="${W - R}" y2="${y(-raise)}" stroke="${NEG}" stroke-width="1" stroke-dasharray="4 3"/>
<text x="${L - 7}" y="${y(-raise) + 3}" text-anchor="end" font-size="8" fill="${NEG}" font-family="monospace">${format(-raise)}</text>`;

  const path = series.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ');
  const area = `${path} L ${x(series.length - 1)} ${zero} L ${L} ${zero} Z`;

  const ti = troughMonth - 1;
  const bi = breakevenMonth - 1;
  const marks = `
<circle cx="${x(ti)}" cy="${y(series[ti])}" r="3.4" fill="${NEG}"/>
<text x="${x(ti)}" y="${y(series[ti]) + 15}" text-anchor="middle" font-size="7.6" fill="${NEG}" font-family="monospace" font-weight="700">deepest ${format(series[ti])} · mo ${troughMonth}</text>
<line x1="${x(bi)}" y1="${T}" x2="${x(bi)}" y2="${T + ih}" stroke="${POS}" stroke-width="1" stroke-dasharray="2 3"/>
<text x="${x(bi) + 5}" y="${T + 9}" font-size="7.6" fill="${POS}" font-family="monospace" font-weight="700">mo ${breakevenMonth} · monthly result turns positive</text>`;

  const ticks = [12, 24, 36, 48, 60]
    .filter((t) => t <= series.length)
    .map((t) => `<text x="${x(t - 1)}" y="${H - 8}" text-anchor="middle" font-size="8.2" fill="${INK}">mo ${t}</text>`)
    .join('');

  return wrap(W, H, `${grid}<path d="${area}" fill="${ACC}" opacity=".08"/><path d="${path}" fill="none" stroke="${ACC}" stroke-width="2"/>${marks}${ticks}`, caption, note);
}

/**
 * Horizontal milestone scale — for scaling thresholds along a site count.
 *
 * Milestones cluster (four of them fall between 1,500 and 3,500 sites), so
 * labels are placed in two rows above and two below the axis and then pushed
 * apart within each row until they clear. A leader line runs from the dot to
 * the label whenever it has moved, because a de-collided label that still
 * points at nothing is worse than an overlapping one.
 */
export function milestones({ points, height = 150, caption, note }) {
  const W = 680, H = height, L = 16, R = 16, T = 44, B = 26;
  const iw = W - L - R;
  const axisY = T + 12;
  const max = Math.max(...points.map((p) => p.at));
  const pos = (v) => L + (Math.log10(Math.max(1, v)) / Math.log10(max)) * iw;

  // Each label needs roughly this much horizontal room to not touch its neighbour.
  const widthOf = (p) => Math.max(44, p.label.length * 3.6);

  const laid = points
    .map((p, i) => ({ ...p, i, x: Math.max(L, Math.min(W - R, pos(p.at))), w: widthOf(p) }))
    .sort((a, b) => a.x - b.x)
    .map((p, i) => ({ ...p, row: i % 4 })); // 0,2 above · 1,3 below

  // Push apart left-to-right, then pull back from the right edge.
  for (const p of laid) p.lx = p.x;
  for (const row of [0, 1, 2, 3]) {
    const inRow = laid.filter((p) => p.row === row);
    const gap = (a, b) => (a.w + b.w) / 2 + 6;
    for (let i = 1; i < inRow.length; i++) {
      if (inRow[i].lx - inRow[i - 1].lx < gap(inRow[i - 1], inRow[i])) {
        inRow[i].lx = inRow[i - 1].lx + gap(inRow[i - 1], inRow[i]);
      }
    }
    for (let i = inRow.length - 1; i >= 0; i--) {
      inRow[i].lx = Math.min(inRow[i].lx, W - R - inRow[i].w / 2);
      if (i > 0 && inRow[i].lx - inRow[i - 1].lx < gap(inRow[i - 1], inRow[i])) {
        inRow[i - 1].lx = inRow[i].lx - gap(inRow[i - 1], inRow[i]);
      }
    }
    for (const p of inRow) p.lx = Math.max(L + p.w / 2, p.lx);
  }

  const axis = `<line x1="${L}" y1="${axisY}" x2="${W - R}" y2="${axisY}" stroke="${RULE}" stroke-width="2"/>`;
  const marks = laid
    .map((p) => {
      const up = p.row === 0 || p.row === 2;
      const tier = p.row < 2 ? 0 : 1;
      const nY = up ? axisY - 14 - tier * 20 : axisY + 24 + tier * 20;
      const lY = up ? nY - 9 : nY + 9;
      const stemTo = up ? nY + 4 : nY - 10;
      const leader =
        Math.abs(p.lx - p.x) > 1.5
          ? `<path d="M${p.x} ${up ? axisY - 5 : axisY + 5} L${p.lx} ${stemTo}" stroke="${RULE}" stroke-width="1" fill="none"/>`
          : '';
      return `${leader}<circle cx="${p.x}" cy="${axisY}" r="${p.key ? 5 : 3.2}" fill="${p.key ? ACC : ACC2}"/>
<text x="${p.lx}" y="${nY}" text-anchor="middle" font-size="8.4" font-family="monospace" font-weight="${p.key ? 700 : 400}" fill="${p.key ? ACC : INK}">${p.at.toLocaleString()}</text>
<text x="${p.lx}" y="${lY}" text-anchor="middle" font-size="7.2" fill="${INK3}">${esc(p.label)}</text>`;
    })
    .join('');
  return wrap(W, H, `${axis}${marks}<text x="${L}" y="${H - 5}" font-size="7.4" fill="${INK3}">sites (log scale)</text>`, caption, note);
}

/** Stacked composition bars — where the money goes, year by year. */
export function stacked({ categories, series, height = 168, format = money, caption, note }) {
  const W = 680, H = height, L = 52, R = 96, T = 16, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const totals = categories.map((_, i) => series.reduce((a, s) => a + s.values[i], 0));
  const max = niceMax(Math.max(...totals));
  const gw = iw / categories.length;
  const bw = Math.min(48, gw - 18);

  const grid = [0, 0.5, 1]
    .map((f) => {
      const y = T + ih - ih * f;
      return `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="${RULE}"/>
<text x="${L - 7}" y="${y + 3}" text-anchor="end" font-size="8" fill="${INK3}" font-family="monospace">${format(max * f)}</text>`;
    })
    .join('');

  const bars = categories
    .map((c, i) => {
      let acc = 0;
      const segs = series
        .map((s) => {
          const h = (s.values[i] / max) * ih;
          const y = T + ih - acc - h;
          acc += h;
          return `<rect x="${L + gw * i + (gw - bw) / 2}" y="${y}" width="${bw}" height="${Math.max(0.6, h)}" fill="${s.colour}"/>`;
        })
        .join('');
      return `${segs}<text x="${L + gw * i + gw / 2}" y="${T + ih - acc - 5}" text-anchor="middle" font-size="7.6" font-family="monospace" fill="${INK}">${format(totals[i])}</text>
<text x="${L + gw * i + gw / 2}" y="${H - 9}" text-anchor="middle" font-size="8.5" fill="${INK}">${esc(c)}</text>`;
    })
    .join('');

  const legend = series
    .slice()
    .reverse()
    .map((s, i) => `<rect x="${W - R + 6}" y="${T + i * 15}" width="8" height="8" fill="${s.colour}" rx="1"/><text x="${W - R + 18}" y="${T + i * 15 + 7}" font-size="7.8" fill="${INK3}">${esc(s.name)}</text>`)
    .join('');

  return wrap(W, H, `${grid}${bars}${legend}`, caption, note);
}

function wrap(w, h, inner, caption, note) {
  return `<figure>
  ${caption ? `<h3 style="margin-top:0">${esc(caption)}</h3>` : ''}
  <svg viewBox="0 0 ${w} ${h}" width="100%" role="img" style="display:block;font-family:Inter,-apple-system,'Segoe UI',sans-serif">${inner}</svg>
  ${note ? `<p class="cap">${note}</p>` : ''}
</figure>`;
}

export const COLOURS = { accent: ACC, accent2: ACC2, pos: POS, neg: NEG, ink: INK, ink3: INK3, rule: RULE };
export { money };
