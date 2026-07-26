import { useState } from 'react';
import { Power, ShieldAlert, X } from 'lucide-react';
import type { Device } from '@/data/types';

// The device control panel. Controlling field equipment (a pump, a blower, a
// chemical feed) is a real, legitimate capability for an authorized service
// partner — but command issuance is GATED behind the command-authorization
// policy (Device & Command Security Architecture §5). This panel makes the gate
// explicit: it composes a command, but no command is dispatched (no device, no
// backend — preview). onCommand updates the local view so the operator sees the
// intended state; it does not claim a real actuation occurred.
export function DeviceControl({ device, onClose, onCommand }: { device: Device; onClose: () => void; onCommand: (running: boolean) => void }) {
  const [running, setRunning] = useState(!!device.running);
  const [setpoint, setSetpoint] = useState(70);

  const setpointLabel =
    device.type === 'Chlorinator' ? 'Dose rate' : device.type === 'Blower' ? 'Output' : 'Speed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <p className="font-semibold text-slate-900">{device.name}</p>
            <p className="text-xs text-slate-500">{device.type} · {device.id}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* run state */}
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

          {/* setpoint */}
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">{setpointLabel}</span>
              <span className="font-semibold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{setpoint}%</span>
            </div>
            <input type="range" min={0} max={100} value={setpoint} onChange={(e) => setSetpoint(Number(e.target.value))} className="w-full accent-partner-primary" />
          </div>

          {/* the gate */}
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <span>
              Command issuance is <span className="font-semibold">gated by the command-authorization policy</span> (Device &amp;
              Command Security §5). This is a preview — the command is composed but <span className="font-semibold">not dispatched</span> to a device.
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={() => onCommand(running)}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--partner-primary)' }}
          >
            Issue command
          </button>
        </div>
      </div>
    </div>
  );
}
