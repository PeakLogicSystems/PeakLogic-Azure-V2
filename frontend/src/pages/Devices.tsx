import { Cpu, Plus, Wifi, WifiOff } from 'lucide-react';

const MOCK_DEVICES = [
  { id: '1', serial: 'PLG-0001', thingName: 'plg-device-0001', asset: 'Primary Pump P1',  site: 'Riverside',      status: 'online',       firmware: '1.2.4', lastSeen: '2 min ago'  },
  { id: '2', serial: 'PLG-0002', thingName: 'plg-device-0002', asset: 'Backup Pump P2',   site: 'Riverside',      status: 'online',       firmware: '1.2.4', lastSeen: '2 min ago'  },
  { id: '3', serial: 'PLG-0003', thingName: 'plg-device-0003', asset: 'Fryer Unit 1',     site: 'QSR Downtown',   status: 'online',       firmware: '1.2.3', lastSeen: '5 min ago'  },
  { id: '4', serial: 'PLG-0004', thingName: 'plg-device-0004', asset: 'Fryer Unit 2',     site: 'QSR Downtown',   status: 'offline',      firmware: '1.2.3', lastSeen: '3 hr ago'   },
  { id: '5', serial: 'PLG-0005', thingName: 'plg-device-0005', asset: '—',                site: '—',              status: 'provisioning', firmware: '—',     lastSeen: 'Never'      },
  { id: '6', serial: 'PLG-0006', thingName: 'plg-device-0006', asset: 'Pool Circulation', site: 'Lakewood Pool',  status: 'online',       firmware: '1.2.4', lastSeen: '1 min ago'  },
];

const STATUS_CONFIG: Record<string, { label: string; badge: string; Icon: typeof Wifi }> = {
  online:       { label: 'Online',       badge: 'bg-brand-green-soft text-green-700', Icon: Wifi    },
  offline:      { label: 'Offline',      badge: 'bg-red-100 text-red-700',            Icon: WifiOff },
  provisioning: { label: 'Provisioning', badge: 'bg-gray-100 text-gray-500',          Icon: Cpu     },
};

export function Devices() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Devices</h1>
          <p className="text-sm text-gray-500 mt-1">{MOCK_DEVICES.length} devices · {MOCK_DEVICES.filter(d => d.status === 'online').length} online</p>
        </div>
        <button className="flex items-center gap-2 bg-brand-purple text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-purple/90 transition-colors">
          <Plus size={15} /> Onboard device
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Serial', 'Thing Name', 'Asset', 'Site', 'Firmware', 'Last seen', 'Status'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MOCK_DEVICES.map(d => {
              const cfg = STATUS_CONFIG[d.status];
              return (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs font-medium text-gray-900">{d.serial}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{d.thingName}</td>
                  <td className="px-5 py-3.5 text-gray-700">{d.asset}</td>
                  <td className="px-5 py-3.5 text-gray-600">{d.site}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{d.firmware}</td>
                  <td className="px-5 py-3.5 text-gray-500 text-xs">{d.lastSeen}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.badge}`}>
                      <cfg.Icon size={11} />
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
