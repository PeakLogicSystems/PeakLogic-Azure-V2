import { Link } from 'react-router-dom';
import { Activity, Boxes, ChevronRight, MapPin, Radio, TicketCheck, TriangleAlert, Wrench } from 'lucide-react';
import { kpis, openTickets, siteById, SITES } from '@/data/ace';
import { HealthPill, PriorityTag, TicketStatusTag } from '@/components/ui';

// The channel partner's home dashboard: every site they service (across their
// customers), fleet health at a glance, and their open work. Deep links into a
// site (devices, control, facility, tickets).
export function Home() {
  const k = kpis();
  const recent = openTickets().slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Good morning, Ace</h1>
        <p className="text-sm text-slate-500">Here's how your serviced sites are running right now.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon={MapPin} label="Sites" value={k.sites} />
        <Kpi icon={Radio} label="Devices online" value={`${k.devicesOnline}/${k.devicesTotal}`} />
        <Kpi icon={Activity} label="Active alarms" value={k.activeAlarms} tone={k.activeAlarms ? 'warn' : 'ok'} />
        <Kpi icon={Wrench} label="Faults" value={k.faults} tone={k.faults ? 'warn' : 'ok'} />
        <Kpi icon={TicketCheck} label="Open tickets" value={k.openTickets} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Sites */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Your sites</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SITES.map((s) => {
              const online = s.devices.filter((d) => d.status === 'online').length;
              return (
                <Link
                  key={s.id}
                  to={`/sites/${s.id}`}
                  className="group rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-partner-primary"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{s.name}</p>
                      <p className="truncate text-xs text-slate-500">{s.customer} · {s.location}</p>
                    </div>
                    <HealthPill health={s.health} />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-3">
                      <span>{online}/{s.devices.length} online</span>
                      {s.alarms > 0 && (
                        <span className="flex items-center gap-1 font-medium text-amber-600">
                          <TriangleAlert size={13} /> {s.alarms} alarm{s.alarms > 1 ? 's' : ''}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {s.hasFacility && <Boxes size={14} className="text-partner-primary" aria-label="Facility built" />}
                      <ChevronRight size={16} className="text-slate-400 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Recent tickets */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Open work</h2>
            <Link to="/tickets" className="text-xs font-medium text-partner-primary hover:underline">
              All tickets
            </Link>
          </div>
          <ul className="space-y-2">
            {recent.map((t) => {
              const site = siteById(t.siteId);
              return (
                <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-400">{t.id}</span>
                    <TicketStatusTag status={t.status} />
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-800">{t.title}</p>
                  <p className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span className="truncate">{site?.name}</span>
                    <PriorityTag priority={t.priority} />
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: string | number; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Icon size={14} /> {label}
      </div>
      <p className={`mt-1 text-2xl font-bold ${tone === 'warn' ? 'text-amber-600' : 'text-slate-900'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
    </div>
  );
}
