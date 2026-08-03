import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Archive, CheckCircle2, ChevronRight, Hammer, PencilRuler, Plus, SlidersHorizontal } from 'lucide-react';
import { usePartner } from '@/PartnerContext';
import { siteById, type Device } from '@/data/types';
import { DecommissionedTable } from '@/components/DecommissionedTable';
import { DeviceStatusDot, HealthPill } from '@/components/ui';
import { DeviceDetail } from '@/components/DeviceDetail';
import { TicketRow } from '@/components/TicketRow';
import { PoolFacility } from '@/components/PoolFacility';
import { PlantFacility } from '@/components/PlantFacility';
import { PeakViewEmbed } from '@/components/PeakViewEmbed';


export function SiteDetail() {
  const { partner, tickets, updateTicket, hubs } = usePartner();
  const { siteId = '' } = useParams();
  const navigate = useNavigate();
  const site = siteById(partner, siteId);
  const t = partner.terms;
  const retired = useMemo(
    () => hubs.filter((h) => h.state === 'decommissioned' && h.siteId === siteId),
    [hubs, siteId],
  );

  const [devices, setDevices] = useState<Device[]>(() => site?.devices.map((d) => ({ ...d })) ?? []);
  const [selected, setSelected] = useState<Device | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const siteTickets = useMemo(() => tickets.filter((tk) => tk.siteId === siteId), [tickets, siteId]);

  if (!site) {
    return (
      <div className="py-16 text-center text-slate-500 dark:text-slate-400">
        Not found. <Link to="/" className="text-partner-primary hover:underline">Back to home</Link>
      </div>
    );
  }

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const issueCommand = (running: boolean) => {
    if (!selected) return;
    setDevices((prev) => prev.map((d) => (d.id === selected.id ? { ...d, running, reading: running ? d.reading ?? '—' : 'idle' } : d)));
    flash(`Command queued for ${selected.name} → ${running ? 'START' : 'STOP'} (preview — authorization gate not enabled).`);
    setSelected(null);
  };

  const secondaryBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600';
  const heading = 'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">
        <ArrowLeft size={16} /> All {t.sitePlural.toLowerCase()}
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{site.name}</h1>
          <HealthPill health={site.health} />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          <span className="capitalize">{site.kind}</span> · {site.customer} · {site.location}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to={`/sites/${site.id}/provision`} className={secondaryBtn}>
          <Plus size={15} /> Provision device
        </Link>
      </div>

      <PeakViewEmbed site={site} />

      {/* The static layout — shown ONLY where there is no Hub, because there it
          is the only picture of the equipment there is.

          With a Hub, the live Facility View above IS the facility, and repeating
          the same pad with the same readings underneath it was pure redundancy.
          The Facility Builder stays reachable either way: its button lives in
          the Live View header on every site, with or without a Hub. */}
      {!site.peakview && (
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className={heading}>{t.facilityNoun}</h2>
          <button onClick={() => navigate(`/sites/${site.id}/facility`)} className={secondaryBtn}>
            <PencilRuler size={15} /> {site.hasFacility ? 'Edit in Facility Builder' : t.facilityBuild}
          </button>
        </div>
        {site.hasFacility ? (
          partner.vertical === 'pool' ? <PoolFacility site={site} /> : <PlantFacility site={site} />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <Hammer size={24} className="mx-auto text-partner-primary" />
            <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-white">
              No {t.facilityNoun.toLowerCase()} built for this {t.siteSingular.toLowerCase()} yet
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
              Use the Facility Builder to lay it out and bind each element to its live devices. It's optional — you
              can monitor and service this {t.siteSingular.toLowerCase()} without it.
            </p>
            <button
              onClick={() => navigate(`/sites/${site.id}/facility`)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--partner-primary)' }}
            >
              <Hammer size={14} /> Open Facility Builder
            </button>
          </div>
        )}
      </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={heading}>Devices</h2>
          <span className="text-xs text-slate-400">{devices.filter((d) => d.status === 'online').length}/{devices.length} online</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {devices.map((d) => (
                <tr key={d.id} onClick={() => setSelected(d)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="w-8 pl-4"><DeviceStatusDot status={d.status} /></td>
                  <td className="py-2.5">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{d.name}</p>
                    <p className="font-mono text-[11px] text-slate-400">{d.id} · {d.type}</p>
                  </td>
                  <td className="py-2.5 text-right text-slate-600 dark:text-slate-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {d.status === 'offline' ? <span className="text-slate-400">offline</span> : d.reading ?? '—'}
                  </td>
                  <td className="py-2.5 pl-3 pr-4 text-right">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                      {d.controllable && <SlidersHorizontal size={13} className="text-partner-primary" />}
                      {d.controllable ? 'Control' : 'Details'}
                      <ChevronRight size={14} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Only when there is something to show. An empty "Decommissioned
          Hardware" heading on a site that has never replaced anything is noise
          on every page in the portal; the full list per customer lives on its
          own page, reachable from the header. */}
      {retired.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className={`flex items-center gap-1.5 ${heading}`}>
              <Archive size={14} /> Decommissioned hardware
            </h2>
            <Link to="/decommissioned" className="text-xs font-semibold text-partner-primary hover:underline">
              All customers
            </Link>
          </div>
          <DecommissionedTable hubs={retired} siteNameOf={() => site.name} />
        </section>
      )}

      <section>
        <h2 className={`mb-3 ${heading}`}>Work at this {t.siteSingular.toLowerCase()}</h2>
        {siteTickets.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <CheckCircle2 size={16} className="text-emerald-500" /> No open work orders.
          </p>
        ) : (
          <ul className="space-y-2">
            {siteTickets.map((tk) => (
              <TicketRow key={tk.id} ticket={tk} onUpdate={updateTicket} technicians={partner.technicians} showSite={false} />
            ))}
          </ul>
        )}
      </section>

      {selected && <DeviceDetail device={selected} onClose={() => setSelected(null)} onCommand={issueCommand} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-slate-700">{toast}</div>
      )}
    </div>
  );
}
