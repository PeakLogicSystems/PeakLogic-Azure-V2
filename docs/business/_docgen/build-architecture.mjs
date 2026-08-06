// Low-level architecture diagram — 16:9, landscape, for a senior architect
// reviewing the platform in a due-diligence or security context.
//
// Deliberately hand-built SVG rather than a diagramming-tool export: the CSP
// this whole document family lives under blocks external assets, so every
// icon has to be inline, and hand-drawing a small vocabulary of shapes (cloud
// boundary, cylinder, gateway, padlock, browser) keyed to a legend is more
// legible at print resolution than an imported stencil set would be anyway.
//
// House rule, same as charts.mjs: every data flow is a real arrow with a real
// label — "how data actually moves", not a generic box-and-line chart. Every
// security boundary that matters (the tenant boundary, the outbound-only
// device link, the identity gate) is drawn as a boundary, not asserted in a
// caption underneath.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'Investor Documents');

const INK = '#14161d';
const INK2 = '#3d4356';
const INK3 = '#6b7285';
const PAPER = '#ffffff';
const RULE = '#d6dae4';
const ACCENT = '#4c2a9c';
const ACCENT2 = '#7c5ad4';
const AZURE = '#0d5fb8';
const AZURE_BG = '#eaf2fc';
const EDGE_BG = '#f3f1fa';
const EDGE_BORDER = '#c9bdec';
const SEC_BG = '#fdf1f1';
const SEC_BORDER = '#e3a8a8';
const SEC = '#a52020';
const POS = '#15683f';
const FRONT_BG = '#eef7f1';
const FRONT_BORDER = '#a9d4b6';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Small icon vocabulary, each a self-contained <g>, positioned by caller ──

const iconCloud = (x, y, s, stroke = AZURE, fill = AZURE_BG) => `
<g transform="translate(${x},${y}) scale(${s})">
  <path d="M6 20c-3.3 0-6-2.6-6-5.8 0-2.7 1.9-5 4.5-5.6C5.2 4.7 8.7 2 12.8 2c4.6 0 8.4 3.4 9 7.8 3 .6 5.2 3.2 5.2 6.3 0 3.5-2.9 6.3-6.5 6.3H6z"
    fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
</g>`;

const iconCylinder = (x, y, s, stroke = INK, fill = PAPER) => `
<g transform="translate(${x},${y}) scale(${s})">
  <path d="M0 3.5C0 1.6 3.6 0 8 0s8 1.6 8 3.5v13C16 18.4 12.4 20 8 20S0 18.4 0 16.5v-13z" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
  <ellipse cx="8" cy="3.5" rx="8" ry="3.5" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
</g>`;

const iconGateway = (x, y, s, stroke = ACCENT, fill = EDGE_BG) => `
<g transform="translate(${x},${y}) scale(${s})">
  <rect x="1" y="4" width="18" height="13" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
  <circle cx="6" cy="10.5" r="1.4" fill="${stroke}"/>
  <path d="M9.5 7.5a4.2 4.2 0 0 1 0 6" fill="none" stroke="${stroke}" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M12 5.5a7 7 0 0 1 0 11" fill="none" stroke="${stroke}" stroke-width="1.3" stroke-linecap="round"/>
  <rect x="4" y="17" width="4" height="2.4" fill="${stroke}"/>
  <rect x="12" y="17" width="4" height="2.4" fill="${stroke}"/>
</g>`;

const iconLock = (x, y, s, stroke = SEC, fill = SEC_BG) => `
<g transform="translate(${x},${y}) scale(${s})">
  <rect x="1.5" y="8" width="13" height="10" rx="1.6" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
  <path d="M4 8V5.5a4 4 0 0 1 8 0V8" fill="none" stroke="${stroke}" stroke-width="1.4"/>
  <circle cx="8" cy="12.6" r="1.3" fill="${stroke}"/>
  <rect x="7.35" y="13.4" width="1.3" height="2.6" fill="${stroke}"/>
</g>`;

const iconMonitor = (x, y, s, stroke = POS, fill = FRONT_BG) => `
<g transform="translate(${x},${y}) scale(${s})">
  <rect x="0.5" y="1" width="19" height="13" rx="1.6" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
  <path d="M2.5 3.5h15" stroke="${stroke}" stroke-width="1" opacity=".5"/>
  <rect x="7" y="14.6" width="6" height="1.6" fill="${stroke}"/>
  <rect x="4.5" y="16.4" width="11" height="1.4" rx="0.7" fill="${stroke}"/>
</g>`;

const iconFn = (x, y, s, stroke = AZURE, fill = AZURE_BG) => `
<g transform="translate(${x},${y}) scale(${s})">
  <rect x="1" y="1" width="16" height="16" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
  <path d="M6 5.5 L11.5 9 L6 12.5" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;

const iconKey = (x, y, s, stroke = AZURE, fill = AZURE_BG) => `
<g transform="translate(${x},${y}) scale(${s})">
  <circle cx="5.5" cy="10" r="4" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
  <path d="M9 10h9.5M15.5 10v3M18 10v2" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round"/>
</g>`;

const iconChip = (x, y, s, stroke = INK2, fill = '#fff') => `
<g transform="translate(${x},${y}) scale(${s})">
  <rect x="4" y="4" width="10" height="10" rx="1.2" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
  <g stroke="${stroke}" stroke-width="1.1">
    <path d="M6 1v3M9 1v3M12 1v3M6 16v3M9 16v3M12 16v3M1 6h3M1 9h3M1 12h3M16 6h3M16 9h3M16 12h3"/>
  </g>
</g>`;

const iconEye = (x, y, s, stroke = INK2, fill = '#fff') => `
<g transform="translate(${x},${y}) scale(${s})">
  <path d="M1 9s3.4-6 9-6 9 6 9 6-3.4 6-9 6-9-6-9-6z" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
  <circle cx="10" cy="9" r="3" fill="${stroke}"/>
</g>`;

// ── Boxes and connectors ─────────────────────────────────────────────────

function box(x, y, w, h, { fill = PAPER, stroke = INK, rx = 6, dash = null } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

function label(x, y, text, { size = 11, weight = 700, fill = INK, anchor = 'start', family = 'sans' } = {}) {
  const ff = family === 'mono' ? "'SF Mono','Cascadia Mono',Consolas,monospace" : "'Inter','Segoe UI',sans-serif";
  return `<text x="${x}" y="${y}" font-family="${ff}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(text)}</text>`;
}

function wrapText(x, y, text, width, { size = 9, fill = INK3, lineHeight = 12 } = {}) {
  const charsPerLine = Math.floor(width / (size * 0.56));
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length > charsPerLine && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.map((l, i) => `<text x="${x}" y="${y + i * lineHeight}" font-family="'Inter','Segoe UI',sans-serif" font-size="${size}" fill="${fill}">${esc(l)}</text>`).join('');
}

/** An orthogonal arrow: horizontal, then vertical, then horizontal — the Visio-standard elbow connector. */
function elbow(x1, y1, x2, y2, { stroke = INK2, dash = null, width = 1.6, midX = null } = {}) {
  const mx = midX ?? (x1 + x2) / 2;
  const d = `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''} marker-end="url(#arrow-${stroke.replace('#', '')})"/>`;
}

