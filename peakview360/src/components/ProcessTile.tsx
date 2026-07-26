import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ProcessValue, Tile } from '../types';

// A single process-value tile (PV-1): the metric label, the live engineering
// value (tabular so it doesn't jitter), the equipment state encoded as a color
// stripe + pill, and a trend indicator. State reads at a glance from form and
// color, not just number — the point of an operator screen.
const STATE_STRIPE: Record<ProcessValue['state'], string> = {
  running: 'bg-status-running',
  fault: 'bg-status-fault',
  offline: 'bg-status-offline',
};

const STATE_PILL: Record<ProcessValue['state'], string> = {
  running: 'text-status-running bg-status-running/10 ring-status-running/30',
  fault: 'text-status-fault bg-status-fault/10 ring-status-fault/30',
  offline: 'text-status-offline bg-status-offline/10 ring-status-offline/30',
};

const STATE_LABEL: Record<ProcessValue['state'], string> = {
  running: 'Running',
  fault: 'Fault',
  offline: 'Offline',
};

export function ProcessTile({ tile, pv }: { tile: Tile; pv: ProcessValue | undefined }) {
  const state = pv?.state ?? 'offline';
  const offline = state === 'offline' || pv === undefined || Number.isNaN(pv?.value ?? NaN);

  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl border p-4',
        'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70',
        state === 'fault' ? 'fault-pulse' : '',
      ].join(' ')}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${STATE_STRIPE[state]}`} />

      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {tile.label}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${STATE_PILL[state]}`}>
          {STATE_LABEL[state]}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="nums text-3xl font-bold text-slate-900 dark:text-white">
          {offline ? '—' : formatValue(pv!.value)}
        </span>
        {tile.unit && !offline && (
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{tile.unit}</span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="truncate text-slate-500 dark:text-slate-400">{tile.asset}</span>
        {!offline && <Trend delta={pv!.trend} />}
        {offline && <span className="text-status-offline">no data · 5m+</span>}
      </div>
    </div>
  );
}

function Trend({ delta }: { delta: number }) {
  const flat = Math.abs(delta) < 0.05;
  if (flat) return <span className="flex items-center gap-0.5 text-slate-400"><Minus size={13} /> steady</span>;
  const up = delta > 0;
  return (
    <span className={`flex items-center gap-0.5 ${up ? 'text-emerald-500' : 'text-sky-500'}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      <span className="nums">{Math.abs(delta) >= 10 ? Math.abs(delta).toFixed(0) : Math.abs(delta).toFixed(1)}</span>
    </span>
  );
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
