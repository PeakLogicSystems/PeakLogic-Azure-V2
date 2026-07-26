import { useState } from 'react';
import { Gauge, Power, ShieldAlert, X } from 'lucide-react';
import type { Device } from '@/data/types';

const STATUS_TEXT: Record<Device['status'], { label: string; cls: string }> = {
  online: { label: 'Online', cls: 'text-emerald-600' },
  fault: { label: 'Fault', cls: 'text-amber-600' },
  offline: { label: 'Offline', cls: 'text-slate-400' },
};

// Device drill-down. Every device opens this detail; controllable equipment (a
// pump, blower, chemical feed) additionally gets a control section. Command
// issuance is GATED behind the command-authorization policy (Device & Command
// Security §5): the panel composes a command but does NOT dispatch it (no device/
// backend — preview). onCommand updates the local view only.
export function DeviceDetail({ device, onClose, onCommand }: { device: Device; onClose: () => void; onCommand: (running: boolean) => void }) {
  const [running, setRunning] = useState(!!device.running);
  const [setpoint, setSetpoint] = useState(70);
  const st = STATUS_TEXT[device.status];
  const setpointLabel = device.type.includes('Chlorinator') ? 'Output' : device.type.includes('Heater') ? 'Setpoint' : 'Speed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <p className="font-semibold text-slate-900">{device.name}</p>
            <p className="font-mono text-xs text-slate-500">{device.id} · {device.type}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* live reading + status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Status</p>
              <p className={`mt-0.5 text-sm font-semibold ${st.cls}`}>{st.label}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Live reading</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {device.status === 'offline' ? '— no data' : device.reading ?? '—'}
              </p>
            </div>
          </div>

          {device.controllable ? (
            <>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <Power size={18} className={running ? 'text-emerald-500' : 'text-slate-400'} />
                  <span className="text-sm font-medium text-slate-700">{running ? 'Running' : 'Stopped'}</span>
                </div>
                <button
                  onClick={() => setRunning((r) => !r)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white ${running ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                >
                  {running ? 'Stop' : 'Start'}
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{setpointLabel}</span>
                  <span className="font-semibold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{setpoint}%</span>
                </div>
                <input type="range" min={0} max={100} value={setpoint} onChange={(e) => setSetpoint(Number(e.target.value))} className="w-full accent-partner-primary" />
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                <span>
                  Command issuance is <span className="font-semibold">gated by the command-authorization policy</span> (Device &amp;
                  Command Security §5). Preview — the command is composed but <span className="font-semibold">not dispatched</span>.
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              <Gauge size={16} className="shrink-0" /> Read-only sensor — monitored, not controllable.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
            {device.controllable ? 'Cancel' : 'Close'}
          </button>
          {device.controllable && (
            <button onClick={() => onCommand(running)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: 'var(--partner-primary)' }}>
              Issue command
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