function straight(x1, y1, x2, y2, { stroke = INK2, dash = null, width = 1.6 } = {}) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''} marker-end="url(#arrow-${stroke.replace('#', '')})"/>`;
}

function arrowDefs(colours) {
  return `<defs>${colours
    .map(
      (c) => `<marker id="arrow-${c.replace('#', '')}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="${c}"/></marker>`,
    )
    .join('')}</defs>`;
}

function flowLabel(x, y, text, colour) {
  return `<g>
    <rect x="${x - text.length * 3.1}" y="${y - 10}" width="${text.length * 6.2}" height="13" fill="#fff" opacity=".92"/>
    <text x="${x}" y="${y}" font-family="'SF Mono','Cascadia Mono',Consolas,monospace" font-size="8.6" fill="${colour}" text-anchor="middle" font-weight="600">${esc(text)}</text>
  </g>`;
}

/**
 * A lettered domain badge, same convention as a landing-zone reference
 * diagram: every major boundary gets one letter, cross-referenced in a
 * legend, so a review conversation can say "look at D" instead of re-pointing
 * at the screen. Drawn immediately before a title's text, not floating loose,
 * so it can never end up placed somewhere unrelated to what it labels.
 */
function badge(x, y, letter, colour = ACCENT) {
  return `<g><circle cx="${x}" cy="${y - 4}" r="9" fill="${colour}"/><text x="${x}" y="${y}" font-family="'Inter','Segoe UI',sans-serif" font-size="10" font-weight="800" fill="#fff" text-anchor="middle">${letter}</text></g>`;
}

// ── The diagram itself, 1600×900 (16:9) ──────────────────────────────────

const EXPORT = '#8a5205';

function diagramSvg() {
  const W = 1900, H = 1000;
  const colours = [INK2, AZURE, ACCENT, POS, SEC, INK3, ACCENT2, EXPORT];

  // A strict grid — every box below is placed against these columns/rows and
  // sized to fit inside its cell with margin, rather than hand-tuned pixel by
  // pixel. That is what keeps six independent boundaries from drifting into
  // each other as the diagram is edited.
  const COL = [40, 400, 620, 840, 1060, 1280, 1500]; // column edges — Azure boundary
  const ROW = [50, 215, 350, 515, 625, 755, 840]; // row edges
  const EXT_X = COL[6] + 40; // external-systems column starts right of the Azure boundary

  let s = '';
  s += arrowDefs(colours);

  // ── On-prem boundary ──
  // Field equipment lives INSIDE this boundary, as its own row at the top,
  // rather than as a separate box outside it — the equipment is physically on
  // the customer's site too, and drawing it outside the boundary it belongs to
  // was the source of a stray connector crossing the whole panel.
  const edgeX = COL[0], edgeY = ROW[0], edgeW = COL[1] - COL[0] - 20, edgeH = ROW[5] - ROW[0];
  s += box(edgeX, edgeY, edgeW, edgeH, { fill: EDGE_BG, stroke: EDGE_BORDER, rx: 12, dash: '6 4' });
  s += badge(edgeX + 17, edgeY + 24, 'A', ACCENT);
  s += label(edgeX + 33, edgeY + 24, 'CUSTOMER SITE — ON-PREM', { size: 10.5, fill: ACCENT, weight: 800 });
  s += label(edgeX + 16, edgeY + 39, 'No inbound rule, port-forward, or VLAN ever required', { size: 8, fill: INK3, weight: 500 });

  s += iconChip(edgeX + 20, edgeY + 52, 1.05, INK3);
  s += label(edgeX + 56, edgeY + 66, 'Field equipment', { size: 9.3, weight: 700 });
  s += wrapText(edgeX + 56, edgeY + 78, 'Pumps · blowers · chemistry · PLCs / RTUs', edgeW - 76, { size: 7.4 });
  s += straight(edgeX + 32, edgeY + 92, edgeX + 32, edgeY + 112, { stroke: INK3, width: 1.3 });

  s += iconGateway(edgeX + 20, edgeY + 118, 1.7);
  s += label(edgeX + 96, edgeY + 138, 'PeakLogic Hub', { size: 11 });
  s += wrapText(edgeX + 20, edgeY + 158, 'Acquires Modbus TCP / OPC-UA / EtherNet-IP. Evaluates threshold alarms locally. Store-and-forward on link loss.', edgeW - 40, { size: 7.6 });

  s += box(edgeX + 20, edgeY + 198, edgeW - 40, 55, { fill: '#fff', stroke: RULE, rx: 8 });
  s += label(edgeX + 32, edgeY + 218, 'Desired-state reconciler', { size: 9.2, weight: 700 });
  s += wrapText(edgeX + 32, edgeY + 231, 'Firmware · drivers · agent · config · security bundle', edgeW - 64, { size: 7.4 });

  s += box(edgeX + 20, edgeY + 265, edgeW - 40, 110, { fill: '#fff', stroke: RULE, rx: 8 });
  s += iconMonitor(edgeX + 32, edgeY + 276, 1.1, ACCENT2, '#f4f1fb');
  s += label(edgeX + 32, edgeY + 308, 'PeakView360 (LAN-served)', { size: 9.4, weight: 700 });
  s += wrapText(edgeX + 32, edgeY + 321, 'Facility View, Historian, alarm panel — served over the local network. Keeps working with the internet down; syncs when it is back.', edgeW - 64, { size: 7.4 });

  s += box(edgeX + 20, edgeY + 388, edgeW - 40, 60, { fill: '#fff', stroke: RULE, rx: 8 });
  s += iconLock(edgeX + 32, edgeY + 398, 1.0);
  s += label(edgeX + 55, edgeY + 410, 'Per-device X.509 identity', { size: 9.2, weight: 700 });
  s += wrapText(edgeX + 32, edgeY + 423, 'Mutual TLS. A revoked cert cannot reconnect.', edgeW - 64, { size: 7.4 });

  s += wrapText(edgeX + 16, edgeY + edgeH - 26, 'Read-only by construction — no code path here issues a device command.', edgeW - 32, { size: 7.6, fill: SEC });

  // ── Azure boundary ──
  const azX = COL[1], azY = ROW[0] - 10, azW = COL[6] - COL[1], azH = ROW[5] - ROW[0] + 10;
  s += box(azX, azY, azW, azH, { fill: AZURE_BG, stroke: '#bcd6f2', rx: 14 });
  s += iconCloud(azX + 16, azY + 12, 1.3, AZURE, '#dcebfb');
  s += badge(azX + 46, azY + 28, 'B', AZURE);
  s += label(azX + 62, azY + 28, 'MICROSOFT AZURE — PeakLogicSystems (multi-tenant SaaS)', { size: 11, fill: AZURE, weight: 800 });

  // Row A: IoT Hub/DPS, API Management
  const rowAY = ROW[0] + 35;
  const iotX = azX + 30, iotW = COL[2] - COL[1] - 60;
  s += box(iotX, rowAY, iotW, 95, { fill: '#fff', stroke: AZURE, rx: 8 });
  s += badge(iotX + 15, rowAY + 22, 'C', AZURE);
  s += iconCloud(iotX + 32, rowAY + 10, 0.95, AZURE, '#eaf2fc');
  s += label(iotX + 66, rowAY + 22, 'IoT Hub + DPS', { size: 10, weight: 700 });
  s += wrapText(iotX + 12, rowAY + 40, 'Device provisioning: per-device enrollment, group ZTP.', iotW - 24, { size: 7.6 });

  // MQTT/TLS connector — routed through the narrow gap between the two
  // boundaries rather than labelled with long text that would overrun both
  // boxes on either side of it; "outbound only" is already stated in the
  // on-prem caption above and in the page-3 flow table.
  s += elbow(edgeX + edgeW, edgeY + 118 + 17, iotX, rowAY + 60, { stroke: AZURE, midX: edgeX + edgeW + 25 });
  s += flowLabel(edgeX + edgeW + 25, (edgeY + 118 + 17 + rowAY + 60) / 2, 'MQTT/TLS', AZURE);

  const apimX = COL[2] + 30, apimW = COL[3] - COL[2] - 60;
  s += box(apimX, rowAY, apimW, 95, { fill: '#fff', stroke: AZURE, rx: 8 });
  s += badge(apimX + 15, rowAY + 22, 'D', AZURE);
  s += iconGateway(apimX + 32, rowAY + 10, 0.95, AZURE, '#eaf2fc');
  s += label(apimX + 66, rowAY + 22, 'API Management', { size: 10, weight: 700 });
  s += wrapText(apimX + 12, rowAY + 40, 'Rate limiting, JWT validation at the edge, one façade per portal.', apimW - 24, { size: 7.6 });

  // Row B: Ingest Functions, API Functions
  const rowBY = ROW[1] + 25;
  s += box(iotX, rowBY, iotW, 95, { fill: '#fff', stroke: AZURE, rx: 8 });
  s += iconFn(iotX + 12, rowBY + 10, 0.85);
  s += label(iotX + 44, rowBY + 22, 'Ingest Functions', { size: 10, weight: 700 });
  s += wrapText(iotX + 12, rowBY + 38, 'Dedup · poison-message DLQ · normalize · Policy Engine · anomaly scoring.', iotW - 24, { size: 7.6 });
  s += elbow(iotX + iotW / 2, rowAY + 95, iotX + iotW / 2, rowBY, { stroke: AZURE });

  s += box(apimX, rowBY, apimW, 95, { fill: '#fff', stroke: AZURE, rx: 8 });
  s += iconFn(apimX + 12, rowBY + 10, 0.85);
  s += label(apimX + 44, rowBY + 22, 'API Functions', { size: 10, weight: 700 });
  s += wrapText(apimX + 12, rowBY + 38, 'withTenant() / withChannelPartner() / withStaffSession() on every route.', apimW - 24, { size: 7.6 });
  s += elbow(apimX + apimW / 2, rowAY + 95, apimX + apimW / 2, rowBY, { stroke: AZURE });

  // ── Data layer boundary (row C, left) ──
  const dataX = COL[1] + 30, dataY = ROW[2] + 25, dataW = COL[3] - COL[1] - 60, dataH = 130;
  s += box(dataX, dataY, dataW, dataH, { fill: '#fff', stroke: RULE, rx: 12 });
  s += badge(dataX + 15, dataY + 18, 'E', INK2);
  s += label(dataX + 31, dataY + 20, 'DATA LAYER — private endpoint', { size: 9.3, fill: INK2, weight: 800 });
  s += iconCylinder(dataX + 18, dataY + 32, 1.5);
  s += label(dataX + 78, dataY + 48, 'PostgreSQL Flexible Server', { size: 9.6, weight: 700 });
  s += wrapText(dataX + 78, dataY + 60, 'PostGIS · row-level security FORCED on every tenant table.', dataW - 96, { size: 7.4 });
  s += iconLock(dataX + 18, dataY + 82, 0.9, SEC, SEC_BG);
  s += label(dataX + 46, dataY + 94, 'app.current_tenant_id', { size: 8, weight: 700, family: 'mono' });
  s += wrapText(dataX + 18, dataY + 106, 'set_config() per request — RLS returns zero rows outside scope, never another tenant’s. No public network access.', dataW - 36, { size: 7.2, fill: SEC });

  // Two separate arrows into the top edge, each with its own clearly separated
  // label placed ABOVE row B rather than crowded onto the short vertical run
  // shared with the browser-access trunk below.
  // Target shifted right of centre — the box centre (dataX+dataW/2) sits
  // almost exactly under the "DATA LAYER" title text next to the E badge,
  // so the arrowhead was landing on top of the badge and title instead of
  // clear space on the border.
  s += elbow(iotX + iotW / 2, rowBY + 95, dataX + 260, dataY, { stroke: AZURE, midX: iotX + iotW / 2 });
  s += flowLabel(iotX + iotW / 2, rowBY + 95 + 17, 'telemetry writes', AZURE);
  s += elbow(apimX + apimW / 2, rowBY + 95, dataX + dataW - 30, dataY, { stroke: AZURE, midX: apimX + apimW / 2 });
  s += flowLabel(apimX + apimW / 2, rowBY + 95 + 17, 'scoped reads/writes', AZURE);

  // ── Identity boundary (row C, right of data layer) ──
  const idX = COL[3] + 20, idY = dataY, idW = COL[4] - COL[3] - 40, idH = dataH;
  s += box(idX, idY, idW, idH, { fill: '#fff', stroke: RULE, rx: 12 });
  s += badge(idX + 15, idY + 18, 'F', INK2);
  s += label(idX + 31, idY + 20, 'IDENTITY — Entra External ID', { size: 9.3, fill: INK2, weight: 800 });
  s += iconKey(idX + 14, idY + 30, 1.0);
  s += wrapText(idX + 46, idY + 44, 'Three isolated tenants: customer, partner, staff. JWT carries tenantId + role.', idW - 60, { size: 7.4 });
  s += iconLock(idX + 14, idY + 74, 0.9, AZURE, '#eaf2fc');
  s += label(idX + 42, idY + 86, 'Key Vault', { size: 8.6, weight: 700 });
  s += wrapText(idX + 14, idY + 98, 'Device certs, secrets, connection strings.', idW - 28, { size: 7.2 });

  // Anchored exactly on API Management's right border (not inset), so the
  // connector visibly starts AT the box rather than floating near it.
  s += elbow(apimX + apimW, rowAY + 47, idX + idW / 2, idY, { stroke: AZURE, dash: '3 3', width: 1.2, midX: idX + idW / 2 });
  s += flowLabel(idX + idW / 2, idY - 8, 'token validation', AZURE);

  // ── Agent bus + monitoring (row D) ──
  const agentY = ROW[3] + 15, agentH = 95;
  s += box(dataX, agentY, dataW, agentH, { fill: EDGE_BG, stroke: EDGE_BORDER, rx: 10 });
  s += badge(dataX + 15, agentY + 18, 'G', ACCENT);
  s += iconEye(dataX + 32, agentY + 12, 0.95, ACCENT, '#f4f1fb');
  s += label(dataX + 64, agentY + 24, '16-agent operations team', { size: 9.5, weight: 700, fill: ACCENT });
  s += wrapText(dataX + 14, agentY + 40, 'agent_events (Postgres bus) → Timer Functions. Findings advise; an operator authorizes every action. No agent issues a device command.', dataW - 28, { size: 7.4 });
  s += elbow(dataX + dataW / 2, dataY + dataH, dataX + dataW / 2, agentY, { stroke: ACCENT2 });

  const monX = idX, monW = idW;
  s += box(monX, agentY, monW, agentH, { fill: '#fff', stroke: RULE, rx: 10 });
  s += iconEye(monX + 14, agentY + 12, 0.9, INK2);
  s += label(monX + 42, agentY + 24, 'App Insights / Log', { size: 9.3, weight: 700 });
  s += label(monX + 14, agentY + 38, 'Analytics + Action Groups', { size: 9.3, weight: 700 });
  s += wrapText(monX + 14, agentY + 52, 'Cost kill-switch, alerts, agent report delivery.', monW - 28, { size: 7.2 });
  s += elbow(dataX + dataW, agentY + agentH / 2, monX, agentY + agentH / 2, { stroke: INK3 });

  // ── Static hosting (row D, right of Monitoring) ──
  //
  // A gap the earlier revision left entirely unrepresented: the three portal
  // SPAs have to be SERVED from somewhere before a browser can call the API at
  // all, and nothing in this diagram showed that. It is a separate concern
  // from the API-access trunk below — this delivers the application's code,
  // the trunk delivers the data an already-loaded page asks for — so it gets
  // its own lane rather than merging into the API arrows.
  const trunkX = COL[4] + 180; // clear corridor to the right of Identity/Monitoring/Hosting (x > 1220) — the shared API-access lane's X, defined here since Static Hosting's width depends on it
  const hostX = monX + monW + 10, hostW = trunkX - hostX - 20, hostY = agentY;
  s += box(hostX, hostY, hostW, agentH, { fill: '#fff', stroke: FRONT_BORDER, rx: 10 });
  s += badge(hostX + 15, hostY + 18, 'H', POS);
  s += iconCloud(hostX + 32, hostY + 10, 0.9, POS, '#e3f4ea');
  s += label(hostX + 64, hostY + 24, 'Static Web Hosting', { size: 9.3, weight: 700 });
  s += wrapText(hostX + 14, hostY + 40, 'Storage + CDN. Serves the built SPA bundle for all four surfaces — separate from the API, which serves only data.', hostW - 28, { size: 7.2 });

  // ── Frontends (row E) ──
  //
  // All four surfaces reach the platform through the SAME entry point — API
  // Functions — so they are drawn as branches off one shared trunk rather than
  // four separate lines fanning out from that one point. Earlier revisions drew
  // each as its own elbow with a different bend, which sent all four straight
  // through the Data Layer, Identity, and Agent boxes sitting between the API
  // row and the portal row: four dashed lines stacked through boxes they have
  // nothing to do with, each with its own arrowhead landing mid-box. The trunk
  // runs down the clear margin to the right of those boxes instead, then
  // branches out at the bottom — the boxes it passes are never crossed.
  // feY pushed down from row D's bottom (625) by 30px rather than 15 — that
  // extra room is what lets the API-access lane and the static-hosting lane
  // (below) run side by side through the gap without touching, and the
  // section caption moves BELOW the boxes entirely (see after the loop) so it
  // never sits on top of either lane the way it did directly above them.
  const feY = ROW[4] + 30, feH = 115;
  const feW = 175, feGap = 20;
  const feStartX = dataX;
  const fronts = [
    { title: 'Customer Portal', sub: 'Their sites, alerts, compliance reports only.' },
    { title: 'Partner Portal', sub: 'Whole book of business. White-labelled per partner.' },
    { title: 'Control Center', sub: 'Staff only. Fleet, branding, agents, act-as.' },
  ];
  fronts.forEach((f, i) => {
    const fx = feStartX + i * (feW + feGap);
    s += box(fx, feY, feW, feH, { fill: FRONT_BG, stroke: FRONT_BORDER, rx: 8 });
    s += iconMonitor(fx + 12, feY + 10, 1.05, POS, '#e3f4ea');
    s += label(fx + 42, feY + 24, f.title, { size: 9.6, weight: 700 });
    s += wrapText(fx + 12, feY + 40, f.sub, feW - 24, { size: 7.4 });
  });

  // PeakView360, launched inside a portal, with a LAN fallback back to its site's Hub
  const pvX = feStartX + 3 * feW + 2 * feGap + 20, pvW = COL[6] - pvX - 20;
  s += box(pvX, feY, pvW, feH, { fill: FRONT_BG, stroke: FRONT_BORDER, rx: 8, dash: '4 3' });
  s += iconMonitor(pvX + 12, feY + 10, 1.0, POS, '#e3f4ea');
  s += label(pvX + 40, feY + 24, 'PeakView360', { size: 9.6, weight: 700 });
  s += wrapText(pvX + 12, feY + 40, 'Embedded per site. Fails closed if opened for a site it holds no data for.', pvW - 24, { size: 7.4 });

  // Section caption BELOW the row, not above it — above was a 10px gap
  // shared with the bus line feeding these boxes, and the two collided.
  s += badge(feStartX + 6, feY + feH + 20, 'I', POS);
  s += label(feStartX + 22, feY + feH + 20, 'BROWSER — three portals, not one app with role menus', { size: 9.3, fill: POS, weight: 800 });

  // Two parallel lanes reach this row, each with its own dedicated Y band so
  // neither line, nor its label, ever touches the other:
  //   - API access (blue, solid corridor at x=1240): data calls, bidirectional
  //     (request out / response back), branching to all four boxes.
  //   - Static hosting (green, from box H): the SPA bundle itself, a single
  //     representative connection landing on the first portal with a note
  //     that it serves all four — drawing four more arrows here would repeat
  //     the exact fan-out clutter that made this row wrong the first time.
  const busY = agentY + agentH + 10; // 10px below row D — never inside it
  const trunkStartX = apimX + apimW / 2, trunkStartY = rowBY + 95;
  // Bidirectionality is shown ONCE, on the shared trunk itself (both markers
  // here) — not repeated on every branch below. The PeakView360 branch has
  // almost no horizontal offset from the trunk (a few px), and a marker-start
  // on that near-zero-length leg rendered as a crossed "bowtie" right where
  // the branch meets the trunk rather than a clean arrow. One clear
  // bidirectional marker on the trunk plus the "(2-way)" label already says
  // the whole path is a round trip; each branch only needs to show where it
  // terminates.
  // marker-start only. This trunk doesn't END at (trunkX, busY) — it forks
  // into branches there — so an arrowhead at that point marked nothing real
  // and read as an unexplained arrow pointing at empty space. The single
  // start-arrow at API Functions plus the branches' own end-arrows is enough
  // to show the shape of the path without inventing a false destination.
  s += `<path d="M ${trunkStartX} ${trunkStartY} L ${trunkX} ${trunkStartY} L ${trunkX} ${busY}" fill="none" stroke="${AZURE}" stroke-width="1.3" stroke-dasharray="2 3" marker-start="url(#arrow-${AZURE.replace('#', '')})"/>`;
  s += flowLabel(trunkX, (trunkStartY + busY) / 2, 'API access (2-way)', AZURE);
  const branchTargets = [...fronts.map((f, i) => feStartX + i * (feW + feGap) + feW / 2), pvX + pvW / 2];
  branchTargets.forEach((cx) => {
    s += `<path d="M ${trunkX} ${busY} L ${cx} ${busY} L ${cx} ${feY}" fill="none" stroke="${AZURE}" stroke-width="1.1" stroke-dasharray="2 3" marker-end="url(#arrow-${AZURE.replace('#', '')})"/>`;
  });

  // Fans out to all four boxes, the same shape as the API-access trunk above
  // it — a single representative line plus a text claim read as a missing
  // connection ("does it actually reach the other three, or not?"). Showing
  // all four leaves nothing to take on faith.
  const hostLaneY = busY + 10;
  s += `<path d="M ${hostX + hostW / 2} ${hostY + agentH} L ${hostX + hostW / 2} ${hostLaneY}" fill="none" stroke="${POS}" stroke-width="1.3" stroke-dasharray="2 3" marker-start="url(#arrow-${POS.replace('#', '')})"/>`;
  branchTargets.forEach((cx) => {
    s += `<path d="M ${hostX + hostW / 2} ${hostLaneY} L ${cx} ${hostLaneY} L ${cx} ${feY}" fill="none" stroke="${POS}" stroke-width="1.1" stroke-dasharray="2 3" marker-end="url(#arrow-${POS.replace('#', '')})"/>`;
  });

  // Direct LAN path — ONE path with a marker at each real endpoint, so no
  // arrowhead appears at a bend that is not an actual destination.
  const laneY = ROW[5] + 40;
  const lanePath = `M ${pvX + pvW / 2} ${feY + feH} L ${pvX + pvW / 2} ${laneY} L ${edgeX + edgeW / 2} ${laneY} L ${edgeX + edgeW / 2} ${edgeY + edgeH}`;
  s += `<path d="${lanePath}" fill="none" stroke="${ACCENT2}" stroke-width="1.3" stroke-dasharray="5 4" marker-end="url(#arrow-${ACCENT2.replace('#', '')})" marker-start="url(#arrow-${ACCENT2.replace('#', '')})"/>`;
  // Placed toward the PeakView360 end of the line, not centered — centered
  // put it directly over the "BROWSER" caption sitting just above this row.
  s += flowLabel(pvX + pvW / 2 - 130, laneY - 8, 'direct LAN (2-way)', ACCENT2);

  // The "no command path" gap, marked where the Hub's outbound link terminates
  s += `<line x1="${edgeX + edgeW - 4}" y1="${edgeY + 118 + 3}" x2="${edgeX + edgeW - 4}" y2="${edgeY + 118 + 31}" stroke="${SEC}" stroke-width="3"/>`;

  // ── External systems — outside the Azure boundary on purpose ──
  //
  // These are not PeakLogic services. A partner's own CMMS and a customer's
  // pre-existing SCADA/historian are systems THEY own; drawing them inside the
  // Azure tenant boundary would misstate whose infrastructure this is. Both
  // routes exit from the row that produces the data they carry — API Functions
  // for a dispatched work order, Ingest Functions for normalized telemetry —
  // and are drawn distinctly (a different colour, "EXPORT" in the label) from
  // the tenant-internal flows so a reviewer does not mistake a third-party
  // integration for part of the platform's own security boundary.
  const extBoundX = EXT_X - 20, extBoundY = rowAY - 15, extBoundW = 340, extBoundH = agentY + agentH - extBoundY;
  s += box(extBoundX, extBoundY, extBoundW, extBoundH, { fill: '#fbfaf7', stroke: '#e3c78a', rx: 12, dash: '6 4' });
  s += badge(extBoundX + 17, extBoundY + 22, 'J', EXPORT);
  s += label(extBoundX + 33, extBoundY + 22, 'EXTERNAL — customer/partner-owned', { size: 9.3, fill: EXPORT, weight: 800 });
  s += label(extBoundX + 16, extBoundY + 36, 'Not part of the Azure tenant boundary', { size: 7.6, fill: INK3 });

  const cmmsY = rowBY, cmmsH = 95;
  s += box(EXT_X, cmmsY, 300, cmmsH, { fill: '#fff', stroke: '#e3c78a', rx: 8 });
  s += iconFn(EXT_X + 12, cmmsY + 10, 0.85, EXPORT, '#fdf3e2');
  s += label(EXT_X + 44, cmmsY + 22, 'Partner CMMS (existing)', { size: 9.6, weight: 700 });
  s += wrapText(EXT_X + 12, cmmsY + 38, 'Work-order dispatch — advanceWorkOrderStage() pushes status through to the partner’s own system. Outbound only; no CMMS reaches back into PeakLogic.', 276, { size: 7.4 });
  s += straight(apimX + apimW, rowBY + 47, EXT_X, cmmsY + 47, { stroke: EXPORT, dash: '3 3', width: 1.3 });
  s += flowLabel((apimX + apimW + EXT_X) / 2 - 40, rowBY + 35, 'EXPORT · work order', EXPORT);

  const scadaY = cmmsY + cmmsH + 40, scadaH = 95;
  s += box(EXT_X, scadaY, 300, scadaH, { fill: '#fff', stroke: '#e3c78a', rx: 8 });
  s += iconCylinder(EXT_X + 14, scadaY + 10, 1.3, INK, '#fdf3e2');
  s += label(EXT_X + 60, scadaY + 26, 'Customer SCADA / Historian', { size: 9.6, weight: 700 });
  s += label(EXT_X + 12, scadaY + 40, '(optional — only where one already exists)', { size: 7.4, fill: INK3, weight: 500 });
  s += wrapText(EXT_X + 12, scadaY + 54, 'Normalized telemetry fed upward for plants that already run SCADA — PeakLogic instruments what it cannot economically reach, not what it replaces.', 276, { size: 7.4 });
  // Routed through the row A/B gap (above Ingest/API Functions, below IoT
  // Hub/API Management — a band nothing else uses horizontally) rather than
  // the row B/C gap below: that lower band is where the telemetry-writes and
  // scoped-reads-writes arrows descend into Data Layer, and running this
  // line through the same space produced a tangle of crossings right where
  // those arrowheads land. One clean crossing with the API Management→API
  // Functions connector partway across is the trade — a single crossing
  // between differently-styled lines reads fine; the cluster it replaces did
  // not. The final segment is horizontal into the box's own edge, so the
  // arrowhead points rightward into it rather than down past it.
  const scadaLaneY = rowAY + 95 + 25; // 205 — the row A/B gap, clear of Data Layer entirely
  const scadaApproachX = extBoundX - 15; // just outside the external boundary's own border
  const scadaPath = `M ${iotX + iotW} ${rowBY + 20} L ${iotX + iotW + 20} ${rowBY + 20} L ${iotX + iotW + 20} ${scadaLaneY} L ${scadaApproachX} ${scadaLaneY} L ${scadaApproachX} ${scadaY + 47} L ${EXT_X} ${scadaY + 47}`;
  s += `<path d="${scadaPath}" fill="none" stroke="${EXPORT}" stroke-width="1.3" stroke-dasharray="3 3" marker-end="url(#arrow-${EXPORT.replace('#', '')})"/>`;
  s += flowLabel((iotX + iotW + scadaApproachX) / 2 + 60, scadaLaneY - 8, 'EXPORT · normalized telemetry', EXPORT);

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;background:#fff">${s}</svg>`;
}

