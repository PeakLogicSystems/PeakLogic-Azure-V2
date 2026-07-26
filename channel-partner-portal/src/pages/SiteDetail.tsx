import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ChevronRight, ExternalLink, MonitorPlay, Plus, SlidersHorizontal, Waves } from 'lucide-react';
import { usePartner } from '@/PartnerContext';
import { siteById, type Device } from '@/data/types';
import { DeviceStatusDot, HealthPill } from '@/components/ui';
import { DeviceDetail } from '@/components/DeviceDetail';
import { TicketRow } from '@/components/TicketRow';

const PEAKVIEW_URL = 'http://localhost:5175/';

export function SiteDetail() {
  const { partner, tickets, updateTicket } = usePartner();
  const { siteId = '' } = useParams();
  const navigate = useNavigate();
  const site = siteById(partner, siteId);
  const t = partner.terms;

  const [devices, setDevices] = useState<Device[]>(() => site?.devices.map((d) => ({ ...d })) ?? []);
  const [selected, setSelected] = useState<Device | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const siteTickets = useMemo(() => tickets.filter((tk) => tk.siteId === siteId), [tickets, siteId]);

  if (!site) {
    return (
      <div className="py-16 text-center text-slate-500">
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

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> All {t.sitePlural.toLowerCase()}
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">{site.name}</h1>
          <HealthPill health={site.health} />
        </div>
        <p className="text-sm text-slate-500">
          <span className="capitalize">{site.kind}</span> · {site.customer} · {site.location}
        </p>
      </div>

      {/* actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => navigate(`/sites/${site.id}/facility`)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--partner-primary)' }}
        >
          <Waves size={15} /> {site.hasFacility ? t.facilityOpen : t.facilityBuild}
        </button>
        <a
          href={PEAKVIEW_URL}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!site.peakview}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 ${!site.peakview ? 'pointer-events-none opacity-40' : ''}`}
        >
          <MonitorPlay size={15} /> Open in PeakView360 <ExternalLink size={13} className="text-slate-400" />
        </a>
        <button
          onClick={() => flash('Zero-touch provisioning: register a device by serial/claim code, then it self-enrolls (preview).')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300"
        >
          <Plus size={15} /> Provision device
        </button>
      </div>

      {/* devices — click any to drill in */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Devices</h2>
          <span className="text-xs text-slate-400">{devices.filter((d) => d.status === 'online').length}/{devices.length} online</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {devices.map((d) => (
                <tr key={d.id} onClick={() => setSelected(d)} className="cursor-pointer hover:bg-slate-50">
                  <td className="w-8 pl-4"><DeviceStatusDot status={d.status} /></td>
                  <td className="py-2.5">
                    <p className="font-medium text-slate-800">{d.name}</p>
                    <p className="font-mono text-[11px] text-slate-400">{d.id} · {d.type}</p>
                  </td>
                  <td className="py-2.5 text-right text-slate-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
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

      {/* work at this site — manageable */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Work at this {t.siteSingular.toLowerCase()}</h2>
        {siteTickets.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
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
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}
