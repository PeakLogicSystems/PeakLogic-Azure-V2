import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Boxes, CheckCircle2, ExternalLink, Hammer, MonitorPlay, Plus, Settings2, SlidersHorizontal } from 'lucide-react';
import { siteById, ticketsForSite, type Device } from '@/data/ace';
import { DeviceStatusDot, HealthPill, PriorityTag, TicketStatusTag } from '@/components/ui';
import { DeviceControl } from '@/components/DeviceControl';

export function SiteDetail() {
  const { siteId = '' } = useParams();
  const site = siteById(siteId);

  const [devices, setDevices] = useState<Device[]>(() => site?.devices.map((d) => ({ ...d })) ?? []);
  const [controlling, setControlling] = useState<Device | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const tickets = useMemo(() => ticketsForSite(siteId), [siteId]);

  if (!site) {
    return (
      <div className="py-16 text-center text-slate-500">
        Site not found. <Link to="/" className="text-partner-primary hover:underline">Back to home</Link>
      </div>
    );
  }

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const issueCommand = (running: boolean) => {
    if (!controlling) return;
    setDevices((prev) => prev.map((d) => (d.id === controlling.id ? { ...d, running, reading: running ? d.reading ?? '—' : 'idle' } : d)));
    flash(`Command queued for ${controlling.name} → ${running ? 'START' : 'STOP'} (preview — authorization gate not enabled).`);
    setControlling(null);
  };

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> All sites
      </Link>

      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">{site.name}</h1>
            <HealthPill health={site.health} />
          </div>
          <p className="text-sm text-slate-500">{site.customer} · {site.location}</p>
        </div>
      </div>

      {/* actions: facility builder, peakview360, provision */}
      <div className="flex flex-wrap gap-2">
        {site.hasFacility ? (
          <ActionButton icon={Boxes} label="Open Facility View" onClick={() => flash('Opens the Facility View in PeakView360 (preview).')} primary />
        ) : (
          <ActionButton icon={Hammer} label="Build in Facility Builder" onClick={() => flash('Facility Builder — the guided plant-view authoring tool. Roadmapped (facility-builder-roadmap.md).')} />
        )}
        <ActionButton icon={MonitorPlay} label="Open in PeakView360" disabled={!site.peakview} onClick={() => flash('Opens the PeakView360 operator view for this site (preview).')} />
        <ActionButton icon={Plus} label="Provision device" onClick={() => flash('Zero-touch provisioning: register a device by serial/claim code, then it self-enrolls (preview).')} />
      </div>

      {/* devices — setup, monitor, control */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Devices</h2>
          <span className="text-xs text-slate-400">{devices.filter((d) => d.status === 'online').length}/{devices.length} online</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="w-8 pl-4"><DeviceStatusDot status={d.status} /></td>
                  <td className="py-2.5">
                    <p className="font-medium text-slate-800">{d.name}</p>
                    <p className="font-mono text-[11px] text-slate-400">{d.id} · {d.type}</p>
                  </td>
                  <td className="py-2.5 text-right text-slate-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {d.status === 'offline' ? <span className="text-slate-400">offline</span> : d.reading ?? '—'}
                  </td>
                  <td className="py-2.5 pl-3 pr-4 text-right">
                    {d.controllable ? (
                      <button
                        onClick={() => setControlling(d)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-partner-primary hover:text-partner-primary"
                      >
                        <SlidersHorizontal size={13} /> Control
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Settings2 size={13} /> Sensor
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* site tickets */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Work at this site</h2>
        {tickets.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            <CheckCircle2 size={16} className="text-emerald-500" /> No open work orders.
          </p>
        ) : (
          <ul className="space-y-2">
            {tickets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{t.id}</span> · {t.technician ?? 'unassigned'} · <PriorityTag priority={t.priority} />
                  </p>
                </div>
                <TicketStatusTag status={t.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {controlling && <DeviceControl device={controlling} onClose={() => setControlling(null)} onCommand={issueCommand} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary,
  disabled,
}: {
  icon: typeof Boxes;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary ? 'text-white' : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300'
      }`}
      style={primary ? { backgroundColor: 'var(--partner-primary)' } : undefined}
    >
      <Icon size={15} /> {label}
      {!primary && !disabled && label.startsWith('Open in') && <ExternalLink size={13} className="text-slate-400" />}
    </button>
  );
}