const iconGit = (x, y, s, stroke = INK2, fill = '#fff') => `
<g transform="translate(${x},${y}) scale(${s})">
  <circle cx="9" cy="9" r="8" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
  <circle cx="6" cy="6" r="1.6" fill="${stroke}"/><circle cx="12" cy="6" r="1.6" fill="${stroke}"/><circle cx="9" cy="13" r="1.6" fill="${stroke}"/>
  <path d="M6 7.5V10a2 2 0 0 0 2 2h.3M12 7.5V10a2 2 0 0 1-2 2h-.3" fill="none" stroke="${stroke}" stroke-width="1.1"/>
</g>`;

const iconFolder = (x, y, s, stroke = INK2, fill = '#fff') => `
<g transform="translate(${x},${y}) scale(${s})">
  <path d="M1 4.5c0-.8.6-1.4 1.4-1.4h4l1.6 2h8.6c.8 0 1.4.6 1.4 1.4v8.2c0 .8-.6 1.4-1.4 1.4H2.4C1.6 16.1 1 15.5 1 14.7V4.5z" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
</g>`;

const iconPerson2 = (x, y, s, stroke = INK2, fill = '#fff') => `
<g transform="translate(${x},${y}) scale(${s})">
  <circle cx="9" cy="6" r="3.2" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
  <path d="M2.5 16c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>
</g>`;

