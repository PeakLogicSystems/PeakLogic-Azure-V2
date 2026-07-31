import { useMemo, useState } from 'react';
import { Boxes, CircleHelp, Compass, Hammer, RotateCcw, RotateCw } from 'lucide-react';
import {
  boxCorners,
  facilityForSite,
  FACES,
  projectPoint,
  SENSOR_TYPE_META,
  SENSOR_TYPE_OF,
  STATE_COLOR,
  unitState,
  type Facility,
  type FacilityView as ViewMode,
  type FacilityUnit,
  type P2,
  type SensorType,
} from '../data/facility';
import { ProcessTile } from '../components/ProcessTile';
import { usePeakViewData } from '../store';
import type { ProcessValue } from '../types';

const VW = 920;
const VH = 470;
const PAD = 48;

interface Pt {
  x: number;
  y: number;
}

const VIEWS: { key: ViewMode; label: string }[] = [
  { key: 'iso', label: 'Isometric' },
  { key: 'top', label: 'Top' },
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
];

// Facility View (PV-1 + PV-5, merged): the one operator landing page — live
// process tiles (formerly the standalone Operator screen) alongside the plant
// view for a site that has a saved facility. Interactive isometric scene +
// Top/Front/Side orthographic views + rotation + locate-live-sensors-by-type.
// A lightweight SVG projection (no 3D engine yet); full-fidelity 3D and the
// Facility Builder authoring tool are roadmapped. A site without a saved
// facility still gets its live tiles — only the plant-view section falls
// back to an empty state, not the whole page.
export function FacilityView() {
  const { site, screen, values } = usePeakViewData();
  const facility = facilityForSite(site.id);

  const [view, setView] = useState<ViewMode>('iso');
  const [rot, setRot] = useState(0);
  const [sensorType, setSensorType] = useState<SensorType | null>(null);

  const metricMeta = useMemo(
    () => Object.fromEntries(screen.tiles.map((t) => [t.metric, { label: t.label, unit: t.unit }])),
    [screen.tiles],
  );

  const scene = useMemo(() => (facility ? buildScene(facility, view, rot) : null), [facility, view, rot]);

  const canRotate = view === 'iso' || view === 'top';
  const typesPresent = facility ? sensorTypesIn(facility) : [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Facility View</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{screen.name} · live from the on-site Hub</p>
        </div>
        <a
          href={`#/help/${screen.helpContextKey}`}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-brand-purple-mid hover:text-brand-purple-mid dark:border-slate-700 dark:text-slate-300"
          title="Open the PeakAssist guide for this screen"
        >
          <CircleHelp size={15} /> Screen help
        </a>
      </div>

      {/* Live process tiles (merged from the former Operator screen) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {screen.tiles.map((tile) => (
          <ProcessTile key={tile.id} tile={tile} pv={values[tile.metric]} />
        ))}
      </div>

      {/* Plant view */}
      <div className="mt-6">
        {facility && scene ? (
          <>
            <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">{facility.name}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Plant view</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                  {VIEWS.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => setView(v.key)}
                      className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                        view === v.key ? 'bg-brand-purple text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setRot((r) => r - 1)}
                  disabled={!canRotate}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-brand-purple-mid disabled:opacity-30 dark:border-slate-700"
                  title="Rotate left"
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  onClick={() => setRot((r) => r + 1)}
                  disabled={!canRotate}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-brand-purple-mid disabled:opacity-30 dark:border-slate-700"
                  title="Rotate right"
                >
                  <RotateCw size={16} />
                </button>
              </div>
            </header>

            {/* Locate sensors by type */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Compass size={13} /> Locate sensors
              </span>
              <button
                onClick={() => setSensorType(null)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${sensorType === null ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}
              >
                All
              </button>
              {typesPresent.map((t) => (
                <button
                  key={t}
                  onClick={() => setSensorType((cur) => (cur === t ? null : t))}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
                  style={{
                    color: SENSOR_TYPE_META[t].color,
                    backgroundColor: sensorType === t ? `${SENSOR_TYPE_META[t].color}22` : 'transparent',
                    boxShadow: `inset 0 0 0 1px ${SENSOR_TYPE_META[t].color}55`,
                  }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SENSOR_TYPE_META[t].color }} />
                  {SENSOR_TYPE_META[t].label}
                </button>
              ))}
            </div>

            <div className="flex min-h-[380px] flex-col gap-4 lg:flex-row">
              {/* Scene */}
              <div className="min-h-[320px] flex-1 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 dark:border-slate-800 dark:from-slate-900/60 dark:to-slate-950/60">
                <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" role="img" aria-label="Facility plant view">
                  {scene.pipes.map((p, i) => (
                    <line
                      key={i}
                      x1={p.a.x}
                      y1={p.a.y}
                      x2={p.b.x}
                      y2={p.b.y}
                      stroke={p.kind === 'air' ? '#38BDF8' : '#94A3B8'}
                      strokeWidth={p.kind === 'air' ? 2 : 3.5}
                      strokeDasharray={p.kind === 'air' ? '5 4' : undefined}
                      strokeLinecap="round"
                      opacity={0.7}
                    />
                  ))}
                  {scene.units.map((u) => (
                    <UnitGraphic key={u.unit.id} u={u} view={view} values={values} metricMeta={metricMeta} sensorType={sensorType} />
                  ))}
                </svg>
              </div>

              {/* Locate panel */}
              <SensorPanel facility={facility} values={values} metricMeta={metricMeta} sensorType={sensorType} />
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Preview plant view (SVG projection). Full-fidelity 3D and the Facility Builder authoring tool are
              roadmapped — see <span className="font-medium">facility-builder-roadmap.md</span>.
            </p>
          </>
        ) : (
          <EmptyState />
        )}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        PeakView360 visualizes and supervises — it never issues safety-rated control. Setpoints and interlocks remain
        in the plant's certified control system.
      </p>
    </div>
  );
}

// ── scene construction ───────────────────────────────────────────────────────

interface UnitGeom {
  unit: FacilityUnit;
  faces: { pts: Pt[]; kind: 'top' | 'side' | 'bottom' }[];
  rect: { x: number; y: number; w: number; h: number };
  anchor: Pt;
  depth: number;
}

function buildScene(facility: Facility, view: ViewMode, rot: number) {
  const c = facility.center;
  const all: P2[] = [];
  for (const u of facility.units) for (const cor of boxCorners(u)) all.push(projectPoint(cor.x, cor.y, cor.z, view, rot, c));
  const tf = makeFit(all);

  const units: UnitGeom[] = facility.units
    .map((u) => {
      const proj = boxCorners(u).map((p) => tf(projectPoint(p.x, p.y, p.z, view, rot, c)));
      const faces = FACES.map((f, idx) => ({
        pts: f.map((i) => proj[i]),
        depth: f.reduce((s, i) => s + proj[i].y, 0) / f.length,
        kind: (idx === 1 ? 'top' : idx === 0 ? 'bottom' : 'side') as 'top' | 'side' | 'bottom',
      }))
        .sort((a, b) => a.depth - b.depth)
        .map(({ pts, kind }) => ({ pts, kind }));
      const xs = proj.map((p) => p.x);
      const ys = proj.map((p) => p.y);
      const rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      const anchor = tf(projectPoint(u.x, u.h, u.z, view, rot, c));
      const depth = tf(projectPoint(u.x, 0, u.z, view, rot, c)).y;
      return { unit: u, faces, rect, anchor, depth };
    })
    .sort((a, b) => a.depth - b.depth); // far first (painter's)

  const byId = Object.fromEntries(facility.units.map((u) => [u.id, u]));
  const pipes = facility.pipes.map((p) => {
    const f = byId[p.from];
    const t = byId[p.to];
    return {
      kind: p.kind ?? 'flow',
      a: tf(projectPoint(f.x, Math.min(f.h * 0.4, 2), f.z, view, rot, c)),
      b: tf(projectPoint(t.x, Math.min(t.h * 0.4, 2), t.z, view, rot, c)),
    };
  });

  return { units, pipes };
}

function makeFit(points: P2[]): (p: P2) => Pt {
  const xs = points.map((p) => p.sx);
  const ys = points.map((p) => p.sy);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const scale = Math.min((VW - 2 * PAD) / w, (VH - 2 * PAD) / h);
  const ox = PAD + (VW - 2 * PAD - w * scale) / 2 - minX * scale;
  const oy = PAD + (VH - 2 * PAD - h * scale) / 2 - minY * scale;
  return (p) => ({ x: p.sx * scale + ox, y: p.sy * scale + oy });
}

// ── rendering ────────────────────────────────────────────────────────────────

function UnitGraphic({
  u,
  view,
  values,
  metricMeta,
  sensorType,
}: {
  u: UnitGeom;
  view: ViewMode;
  values: Record<string, ProcessValue>;
  metricMeta: Record<string, { label: string; unit: string }>;
  sensorType: SensorType | null;
}) {
  const state = unitState(u.unit, values);
  const color = STATE_COLOR[state];
  const types = unitSensorTypes(u.unit);
  const hosts = sensorType ? types.includes(sensorType) : true;
  const dim = sensorType != null && !hosts;

  const primaryMetric = u.unit.metrics[0];
  const pv = primaryMetric ? values[primaryMetric] : undefined;
  const offline = !pv || pv.state === 'offline' || Number.isNaN(pv?.value ?? NaN);
  const unit = primaryMetric ? metricMeta[primaryMetric]?.unit ?? '' : '';
  const valueText = !primaryMetric ? '' : offline ? '—' : `${pv!.value}${unit ? ` ${unit}` : ''}`;

  const toPts = (pts: Pt[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const { x: ax, y: ay } = u.anchor;

  return (
    <g opacity={dim ? 0.22 : 1}>
      {view === 'iso' ? (
        u.faces
          .filter((f) => f.kind !== 'bottom')
          .map((f, i) => (
            <polygon
              key={i}
              points={toPts(f.pts)}
              fill={color}
              fillOpacity={f.kind === 'top' ? 0.9 : 0.55 + (i % 2) * 0.08}
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.9}
              strokeLinejoin="round"
            />
          ))
      ) : (
        <rect x={u.rect.x} y={u.rect.y} width={u.rect.w} height={u.rect.h} rx={4} fill={color} fillOpacity={0.5} stroke={color} strokeWidth={1.5} />
      )}

      {sensorType && hosts && <circle cx={ax} cy={ay} r={13} fill="none" stroke={SENSOR_TYPE_META[sensorType].color} strokeWidth={2} className="fault-pulse" />}

      {types.map((t, i) => (
        <circle key={t} cx={ax + (i - (types.length - 1) / 2) * 11} cy={ay - 4} r={3.5} fill={SENSOR_TYPE_META[t].color} stroke="#0B1120" strokeWidth={0.75} />
      ))}

      <text x={ax} y={ay - 20} textAnchor="middle" className="fill-slate-700 dark:fill-slate-200" fontSize={12} fontWeight={600}>
        {u.unit.label}
      </text>
      {valueText && (
        <text x={ax} y={ay - 34} textAnchor="middle" className="fill-slate-900 dark:fill-white nums" fontSize={13} fontWeight={700}>
          {valueText}
        </text>
      )}
    </g>
  );
}

function SensorPanel({
  facility,
  values,
  metricMeta,
  sensorType,
}: {
  facility: Facility;
  values: Record<string, ProcessValue>;
  metricMeta: Record<string, { label: string; unit: string }>;
  sensorType: SensorType | null;
}) {
  const rows = facility.units.flatMap((u) =>
    u.metrics
      .filter((m) => (sensorType ? SENSOR_TYPE_OF[m] === sensorType : true))
      .map((m) => ({ unit: u.label, metric: m, pv: values[m], meta: metricMeta[m] })),
  );

  return (
    <div className="w-full shrink-0 lg:w-64">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {sensorType ? `${SENSOR_TYPE_META[sensorType].label} sensors` : 'All sensors'} · {rows.length}
      </p>
      <ul className="space-y-1">
        {rows.map((r) => {
          const t = SENSOR_TYPE_OF[r.metric];
          const offline = !r.pv || r.pv.state === 'offline' || Number.isNaN(r.pv?.value ?? NaN);
          return (
            <li key={`${r.unit}-${r.metric}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SENSOR_TYPE_META[t].color }} />
                <span className="min-w-0">
                  <span className="block truncate text-slate-700 dark:text-slate-200">{r.meta?.label ?? r.metric}</span>
                  <span className="block truncate text-[11px] text-slate-400">{r.unit}</span>
                </span>
              </span>
              <span className="nums shrink-0 font-semibold text-slate-900 dark:text-white">
                {offline ? <span className="text-status-offline">offline</span> : `${r.pv!.value}${r.meta?.unit ? ` ${r.meta.unit}` : ''}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 p-8 dark:border-slate-700">
      <div className="max-w-md text-center">
        <Boxes size={28} className="mx-auto text-brand-purple-mid" />
        <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">No Facility View for this site yet</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Build one in the <span className="font-medium">Facility Builder</span> — the first step of site setup — to get a
          live plant view here. It's optional: you can run the site without it.
        </p>
        <button
          disabled
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-purple px-3 py-1.5 text-sm font-semibold text-white opacity-50"
          title="Facility Builder is roadmapped"
        >
          <Hammer size={15} /> Open Facility Builder
        </button>
        <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">Roadmapped</p>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function unitSensorTypes(u: FacilityUnit): SensorType[] {
  return [...new Set(u.metrics.map((m) => SENSOR_TYPE_OF[m]).filter(Boolean))] as SensorType[];
}

function sensorTypesIn(f: Facility): SensorType[] {
  return [...new Set(f.units.flatMap((u) => unitSensorTypes(u)))];
}
