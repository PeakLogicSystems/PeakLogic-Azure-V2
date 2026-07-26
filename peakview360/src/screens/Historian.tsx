import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { RANGES, seriesFor, timestamps, type RangeKey } from '../data/history';
import { usePeakViewData } from '../store';
import type { Tile } from '../types';

// The Historian (surface #5, PV-3): a multi-pen trend over historical telemetry.
// A "pen" is a traced variable (the strip-chart-recorder heritage every process
// historian keeps). Pens carry different units and magnitudes (flow ~1180 L/min
// vs pH ~7.4), so each is AUTO-SCALED to its own range in the window — the
// standard historian "scaled" view — and the tooltip shows real engineering
// values. History comes from the cloud (dual-source, §3.1); CSV export included.

// Stable pen colors, assigned by the metric's position in the screen.
const PALETTE = ['#7C3AED', '#22C55E', '#F59E0B', '#3B82F6', '#EF4444', '#14B8A6', '#EC4899', '#F97316'];

interface PenMeta {
  metric: string;
  label: string;
  unit: string;
  color: string;
  last: number;
}

export function Historian() {
  const { screen } = usePeakViewData();
  const pens = screen.tiles;
  const colorOf = useMemo(
    () => Object.fromEntries(pens.map((t, i) => [t.metric, PALETTE[i % PALETTE.length]])),
    [pens],
  );

  const [range, setRange] = useState<RangeKey>('24h');
  const [active, setActive] = useState<string[]>(['flow_lpm', 'ph', 'free_chlorine_ppm']);

  const { rows, meta } = useMemo(() => buildSeries(pens, active, range, colorOf), [pens, active, range, colorOf]);

  const toggle = (metric: string) =>
    setActive((prev) => (prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]));

  return (
    <div className="flex h-full flex-col">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Historian</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Multi-pen trend · history from the cloud · auto-scaled per pen
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  range === r.key
                    ? 'bg-brand-purple text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => exportCsv(rows, meta, range)}
            disabled={meta.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-brand-purple-mid hover:text-brand-purple-mid disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            <Download size={15} /> Export CSV
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Pen selector */}
        <div className="w-full shrink-0 lg:w-56">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Pens
          </p>
          <ul className="space-y-1">
            {pens.map((t) => (
              <PenToggle key={t.metric} tile={t} color={colorOf[t.metric]} on={active.includes(t.metric)} onToggle={() => toggle(t.metric)} />
            ))}
          </ul>
        </div>

        {/* Chart */}
        <div className="min-h-[280px] flex-1 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
          {meta.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Select one or more pens to trend.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#64748b" strokeOpacity={0.18} />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t: number) => fmtTick(t, range)}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  stroke="#94a3b8"
                  minTickGap={40}
                />
                <YAxis domain={[0, 1]} hide />
                <Tooltip
                  isAnimationActive={false}
                  content={(props: unknown) => <HistTooltip {...(props as HistTooltipInjected)} pens={meta} />}
                />
                {meta.map((pm) => (
                  <Line
                    key={pm.metric}
                    type="monotone"
                    dataKey={`${pm.metric}__n`}
                    stroke={pm.color}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Pens are auto-scaled to their own range in this window (mixed units) — hover for actual engineering values.
      </p>
    </div>
  );
}

function PenToggle({ tile, color, on, onToggle }: { tile: Tile; color: string; on: boolean; onToggle: () => void }) {
  return (
    <li>
      <button
        onClick={onToggle}
        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${
          on
            ? 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
            : 'border-transparent opacity-55 hover:opacity-100'
        }`}
      >
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: on ? color : 'transparent', boxShadow: `inset 0 0 0 2px ${color}` }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-700 dark:text-slate-200">{tile.label}</span>
          <span className="block truncate text-[11px] text-slate-400">{tile.metric}{tile.unit ? ` · ${tile.unit}` : ''}</span>
        </span>
      </button>
    </li>
  );
}

interface HistTooltipInjected {
  active?: boolean;
  label?: number;
  payload?: Array<{ payload: Record<string, number> }>;
}

function HistTooltip({ active, payload, pens }: HistTooltipInjected & { pens: PenMeta[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <p className="mb-1 font-semibold text-slate-500 dark:text-slate-400">{new Date(row.t).toLocaleString()}</p>
      <ul className="space-y-0.5">
        {pens.map((pm) => (
          <li key={pm.metric} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pm.color }} />
              <span className="text-slate-600 dark:text-slate-300">{pm.label}</span>
            </span>
            <span className="nums font-semibold text-slate-900 dark:text-white">
              {row[pm.metric]}
              {pm.unit ? ` ${pm.unit}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildSeries(pens: Tile[], active: string[], range: RangeKey, colorOf: Record<string, string>) {
  const ts = timestamps(range);
  const raw: Record<string, number[]> = {};
  const bounds: Record<string, { min: number; max: number }> = {};
  for (const m of active) {
    const s = seriesFor(m, range);
    raw[m] = s;
    bounds[m] = { min: Math.min(...s), max: Math.max(...s) };
  }

  const rows = ts.map((t, i) => {
    const row: Record<string, number> = { t };
    for (const m of active) {
      row[m] = raw[m][i];
      const { min, max } = bounds[m];
      row[`${m}__n`] = max > min ? (raw[m][i] - min) / (max - min) : 0.5;
    }
    return row;
  });

  const meta: PenMeta[] = active.map((m) => {
    const tile = pens.find((t) => t.metric === m)!;
    return { metric: m, label: tile.label, unit: tile.unit, color: colorOf[m], last: raw[m][raw[m].length - 1] };
  });

  return { rows, meta };
}

function fmtTick(t: number, range: RangeKey): string {
  const d = new Date(t);
  return range === '24h'
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

function exportCsv(rows: Record<string, number>[], meta: PenMeta[], range: RangeKey) {
  const header = ['time_iso', ...meta.map((m) => `${m.metric}${m.unit ? `_${m.unit}` : ''}`)];
  const lines = rows.map((r) => [new Date(r.t).toISOString(), ...meta.map((m) => r[m.metric])].join(','));
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `peakview360-historian-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