/**
 * Page 4 — cloud governance / subscription topology.
 *
 * A DIFFERENT kind of low-level diagram from page 1: page 1 shows how the
 * application's components and data flows work; this shows how the Azure
 * TENANT itself is organised — subscription, identity for deployment
 * (distinct from Entra External ID, which is customer/partner/staff identity
 * on page 1), resource-group-per-stage isolation, and the CI/CD path code
 * actually travels to reach production. Kept as its own page rather than
 * merged into page 1, because cramming both onto one canvas is exactly how
 * governance diagrams turn illegible.
 */
function governanceSvg() {
  const W = 1900, H = 760;
  const colours = [INK2, AZURE, ACCENT, POS, SEC, INK3];
  let s = '';
  s += arrowDefs(colours);

  // GitHub — where code and pipeline definitions live
  const ghX = 780, ghY = 40, ghW = 340, ghH = 110;
  s += box(ghX, ghY, ghW, ghH, { fill: '#f6f7fa', stroke: INK3, rx: 10 });
  s += badge(ghX + 17, ghY + 24, 'K', INK2);
  s += iconGit(ghX + 32, ghY + 14, 1.15);
  s += label(ghX + 66, ghY + 24, 'GitHub — PeakLogic-Azure-V2', { size: 10, weight: 700 });
  s += wrapText(ghX + 32, ghY + 42, 'ci.yml on every push (typecheck, build, test, dependency audit, Bicep validate, PSRule). deploy-{dev,staging,prod}.yml — separate workflows per stage.', ghW - 48, { size: 7.6 });

  // Identity for deployment — Workload Identity Federation, no stored secrets
  const widY = ghY + ghH + 50;
  const stages = ['dev', 'staging', 'prod'];
  const stageColW = 520, stageGap = 60;
  const stagesTotalW = stageColW * 3 + stageGap * 2;
  const stagesStartX = (W - stagesTotalW) / 2;

  s += label(W / 2, widY - 14, 'ENTRA WORKLOAD IDENTITY FEDERATION — one App Registration per stage, no stored client secret', { size: 9.5, fill: AZURE, weight: 800, anchor: 'middle' });
  // The fan-out row sits ABOVE idBoxY (widY+20) with real clearance — it
  // previously sat 10px BELOW that, drawing the branch lines through the top
  // of each App Registration box instead of stopping above it.
  const fanY = widY + 5;
  s += `<path d="M ${ghX + ghW / 2} ${ghY + ghH} L ${ghX + ghW / 2} ${fanY} L ${W / 2} ${fanY}" fill="none" stroke="${AZURE}" stroke-width="1.3" stroke-dasharray="3 3"/>`;

  stages.forEach((stage, i) => {
    const cx0 = stagesStartX + i * (stageColW + stageGap);
    const idBoxY = widY + 20, idBoxH = 60;
    s += box(cx0, idBoxY, stageColW, idBoxH, { fill: AZURE_BG, stroke: '#bcd6f2', rx: 8 });
    s += iconKey(cx0 + 12, idBoxY + 10, 0.85, AZURE, '#eaf2fc');
    s += label(cx0 + 44, idBoxY + 22, `PeakLogic-${stage}-CiCd`, { size: 9.3, weight: 700, family: 'mono' });
    s += label(cx0 + 12, idBoxY + 38, 'Federated credential trusts this repo — OIDC token exchange at deploy time.', { size: 7, fill: INK3, weight: 500 });
    s += `<path d="M ${W / 2} ${fanY} L ${cx0 + stageColW / 2} ${fanY} L ${cx0 + stageColW / 2} ${idBoxY}" fill="none" stroke="${AZURE}" stroke-width="1.1" stroke-dasharray="3 3" marker-end="url(#arrow-${AZURE.replace('#', '')})"/>`;

    // Resource group
    const trigY = idBoxY + idBoxH + 14;
    const rgY = trigY + 26, rgH = 165;

    // Drawn BEFORE the trigger label below, so the label's opaque background
    // paints over the segment of this line it crosses — the line passes
    // visibly BEHIND the text instead of striking through its letters.
    s += `<path d="M ${cx0 + stageColW / 2} ${idBoxY + idBoxH} L ${cx0 + stageColW / 2} ${rgY}" fill="none" stroke="${AZURE}" stroke-width="1.1" marker-end="url(#arrow-${AZURE.replace('#', '')})"/>`;

    // Trigger semantics — the real approval gate on this free GitHub tier
    const auto = stage === 'dev';
    const trigText = auto ? 'Auto-deploys on push to dev' : 'workflow_dispatch only — human-triggered (approval gate)';
    s += `<rect x="${cx0 + 18}" y="${trigY - 8}" width="${trigText.length * 4.6}" height="14" fill="#fff"/>`;
    s += `<circle cx="${cx0 + 9}" cy="${trigY}" r="6" fill="${auto ? POS : SEC}"/>`;
    s += label(cx0 + 24, trigY + 5, trigText, { size: 7.4, fill: auto ? POS : SEC, weight: 700 });
    s += box(cx0, rgY, stageColW, rgH, { fill: '#fff', stroke: RULE, rx: 10 });
    s += iconFolder(cx0 + 12, rgY + 10, 1.0, INK2, '#f6f7fa');
    s += label(cx0 + 44, rgY + 22, `peaklogic-${stage}-rg`, { size: 9.6, weight: 700, family: 'mono' });
    s += label(cx0 + 12, rgY + 36, 'Resource group — created out-of-band by az group create, not by the pipeline itself', { size: 7, fill: INK3, weight: 500 });

    const svcIcons = [
      [iconFn, 'Functions'],
      [iconCylinder, 'PostgreSQL'],
      [iconCloud, 'IoT Hub'],
      [iconGateway, 'APIM'],
      [iconLock, 'Key Vault'],
    ];
    const iw = stageColW / svcIcons.length;
    svcIcons.forEach(([icon, name], j) => {
      const ix = cx0 + iw * j + iw / 2 - 10;
      s += icon(ix, rgY + 56, 0.85);
      s += label(cx0 + iw * j + iw / 2, rgY + 92, name, { size: 6.8, weight: 600, anchor: 'middle', fill: INK2 });
    });

    s += box(cx0 + 12, rgY + 108, stageColW - 24, 44, { fill: SEC_BG, stroke: SEC_BORDER, rx: 6 });
    s += iconLock(cx0 + 20, rgY + 116, 0.8, SEC, SEC_BG);
    s += label(cx0 + 44, rgY + 128, 'Cost Kill-Switch Function', { size: 8, weight: 700, fill: SEC });
    s += label(cx0 + 20, rgY + 142, 'Own least-privileged identity, scoped only to this RG\'s Postgres. Stops it at 100% of budget.', { size: 6.6, fill: SEC, weight: 500 });
  });

  // Deploy mechanics footnote, centered under the three stages
  const noteY = widY + 20 + 60 + 26 + 165 + 30;
  s += box(stagesStartX, noteY, stagesTotalW, 70, { fill: '#fbfaf7', stroke: RULE, rx: 8 });
  s += badge(stagesStartX + 17, noteY + 22, 'L', INK2);
  s += label(stagesStartX + 33, noteY + 22, 'Deploy mechanics — two steps, every stage', { size: 9.3, weight: 800 });
  s += wrapText(stagesStartX + 16, noteY + 40, '1. az deployment group create provisions/updates Azure resources from Bicep.   2. Azure/functions-action separately zip-deploys backend/\'s built code to the Function App. Neither step happens without the other on a fresh resource group.', stagesTotalW - 32, { size: 7.6 });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;background:#fff">${s}</svg>`;
}

