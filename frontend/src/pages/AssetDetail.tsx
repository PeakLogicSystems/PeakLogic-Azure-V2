import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Boxes, Cpu, MapPin, Wifi, WifiOff } from 'lucide-react';
import { MOCK_ASSETS, MOCK_SITES, STATUS_BADGE, STATUS_DOT, assetDevices } from '@/lib/mockEstate';

const DEVICE_STATUS_BADGE: Record<string, string> = {
  online:       'bg-brand-green-soft text-green-700 dark:bg-green-500/15 dark:text-green-400',
  offline:      'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  provisioning: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

// NAV-2/NAV-4 (SRS §3.15) — the asset-vs-device distinction the product
// ask specifically called out: an asset (the pump, the pool's chlorinator)
// is the physical thing being monitored; a device is one of potentially
// several independent sensors/actuators attached to it. This page shows
// exactly that split — one asset, a card per device, each linking on into
// DeviceDetail for that device's own telemetry.
export function AssetDetail() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const asset = MOCK_ASSETS.find(a => a.id === assetId);
  const site = asset ? MOCK_SITES.find(s => s.id === asset.siteId) : undefined;

  if (!asset) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <p className="text-sm text-gray-500 dark:text-gray-400">Asset not found.</p>
        <Link to="/assets" className="text-sm text-brand-purple hover:underline">Back to Assets</Link>
      </div>
    );
  }

  const devices = assetDevices(asset.id);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/assets')}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      >
        <ArrowLeft size={14} /> All assets
      </button>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Boxes size={18} className="text-brand-purple" />
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{asset.name}</h1>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mt-1">
            <span className="capitalize">{asset.category.replace('_', ' ')}</span>
            <span>·</span>
            <span>{asset.make} {asset.model}</span>
            {site && (
              <>
                <span>·</span>
                <Link to={`/sites/${site.id}`} className="flex items-center gap-1 hover:text-brand-purple transition-colors">
                  <MapPin size={12} /> {site.name}
                </Link>
              </>
            )}
          </div>
        </div>
        <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${STATUS_BADGE[asset.status]}`}>
          {asset.status}
        </span>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Cpu size={15} /> Devices monitoring this asset ({devices.length})
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          One asset can have several independent devices — e.g. a pump with a separate flow sensor, energy monitor, leak sensor, and power actuator, each reporting its own telemetry.
        </p>
        {devices.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No devices are attached to this asset yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {devices.map(device => {
              const StatusIcon = device.status === 'online' ? Wifi : device.status === 'offline' ? WifiOff : Cpu;
              const telemetryEntries = Object.entries(device.telemetry);
              return (
                <Link
                  key={device.id}
                  to={`/devices/${device.id}`}
                  className="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{device.role}</p>
                      <p className="text-xs font-mono text-gray-400 dark:text-gray-500">{device.serial}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${DEVICE_STATUS_BADGE[device.status]}`}>
                      <StatusIcon size={11} /> {device.status}
                    </span>
                  </div>
                  {telemetryEntries.length > 0 ? (
                    <div className="flex flex-wrap gap-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                      {telemetryEntries.map(([key, t]) => (
                        <div key={key}>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{t.label}</p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {t.value === null ? '—' : `${t.value}${t.unit ? ` ${t.unit}` : ''}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500 pt-3 border-t border-gray-100 dark:border-gray-800">No telemetry yet</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[asset.status]}`} /> Asset health reflects the worst status across all attached devices.
      </div>
    </div>
  );
}
