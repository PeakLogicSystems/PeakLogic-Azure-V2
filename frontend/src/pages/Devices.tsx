import { Link, useNavigate } from 'react-router-dom';
import { Cpu, Plus, Wifi, WifiOff } from 'lucide-react';
import { MOCK_DEVICES, MOCK_ASSETS, MOCK_SITES } from '@/lib/mockEstate';

const STATUS_CONFIG: Record<string, { label: string; badge: string; Icon: typeof Wifi }> = {
  online:       { label: 'Online',       badge: 'bg-brand-green-soft text-green-700 dark:bg-green-500/15 dark:text-green-400', Icon: Wifi    },
  offline:      { label: 'Offline',      badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',                Icon: WifiOff },
  provisioning: { label: 'Provisioning', badge: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',               Icon: Cpu     },
};

export function Devices() {
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Devices</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{MOCK_DEVICES.length} devices · {MOCK_DEVICES.filter(d => d.status === 'online').length} online</p>
        </div>
        <Link
          to="/devices/onboard"
          className="flex items-center gap-2 bg-brand-purple text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-purple/90 transition-colors"
        >
          <Plus size={15} /> Onboard device
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
            <tr>
              {['Serial', 'Role', 'Asset', 'Site', 'Firmware', 'Last seen', 'Status'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {MOCK_DEVICES.map(d => {
              const cfg = STATUS_CONFIG[d.status];
              const asset = MOCK_ASSETS.find(a => a.id === d.assetId);
              const site = asset ? MOCK_SITES.find(s => s.id === asset.siteId) : undefined;
              return (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/devices/${d.id}`)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5 font-mono text-xs font-medium text-gray-900 dark:text-gray-100">{d.serial}</td>
                  <td className="px-5 py-3.5 text-gray-700 dark:text-gray-300">{d.role}</td>
                  <td className="px-5 py-3.5 text-gray-700 dark:text-gray-300">{asset?.name ?? '—'}</td>
                  <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">{site?.name ?? '—'}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-500 dark:text-gray-400">{d.firmware}</td>
                  <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 text-xs">{d.lastSeen}</td>
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