function governancePage() {
  return `<section class="slide">
  <div class="kicker">Cloud governance &amp; subscription topology</div>
  <h1>How the Azure tenant itself is organised</h1>
  <p class="sub">A different question from pages 1–3: not how the application's data moves, but how the account, identity-for-deployment, and CI/CD path are structured. Single subscription today, one resource group per stage — matches this project's cost-conscious MVP posture everywhere else (documented in CLAUDE.md's Environments/Deployment Stages section).</p>
  <div class="diagram-frame">${governanceSvg()}</div>
  <p class="sub" style="margin-top:8px"><span class="tag tag--sec">Not deployed</span> No environment has been created yet — <code>peaklogic-{dev,staging,prod}-rg</code>, the Entra App Registrations, and the federated credentials are all still to-do, not running infrastructure. This page describes the designed target, same disclosure as pages 1–3.</p>
  <div class="foot"><span>PeakLogic &middot; Architecture Diagram v1.0 &middot; 2 August 2026</span><span>Page 4 of 4</span></div>
</section>`;
}

const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>PeakLogic — Low-Level Architecture</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter','Segoe UI',sans-serif; color: ${INK}; background: #fff; }
  .slide { width: 420mm; height: 236mm; padding: 10mm 16mm; page-break-after: always; position: relative; overflow: hidden; }
  .slide:last-child { page-break-after: auto; }
  .kicker { font-family: 'SF Mono','Cascadia Mono',Consolas,monospace; font-size: 10pt; letter-spacing: .2em; text-transform: uppercase; color: ${ACCENT}; }
  h1 { font-family: Georgia, 'Iowan Old Style', serif; font-weight: 400; font-size: 26pt; margin: 4px 0 2px; letter-spacing: -.01em; }
  .sub { color: ${INK3}; font-size: 10.5pt; max-width: 110ch; margin: 0 0 6px; }
  .diagram-frame { border: 1px solid ${RULE}; border-radius: 10px; overflow: hidden; margin-top: 6px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-top: 10px; }
  .card { border: 1px solid ${RULE}; border-radius: 8px; padding: 12px 14px; }
  .card h3 { margin: 0 0 6px; font-size: 11.5pt; }
  .card p { margin: 0; font-size: 9.3pt; color: ${INK2}; line-height: 1.45; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 8px; }
  th { text-align: left; font-size: 7.6pt; text-transform: uppercase; letter-spacing: .08em; color: ${INK3}; padding: 6px 8px; border-bottom: 1.5px solid ${INK}; }
  td { padding: 6px 8px; border-bottom: 1px solid ${RULE}; vertical-align: top; }
  .tag { display:inline-block; font-size:7.4pt; font-weight:700; padding:2px 7px; border-radius:3px; text-transform:uppercase; letter-spacing:.05em; }
  .tag--sec { background:${SEC_BG}; color:${SEC}; }
  .tag--az { background:${AZURE_BG}; color:${AZURE}; }
  .tag--pos { background:#e3f4ea; color:${POS}; }
  .foot { position: absolute; bottom: 6mm; left: 16mm; right: 16mm; display:flex; justify-content:space-between; font-size: 8pt; color: ${INK3}; border-top: 1px solid ${RULE}; padding-top: 6px; }
  @page { size: 420mm 236mm; margin: 0; }
</style></head>
<body>

<section class="slide">
  <div class="kicker">Low-level architecture &middot; confidential</div>
  <h1>PeakLogic platform — system &amp; data-flow diagram</h1>
  <p class="sub">Azure-native, multi-tenant. Every arrow below is a real data flow; every dashed boundary is an enforced isolation boundary, not an aspiration. Prepared for architectural and security review.</p>
  <div class="diagram-frame">${diagramSvg()}</div>
  <div class="foot"><span>PeakLogic &middot; Architecture Diagram v1.0 &middot; 2 August 2026</span><span>Page 1 of 4</span></div>
</section>

<section class="slide">
  <div class="kicker">Component &amp; icon key</div>
  <h1>Reading the diagram</h1>
  <p class="sub">A fixed vocabulary of shapes, used consistently, plus a lettered badge on every boundary — cross-referenced below — so a review conversation can say "look at E" instead of re-pointing at the screen. One honest limitation: these are hand-drawn analogues of the well-known Azure shapes, not Microsoft's own licensed icon set, which this document's build process has no way to embed.</p>
  <div class="cols">
    <div class="card"><h3>Boundaries</h3>
      <table>
        <tr><td style="width:70px"><svg width="60" height="30"><rect x="2" y="4" width="56" height="22" rx="6" fill="${EDGE_BG}" stroke="${EDGE_BORDER}" stroke-width="1.4" stroke-dasharray="5 3"/></svg></td><td><b>On-prem boundary</b> — the customer's own network. Nothing inside requires an inbound rule from the cloud.</td></tr>
        <tr><td><svg width="60" height="30"><rect x="2" y="4" width="56" height="22" rx="6" fill="${AZURE_BG}" stroke="#bcd6f2" stroke-width="1.4"/></svg></td><td><b>Azure tenant boundary</b> — every managed service PeakLogic operates.</td></tr>
        <tr><td><svg width="60" height="30"><rect x="2" y="4" width="56" height="22" rx="6" fill="#fff" stroke="${RULE}" stroke-width="1.4"/></svg></td><td><b>Private sub-boundary</b> — data layer (no public network access) and identity.</td></tr>
        <tr><td><svg width="60" height="30"><rect x="2" y="4" width="56" height="22" rx="6" fill="#fbfaf7" stroke="#e3c78a" stroke-width="1.4" stroke-dasharray="5 3"/></svg></td><td><b>External ownership boundary</b> — the partner's CMMS, a customer's own SCADA. Not part of the Azure tenant.</td></tr>
      </table>
    </div>
    <div class="card"><h3>Icons</h3>
      <table>
        <tr><td style="width:40px"><svg width="30" height="26">${iconGateway(2, 2, 1.15)}</svg></td><td><b>Gateway</b> — PeakLogic Hub, on-prem edge acquisition</td></tr>
        <tr><td><svg width="30" height="26">${iconCloud(2, 4, 0.85)}</svg></td><td><b>Managed cloud service</b> — Azure PaaS component</td></tr>
        <tr><td><svg width="30" height="26">${iconCylinder(6, 2, 1.1)}</svg></td><td><b>Database</b> — PostgreSQL Flexible Server</td></tr>
        <tr><td><svg width="30" height="26">${iconFn(4, 2, 1.0)}</svg></td><td><b>Serverless function</b> — Azure Functions</td></tr>
        <tr><td><svg width="30" height="26">${iconLock(6, 2, 1.05)}</svg></td><td><b>Security control</b> — identity, encryption, secrets</td></tr>
        <tr><td><svg width="30" height="26">${iconMonitor(2, 4, 1.0, POS, '#e3f4ea')}</svg></td><td><b>User-facing surface</b> — a portal or operator view</td></tr>
      </table>
    </div>
    <div class="card"><h3>Flow lines</h3>
      <table>
        <tr><td style="width:60px"><svg width="50" height="16"><line x1="2" y1="8" x2="46" y2="8" stroke="${AZURE}" stroke-width="1.8"/></svg></td><td><b>Solid</b> — telemetry / data write path, always active, one direction only</td></tr>
        <tr><td><svg width="50" height="16"><defs><marker id="lgd1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5 0 10z" fill="${AZURE}"/></marker></defs><line x1="6" y1="8" x2="44" y2="8" stroke="${AZURE}" stroke-width="1.4" stroke-dasharray="3 3" marker-end="url(#lgd1)" marker-start="url(#lgd1)"/></svg></td><td><b>Dashed, both ends arrowed</b> — a genuine request/response round trip (browser↔API, LAN path)</td></tr>
        <tr><td><svg width="50" height="16"><line x1="2" y1="8" x2="46" y2="8" stroke="${AZURE}" stroke-width="1.4" stroke-dasharray="3 3"/></svg></td><td><b>Dashed, one arrow</b> — a one-way check, e.g. token validation</td></tr>
        <tr><td><svg width="50" height="16"><line x1="2" y1="8" x2="46" y2="8" stroke="${POS}" stroke-width="1.4" stroke-dasharray="2 3"/></svg></td><td><b>Green dashed</b> — static-asset delivery (SPA hosting), distinct from API data calls</td></tr>
        <tr><td><svg width="50" height="16"><line x1="2" y1="8" x2="46" y2="8" stroke="${EXPORT}" stroke-width="1.4" stroke-dasharray="3 3"/></svg></td><td><b>Amber dashed</b> — export to a system the customer or partner already owns, deliberately one-way by design</td></tr>
        <tr><td><svg width="50" height="16"><line x1="24" y1="0" x2="24" y2="16" stroke="${SEC}" stroke-width="3"/></svg></td><td><b>Blocked stub</b> — a path that does not exist today (see Roadmap)</td></tr>
      </table>
    </div>
  </div>
  <div class="card" style="margin-top:14px">
    <h3>Domain reference</h3>
    <p class="sub" style="margin-bottom:8px">Every lettered badge on page 1, in one place.</p>
    <div class="cols" style="grid-template-columns:repeat(5,1fr)">
      ${[
        ['A', ACCENT, 'Customer site (on-prem)', 'Field equipment, PeakLogic Hub, LAN-served PeakView360'],
        ['B', AZURE, 'Microsoft Azure', 'The overall multi-tenant SaaS boundary — everything below is inside it except J'],
        ['C', AZURE, 'Device ingest', 'IoT Hub/DPS + Ingest Functions — provisioning and telemetry'],
        ['D', AZURE, 'API layer', 'API Management + API Functions — every portal request'],
        ['E', INK2, 'Data layer', 'PostgreSQL Flexible Server, RLS-forced, private endpoint'],
        ['F', INK2, 'Identity', 'Entra External ID (3 tenants) + Key Vault'],
        ['G', ACCENT, 'Operations', '16-agent team + App Insights/Log Analytics/Action Groups'],
        ['H', POS, 'Static hosting', 'Storage + CDN serving the built SPA bundle'],
        ['I', POS, 'Browser surfaces', 'Customer Portal, Partner Portal, Control Center, PeakView360'],
        ['J', EXPORT, 'External systems', "Partner's CMMS, customer's own SCADA — not PeakLogic's"],
      ]
        .map(
          ([l, c, t, d]) =>
            `<div style="font-size:8.6pt"><svg width="16" height="16" style="vertical-align:-3px"><circle cx="8" cy="8" r="7.5" fill="${c}"/><text x="8" y="11.5" font-family="Inter,sans-serif" font-size="9" font-weight="800" fill="#fff" text-anchor="middle">${l}</text></svg> <b>${t}</b><br><span style="color:${INK3}">${d}</span></div>`,
        )
        .join('')}
    </div>
  </div>
  <div class="foot"><span>PeakLogic &middot; Architecture Diagram v1.0 &middot; 2 August 2026</span><span>Page 2 of 4</span></div>
</section>

<section class="slide">
  <div class="kicker">Data flows &amp; security posture</div>
  <h1>What a reviewer should take away</h1>
  <table>
    <thead><tr><th>Flow</th><th>Path</th><th>Security control</th></tr></thead>
    <tbody>
      <tr><td><b>Telemetry ingest</b></td><td>Equipment → Hub → IoT Hub/DPS → Ingest Functions → PostgreSQL</td><td><span class="tag tag--sec">mTLS</span> per-device X.509 cert, outbound-only session, no inbound firewall rule ever required on the customer network. One direction only</td></tr>
      <tr><td><b>Operator / customer request</b></td><td>Browser ⇄ APIM ⇄ API Functions ⇄ PostgreSQL</td><td><span class="tag tag--az">Entra JWT</span> validated at APIM; every route wrapped in <code>withTenant()</code> / <code>withChannelPartner()</code> / <code>withStaffSession()</code>, which activates PostgreSQL row-level security. Genuine round trip — request and response</td></tr>
      <tr><td><b>Static asset delivery</b></td><td>Browser → Storage + CDN (Static Web Hosting)</td><td>Separate from the API path above — this serves the SPA's code, not its data. No auth gate needed; nothing here is tenant-scoped</td></tr>
      <tr><td><b>PeakView360 (embedded)</b></td><td>Portal iframe ⇄ Hub, direct over the site LAN, when opened on-site</td><td>Fail-closed scope guard — refuses to render if it holds no data for the requested site, rather than falling back to another site's facility. Two-way</td></tr>
      <tr><td><b>Agent operations</b></td><td>PostgreSQL event bus → Timer Functions → Action Groups (email) / audit log</td><td>Findings carry <code>tenant_id</code> and are RLS-scoped. Agents propose only — every action needs operator authorization, logged to that operator, never to the agent</td></tr>
      <tr><td><b>Work-order dispatch (export)</b></td><td>API Functions → <span class="tag tag--sec" style="background:#fdf3e2;color:#8a5205">Partner CMMS</span>, outbound only</td><td><code>advanceWorkOrderStage()</code> pushes ticket status through to the partner's own CMMS. Nothing in that system calls back into PeakLogic — the trust direction is one-way</td></tr>
      <tr><td><b>Telemetry export (optional)</b></td><td>Ingest Functions → <span class="tag tag--sec" style="background:#fdf3e2;color:#8a5205">Customer SCADA/Historian</span>, where one already exists</td><td>Normalized telemetry only, fed upward — PeakLogic instruments the long tail an existing SCADA cannot economically reach, it does not replace safety-rated control logic</td></tr>
      <tr><td><b>Command / actuation</b></td><td><span class="tag tag--sec">Not built</span></td><td>No code path publishes a device command today. The network model (outbound MQTT/TLS, per-device topic) already supports it; authorization, safety interlocks and audit trail are designed before any command path is opened</td></tr>
    </tbody>
  </table>

  <div class="cols" style="margin-top:16px">
    <div class="card"><h3>Tenant isolation</h3><p>Every tenant-scoped query runs inside a transaction that sets <code>app.current_tenant_id</code> via <code>set_config()</code>, activating PostgreSQL RLS — <b>forced</b>, not merely enabled, and with no <code>BYPASSRLS</code> role. A site outside a viewer's scope is refused, never approximated.</p></div>
    <div class="card"><h3>Deployment reality</h3><p>Defined in Bicep, validated by <code>az bicep build</code> and PSRule on every push. <span class="tag tag--sec">No environment deployed yet</span> — this diagram describes the architecture as designed and CI-validated, not a running production system.</p></div>
    <div class="card"><h3>Cost containment</h3><p>A dedicated Cost Kill-Switch Function (its own least-privileged identity, scoped only to the Postgres resource) stops the database at 100% of budget. Agents run on the existing consumption plan — additive spend is near $0.</p></div>
  </div>
  <div class="foot"><span>PeakLogic &middot; Architecture Diagram v1.0 &middot; 2 August 2026</span><span>Page 3 of 4</span></div>
</section>

${governancePage()}

</body></html>`;

writeFileSync(join(out, 'peaklogic-architecture-diagram.html'), body);
console.log('architecture diagram built');
