import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Cpu, Boxes, MapPin, Wifi, WifiOff, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MOCK_DEVICES, MOCK_ASSETS, MOCK_SITES } from '@/lib/mockEstate';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatHourLabel, type DateTimePrefs } from '@/lib/datetime';

const STATUS_CONFIG: Record<string, { label: string; badge: string; Icon: typeof Wifi }> = {
  online:       { label: 'Online',       badge: 'bg-brand-green-soft text-green-700 dark:bg-green-500/15 dark:text-green-400', Icon: Wifi    },
  offline:      { label: 'Offline',      badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',                Icon: WifiOff },
  provisioning: { label: 'Provisioning', badge: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',               Icon: Cpu     },
};

// Deterministic-looking mock trend, not truly random per render — matches
// Dashboard.tsx's own "replace with api.get('/v1/telemetry') in Phase C"
// convention for the one chart this frontend already has. Labeled in
// whichever timezone/clock format the viewer has selected (SET-3/SET-4),
// same fix as Dashboard.tsx's chart — previously a fixed "00:00" string
// that never reflected the Settings page at all.
function mockTrend(seed: number, base: number, spread: number, now: Date, prefs: DateTimePrefs) {
  return Array.from({ length: 24 }, (_, i) => ({
    hour: formatHourLabel(new Date(now.getTime() - (23 - i) * 3600_000), prefs),
    value: +(base + Math.sin((i + seed) / 3) * spread).toFixed(2),
  }));
}

// NAV-3/NAV-4/NAV-5 (SRS §3.15) — the bottom of the drill-down: a single
// device's own telemetry, at whatever granularity that device reports
// (the Pentair IntelliChlor example from the product ask: temperature,
// salt level, and flow, all off the one device — this page renders however
// many telemetry channels a device happens to have, not a fixed shape).
export function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const prefs = usePreferences();
  const [now, setNow] = useState(() => new Date());
  const device = MOCK_DEVICES.find(d => d.id === deviceId);
  const asset = device?.assetId ? MOCK_ASSETS.find(a => a.id === device.assetId) : undefined;
  const site = asset ? MOCK_SITES.find(s => s.id === asset.siteId) : undefined;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!device) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <p className="text-sm text-gray-500 dark:text-gray-400">Device not found.</p>
        <Link to="/devices" className="text-sm text-brand-purple hover:underline">Back to Devices</Link>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[device.status];
  const telemetryEntries = Object.entries(device.telemetry);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/devices')}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      >
        <ArrowLeft size={14} /> All devices
      </button>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Cpu size={18} className="text-brand-purple" />
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{device.role}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mt-1">
            <span className="font-mono text-xs">{device.serial}</span>
            {asset && (
              <>
                <span>·</span>
                <Link to={`/assets/${asset.id}`} className="flex items-center gap-1 hover:text-brand-purple transition-colors">
                  <Boxes size={12} /> {asset.name}
                </Link>
              </>
            )}
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
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${cfg.badge}`}>
          <cfg.Icon size={12} /> {cfg.label}
        </span>
      </div>

      {/* Live telemetry channels */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Activity size={15} /> Live telemetry
        </h2>
        {telemetryEntries.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {device.status === 'provisioning' ? 'This device has not been claimed/assigned yet.' : 'No telemetry channels reported by this device.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {telemetryEntries.map(([key, t]) => (
              <div key={key} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {t.value === null ? '—' : t.value}
                  {t.unit && t.value !== null && <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">{t.unit}</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trend chart for the first numeric telemetry channel */}
      {telemetryEntries.find(([, t]) => typeof t.value === 'number') && (() => {
        const [key, t] = telemetryEntries.find(([, tt]) => typeof tt.value === 'number')!;
        const trend = mockTrend(key.length, t.value as number, Math.max((t.value as number) * 0.08, 1), now, prefs);
        return (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{t.label} — last 24 h</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" className="dark:opacity-10" />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={3} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} labelStyle={{ fontWeight: 600 }} />
                <Line type="monotone" dataKey="value" stroke="#7C3AED" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* Device meta */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Device details</h2>
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Thing name</p>
            <p className="font-mono text-xs text-gray-700 dark:text-gray-300">{device.thingName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Firmware</p>
            <p className="font-mono text-xs text-gray-700 dark:text-gray-300">{device.firmware}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Last seen</p>
            <p className="text-gray-700 dark:text-gray-300">{device.lastSeen}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Role</p>
            <p className="text-gray-700 dark:text-gray-300">{device.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
