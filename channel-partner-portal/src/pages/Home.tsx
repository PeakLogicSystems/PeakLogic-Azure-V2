import { Link } from 'react-router-dom';
import { Activity, ChevronRight, MapPin, Radio, TicketCheck, TriangleAlert, Waves, Wrench } from 'lucide-react';
import { usePartner } from '@/PartnerContext';
import { kpis, siteById } from '@/data/types';
import { HealthPill, PriorityTag, TicketStatusTag } from '@/components/ui';

// The partner's home dashboard: every site/pool they service (across customers),
// fleet health at a glance, and open work. Reads the active partner's data + its
// vertical terminology.
export function Home() {
  const { partner, tickets } = usePartner();
  const k = kpis(partner);
  const open = tickets.filter((tk) => tk.status !== 'completed');
  const recent = open.slice(0, 5);
  const t = partner.terms;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Good morning, {partner.name}</h1>
        <p className="text-sm text-slate-500">{t.homeGreeting}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon={partner.vertical === 'pool' ? Waves : MapPin} label={t.sitePlural} value={k.sites} />
        <Kpi icon={Radio} label="Devices online" value={`${k.devicesOnline}/${k.devicesTotal}`} />
        <Kpi icon={Activity} label="Active alarms" value={k.activeAlarms} tone={k.activeAlarms ? 'warn' : 'ok'} />
        <Kpi icon={Wrench} label="Faults" value={k.faults} tone={k.faults ? 'warn' : 'ok'} />
        <Kpi icon={TicketCheck} label="Open tickets" value={open.length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t.sitesHeading}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {partner.sites.map((s) => {
              const online = s.devices.filter((d) => d.status === 'online').length;
              return (
                <Link key={s.id} to={`/sites/${s.id}`} className="group rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-partner-primary">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{s.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        <span className="capitalize">{s.kind}</span> · {s.location}
                      </p>
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
                      {s.hasFacility && <Waves size={14} className="text-partner-primary" aria-label={`${t.facilityNoun} built`} />}
                      <ChevronRight size={16} className="text-slate-400 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Open work</h2>
            <Link to="/tickets" className="text-xs font-medium text-partner-primary hover:underline">All tickets</Link>
          </div>
          <ul className="space-y-2">
            {recent.map((tk) => {
              const site = siteById(partner, tk.siteId);
              return (
                <li key={tk.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-400">{tk.id}</span>
                    <TicketStatusTag status={tk.status} />
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-800">{tk.title}</p>
                  <p className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span className="truncate">{site?.name}</span>
                    <PriorityTag priority={tk.priority} />
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
