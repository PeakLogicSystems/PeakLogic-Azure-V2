import { useMemo, useState } from 'react';
import { ClipboardCheck, Sparkles, Wrench } from 'lucide-react';
import { computeAssets, type AssetHealth, type HealthStatus } from '../data/equipment';
import { seriesFor } from '../data/history';
import { Sparkline } from '../components/Sparkline';
import { usePeakViewData } from '../store';

// Equipment dashboard (surface #3, PV-4): per-asset live telemetry + trend, a
// PdM-style health score, a recommended action, and one-click creation of a CMMS
// work order from that recommendation. Assets are sorted worst-health-first so
// what needs attention is at the top.
const STATUS_TEXT: Record<HealthStatus, string> = {
  healthy: 'text-emerald-500',
  watch: 'text-amber-500',
  'at-risk': 'text-rose-500',
};
const STATUS_BAR: Record<HealthStatus, string> = {
  healthy: 'bg-emerald-500',
  watch: 'bg-amber-500',
  'at-risk': 'bg-rose-500',
};
const STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  'at-risk': 'At risk',
};

export function Equipment() {
  const { screen, values } = usePeakViewData();
  const assets = useMemo(() => computeAssets(screen.tiles, values), [screen.tiles, values]);

  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [workOrder, setWorkOrder] = useState<string | null>(null);
  const selected = assets.find((a) => a.asset === selectedAsset) ?? assets[0];

  const select = (asset: string) => {
    setSelectedAsset(asset);
    setWorkOrder(null);
  };

  const createWorkOrder = () => {
    const id = `WO-${Math.floor(1000 + Math.random() * 9000)}`;
    setWorkOrder(id);
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Equipment</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Per-asset health, telemetry, and predictive maintenance</p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Asset list — worst health first */}
        <div className="w-full shrink-0 lg:w-72">
          <ul className="space-y-1.5">
            {assets.map((a) => (
              <li key={a.asset}>
                <button
                  onClick={() => select(a.asset)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    selected?.asset === a.asset
                      ? 'border-brand-purple-mid bg-brand-purple-soft/40 dark:border-brand-purple dark:bg-brand-purple/15'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{a.asset}</span>
                    <span className={`nums text-sm font-bold ${STATUS_TEXT[a.status]}`}>{a.score}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{a.category}</span>
                    <span className={`text-[11px] font-medium ${STATUS_TEXT[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <span className={`block h-full rounded-full ${STATUS_BAR[a.status]}`} style={{ width: `${a.score}%` }} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Selected asset detail */}
        {selected && <AssetDetail asset={selected} values={values} workOrder={workOrder} onCreateWorkOrder={createWorkOrder} />}
      </div>
    </div>
  );
}

function AssetDetail({
  asset,
  values,
  workOrder,
  onCreateWorkOrder,
}: {
  asset: AssetHealth;
  values: ReturnType<typeof usePeakViewData>['values'];
  workOrder: string | null;
  onCreateWorkOrder: () => void;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-4">
      {/* Header + health */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{asset.asset}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {asset.category} · {asset.runtimeHours.toLocaleString()} run-hours · last serviced {asset.lastServiceDays} d ago
            </p>
          </div>
          <div className="text-right">
            <p className={`nums text-3xl font-bold ${STATUS_TEXT[asset.status]}`}>{asset.score}</p>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Health · {STATUS_LABEL[asset.status]}</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <span className={`block h-full rounded-full ${STATUS_BAR[asset.status]}`} style={{ width: `${asset.score}%` }} />
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
          <Sparkles size={11} className="text-brand-purple-mid" /> PdM health score — AI-derived (preview)
        </p>
      </div>

      {/* Live telemetry + trend */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Telemetry · last 24 h
        </h3>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {asset.metrics.map((t) => {
            const pv = values[t.metric];
            const offline = !pv || pv.state === 'offline' || Number.isNaN(pv.value);
            const spark = seriesFor(t.metric, '24h').slice(-30);
            return (
              <li key={t.metric} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{t.label}</p>
                  <p className="text-[11px] text-slate-400">{t.metric}</p>
                </div>
                <div className="flex items-center gap-4">
                  {!offline && <Sparkline data={spark} color="#8B5CF6" />}
                  <span className="nums w-24 text-right text-base font-semibold text-slate-900 dark:text-white">
                    {offline ? <span className="text-status-offline">— offline</span> : `${pv!.value}${t.unit ? ` ${t.unit}` : ''}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Recommended action + one-click work order */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Wrench size={13} /> Recommended action
        </h3>
        <p className="text-sm text-slate-700 dark:text-slate-200">{asset.recommendation}</p>

        {workOrder ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
            <ClipboardCheck size={16} className="mt-0.5 shrink-0" />
            <span>
              Work order <span className="font-semibold">{workOrder}</span> drafted for {asset.asset}.
              <span className="text-emerald-700/70 dark:text-emerald-400/70"> Preview — not sent to a CMMS.</span>
            </span>
          </div>
        ) : (
          <button
            onClick={onCreateWorkOrder}
            disabled={asset.status === 'healthy'}
            className="mt-3 flex items-center gap-1.5 rounded-lg bg-brand-purple px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-purple-mid disabled:cursor-not-allowed disabled:opacity-40"
            title={asset.status === 'healthy' ? 'No action needed' : 'Draft a CMMS work order from this recommendation'}
          >
            <Wrench size={15} /> Create work order
          </button>
        )}
      </div>
    </div>
  );
}
