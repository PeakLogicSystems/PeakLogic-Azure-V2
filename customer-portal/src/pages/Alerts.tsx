import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { CUSTOMER, siteById, type Alert } from '@/data';
import { SeverityRail } from '@/components/ui';

export function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>(() => CUSTOMER.alerts.map((a) => ({ ...a })));
  const [showAcked, setShowAcked] = useState(true);
  const acknowledge = (id: string) => setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  const rows = showAcked ? alerts : alerts.filter((a) => !a.acknowledged);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Alerts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Active and recent alerts across your sites.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <input type="checkbox" checked={showAcked} onChange={(e) => setShowAcked(e.target.checked)} className="accent-brand-purple" />
          Show acknowledged
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <CheckCircle2 size={16} className="text-emerald-500" /> Nothing to show.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => {
            const site = siteById(a.siteId);
            return (
              <li key={a.id} className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 pl-4 dark:border-slate-800 dark:bg-slate-900 ${a.acknowledged ? 'opacity-60' : ''}`}>
                <SeverityRail severity={a.severity} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{a.message}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className={`font-semibold uppercase ${a.severity === 'critical' ? 'text-rose-600 dark:text-rose-400' : a.severity === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400'}`}>{a.severity}</span>
                      {' · '}
                      {a.asset}
                      {site && <> · <Link to={`/sites/${a.siteId}`} className="text-brand-purple-mid hover:underline">{site.name}</Link></>}
                    </p>
                  </div>
                  {a.acknowledged ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-500"><CheckCircle2 size={13} /> Acked</span>
                  ) : (
                    <button onClick={() => acknowledge(a.id)} className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white">
                      Acknowledge
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
