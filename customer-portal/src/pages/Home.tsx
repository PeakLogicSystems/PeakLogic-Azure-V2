import { Link } from 'react-router-dom';
import { Activity, ChevronRight, FileText, MapPin, Radio, Wrench } from 'lucide-react';
import { CUSTOMER, kpis } from '@/data';
import { HealthPill, SeverityRail } from '@/components/ui';

export function Home() {
  const k = kpis();
  const recent = CUSTOMER.alerts.slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Welcome back, {CUSTOMER.user.name}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{CUSTOMER.name} · here's how your sites are running.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={MapPin} label="Sites" value={k.sites} />
        <Kpi icon={Radio} label="Devices online" value={`${k.devicesOnline}/${k.devicesTotal}`} />
        <Kpi icon={Activity} label="Active alerts" value={k.activeAlerts} tone={k.activeAlerts ? 'warn' : 'ok'} />
        <Kpi icon={FileText} label="Reports due" value={k.reportsDue} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your sites</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CUSTOMER.sites.map((s) => {
              const online = s.devices.filter((d) => d.status === 'online').length;
              return (
                <Link key={s.id} to={`/sites/${s.id}`} className="group rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-purple-mid dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900 dark:text-white">{s.name}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{s.location}</p>
                    </div>
                    <HealthPill health={s.health} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{online}/{s.devices.length} devices online</span>
                    <ChevronRight size={16} className="text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recent alerts</h2>
              <Link to="/alerts" className="text-xs font-medium text-brand-purple-mid hover:underline">All alerts</Link>
            </div>
            <ul className="space-y-2">
              {recent.map((a) => (
                <li key={a.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 pl-4 dark:border-slate-800 dark:bg-slate-900">
                  <SeverityRail severity={a.severity} />
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{a.message}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{a.asset} · {timeAgo(a.minutesAgo)}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* service provider */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Wrench size={14} /> Serviced by
            </div>
            <p className="mt-1 font-semibold text-slate-900 dark:text-white">{CUSTOMER.provider}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your maintenance provider since {CUSTOMER.providerSince}. Alarms auto-dispatch work orders to their crew.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: string | number; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Icon size={14} /> {label}
      </div>
      <p className={`mt-1 text-2xl font-bold ${tone === 'warn' ? 'text-amber-600 dark:text-amber-500' : 'text-slate-900 dark:text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
    </div>
  );
}

function timeAgo(min: number): string {
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
