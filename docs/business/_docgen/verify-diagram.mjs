// Geometric verification harness for the page-1 architecture diagram.
//
// WHY THIS EXISTS: this diagram went through six rounds of "look at the
// screenshot, spot the bad arrow, nudge a coordinate, re-render." That loop
// does not converge — each visual pass catches some faults and misses others,
// and fixes to one connector silently break another (the Azure boundary
// stopped containing the portal row precisely that way).
//
// So the rules connectors must obey are written down as executable checks and
// run against the ACTUAL generated SVG. A violation is a failing assertion
// with coordinates, not an opinion about a picture.
//
// THE RULES
//   R1  Every arrowhead must terminate exactly on some box's edge (±2px).
//       An arrow ending in open space points at nothing.
//   R2  The arrow's final segment must be PERPENDICULAR to the edge it lands
//       on, pointing INTO the box: top edge → travelling down, bottom edge →
//       up, left edge → right, right edge → left. This is the rule that
//       catches "arrowhead points sideways while grazing a horizontal edge."
//   R3  A connector must not pass through the interior of any box that is
//       not its own source or target.
//   R4  If a connector's source and target boxes overlap horizontally, the
//       connector should be a STRAIGHT vertical line, not a dogleg. Doglegs
//       where a straight drop is geometrically available read as evasive and
//       are what the reviewer means by "should go straight down."
//   R5  Every box must be fully contained by whichever boundary encloses it.
//
// Run: node verify-diagram.mjs   → exits non-zero if any rule is violated.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, '..', 'Investor Documents', 'peaklogic-architecture-diagram.html');
const html = readFileSync(htmlPath, 'utf8');

// Page 1's diagram is the first <svg> in the document.
const svgMatch = html.match(/<svg viewBox="0 0 \d+ \d+"[\s\S]*?<\/svg>/);
if (!svgMatch) {
  console.error('FATAL: could not find page-1 <svg> in the generated HTML');
  process.exit(1);
}
let svg = svgMatch[0];

// Icons are drawn inside <g transform="translate(...) scale(...)"> so their
// internal rects live in a different coordinate space. Strip those groups
// before parsing boxes, or every icon's frame is mistaken for a real box.
svg = svg.replace(/<g transform="translate\([^)]*\)[^"]*"[\s\S]*?<\/g>/g, '');

const num = (s) => parseFloat(s);

// ── Boxes: rects WITH a stroke are real containers. Rects without one are
//    the opaque backings behind flow labels, not architecture. ─────────────
const boxes = [];
for (const m of svg.matchAll(/<rect ([^>]*?)\/>/g)) {
  const a = m[1];
  if (!/stroke="/.test(a)) continue; // label backing, not a box
  const g = (k) => {
    const r = a.match(new RegExp(`${k}="([^"]*)"`));
    return r ? r[1] : null;
  };
  const x = num(g('x')), y = num(g('y')), w = num(g('width')), h = num(g('height'));
  if ([x, y, w, h].some(Number.isNaN)) continue;
  boxes.push({ x, y, w, h, dashed: /stroke-dasharray/.test(a), fill: g('fill') });
}

// Boundaries are the large dashed/filled containers; leaf boxes are the rest.
const AREA = (b) => b.w * b.h;
const boundaries = boxes.filter((b) => AREA(b) > 150000);
const leaves = boxes.filter((b) => AREA(b) <= 150000);

// ── Connectors: <path> and <line> carrying a marker ───────────────────────
const conns = [];
for (const m of svg.matchAll(/<path d="([^"]*)"([^>]*)>/g)) {
  const d = m[1], attrs = m[2];
  if (!/marker-(end|start)/.test(attrs)) continue;
  const pts = [];
  for (const p of d.matchAll(/[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g)) pts.push([num(p[1]), num(p[2])]);
  if (pts.length < 2) continue;
  conns.push({
    pts,
    hasEnd: /marker-end/.test(attrs),
    hasStart: /marker-start/.test(attrs),
    stroke: (attrs.match(/stroke="([^"]*)"/) || [])[1],
  });
}
for (const m of svg.matchAll(/<line ([^>]*?)\/>/g)) {
  const a = m[1];
  if (!/marker-(end|start)/.test(a)) continue;
  const g = (k) => num((a.match(new RegExp(`${k}="([^"]*)"`)) || [])[1]);
  conns.push({
    pts: [[g('x1'), g('y1')], [g('x2'), g('y2')]],
    hasEnd: /marker-end/.test(a),
    hasStart: /marker-start/.test(a),
    stroke: (a.match(/stroke="([^"]*)"/) || [])[1],
  });
}

const TOL = 2.5;
const near = (a, b) => Math.abs(a - b) <= TOL;
const violations = [];

/**
 * Two connectors legitimately terminate on something that is not a bordered
 * rect, and are listed here rather than handled by loosening a rule:
 *
 *   (72,162)   field equipment → PeakLogic Hub. The Hub is drawn as an ICON
 *              plus a text label, not a rect, so there is no box edge to
 *              land on. The arrow stops just above the icon, which is the
 *              intended appearance.
 *   (210,830)  the LAN return path terminates on the ON-PREM BOUNDARY's own
 *              bottom edge — it addresses the site as a whole, not one box
 *              inside it. Boundaries are included in edgeAt() below, so this
 *              resolves normally; it is noted here only for the record.
 */
const ACCEPTED_NON_BOX_TIPS = [[72, 162]];
const isAccepted = (pt) => ACCEPTED_NON_BOX_TIPS.some(([x, y]) => Math.abs(x - pt[0]) < 3 && Math.abs(y - pt[1]) < 3);

/** Which edge of which box does this point sit on? Boundaries count too. */
function edgeAt(pt) {
  const [x, y] = pt;
  for (const b of [...leaves, ...boundaries]) {
    const inX = x >= b.x - TOL && x <= b.x + b.w + TOL;
    const inY = y >= b.y - TOL && y <= b.y + b.h + TOL;
    if (inX && near(y, b.y)) return { box: b, edge: 'top', want: [0, 1] };
    if (inX && near(y, b.y + b.h)) return { box: b, edge: 'bottom', want: [0, -1] };
    if (inY && near(x, b.x)) return { box: b, edge: 'left', want: [1, 0] };
    if (inY && near(x, b.x + b.w)) return { box: b, edge: 'right', want: [-1, 0] };
  }
  return null;
}

const unit = ([ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const L = Math.hypot(dx, dy);
  return L < 0.001 ? [0, 0] : [Math.round(dx / L), Math.round(dy / L)];
};

const label = (pt) => `(${pt[0].toFixed(0)},${pt[1].toFixed(0)})`;

conns.forEach((c, i) => {
  const id = `conn#${i} ${c.stroke || ''}`;

  // ── R1 + R2 for the marker-end (tip at the last point) ──
  if (c.hasEnd) {
    const tip = c.pts[c.pts.length - 1];
    const prev = c.pts[c.pts.length - 2];
    const hit = edgeAt(tip);
    if (!hit) {
      if (!isAccepted(tip)) violations.push(`${id}: R1 arrowhead at ${label(tip)} does not land on any box edge`);
    } else {
      const dir = unit(prev, tip);
      const [wx, wy] = hit.want;
      if (dir[0] !== wx || dir[1] !== wy) {
        violations.push(
          `${id}: R2 arrowhead on ${hit.edge} edge at ${label(tip)} travels [${dir}] but must travel [${wx},${wy}] (perpendicular, into the box)`,
        );
      }
    }
  }

  // ── R1 + R2 for the marker-start (tip at the first point, pointing back out) ──
  if (c.hasStart) {
    const tip = c.pts[0];
    const next = c.pts[1];
    const hit = edgeAt(tip);
    if (!hit) {
      violations.push(`${id}: R1 start-arrowhead at ${label(tip)} does not land on any box edge`);
    } else {
      const dir = unit(next, tip); // reversed: points back toward the box
      const [wx, wy] = hit.want;
      if (dir[0] !== wx || dir[1] !== wy) {
        violations.push(
          `${id}: R2 start-arrowhead on ${hit.edge} edge at ${label(tip)} travels [${dir}] but must travel [${wx},${wy}]`,
        );
      }
    }
  }

  // ── R3: no segment may cross a box it doesn't belong to ──
  const endpointBoxes = new Set();
  for (const p of [c.pts[0], c.pts[c.pts.length - 1]]) {
    const h = edgeAt(p);
    if (h) endpointBoxes.add(h.box);
  }
  for (let s = 0; s < c.pts.length - 1; s++) {
    const [x1, y1] = c.pts[s], [x2, y2] = c.pts[s + 1];
    for (const b of leaves) {
      if (endpointBoxes.has(b)) continue;
      const IN = 3; // shrink so merely touching an edge isn't "through"
      const bx1 = b.x + IN, bx2 = b.x + b.w - IN, by1 = b.y + IN, by2 = b.y + b.h - IN;
      const segMinX = Math.min(x1, x2), segMaxX = Math.max(x1, x2);
      const segMinY = Math.min(y1, y2), segMaxY = Math.max(y1, y2);
      const overlapX = segMaxX > bx1 && segMinX < bx2;
      const overlapY = segMaxY > by1 && segMinY < by2;
      if (overlapX && overlapY) {
        violations.push(`${id}: R3 segment ${label([x1, y1])}→${label([x2, y2])} passes through a box at (${b.x},${b.y},${b.w}x${b.h})`);
      }
    }
  }

  // ── R4: dogleg where a straight vertical drop was available ──
  if (c.pts.length > 2 && c.hasEnd) {
    const start = c.pts[0], tip = c.pts[c.pts.length - 1];
    const sHit = edgeAt(start), tHit = edgeAt(tip);
    if (sHit && tHit && sHit.edge === 'bottom' && tHit.edge === 'top') {
      const sb = sHit.box, tb = tHit.box;
      const lo = Math.max(sb.x, tb.x), hi = Math.min(sb.x + sb.w, tb.x + tb.w);
      if (hi - lo > 20) {
        violations.push(
          `${id}: R4 dogleg from box(${sb.x},${sb.y}) down to box(${tb.x},${tb.y}) — their x-ranges overlap ${lo.toFixed(0)}..${hi.toFixed(0)}, so a STRAIGHT vertical line is available`,
        );
      }
    }
  }
});

// ── R5: containment ──
for (const leaf of leaves) {
  for (const bnd of boundaries) {
    const cx = leaf.x + leaf.w / 2, cy = leaf.y + leaf.h / 2;
    const centreInside = cx > bnd.x && cx < bnd.x + bnd.w && cy > bnd.y && cy < bnd.y + bnd.h;
    if (!centreInside) continue;
    const fully =
      leaf.x >= bnd.x - 0.5 && leaf.y >= bnd.y - 0.5 &&
      leaf.x + leaf.w <= bnd.x + bnd.w + 0.5 && leaf.y + leaf.h <= bnd.y + bnd.h + 0.5;
    if (!fully) {
      violations.push(
        `R5 box(${leaf.x},${leaf.y},${leaf.w}x${leaf.h}) sits inside boundary(${bnd.x},${bnd.y},${bnd.w}x${bnd.h}) but is not fully contained — ` +
          `overflow right ${(leaf.x + leaf.w - bnd.x - bnd.w).toFixed(1)}, bottom ${(leaf.y + leaf.h - bnd.y - bnd.h).toFixed(1)}`,
      );
    }
  }
}

console.log(`parsed: ${boxes.length} boxes (${boundaries.length} boundaries, ${leaves.length} leaves), ${conns.length} connectors\n`);
if (violations.length === 0) {
  console.log('PASS — all connectors satisfy R1–R5.');
} else {
  console.log(`FAIL — ${violations.length} violation(s):\n`);
  for (const v of violations) console.log('  ' + v);
  process.exitCode = 1;
}
