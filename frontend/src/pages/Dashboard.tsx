import { Cpu, MapPin, Bell, Ticket } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Mock data — replace with api.get('/v1/telemetry') in Phase C ──────────
const TELEMETRY = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, '0')}:00`,
  power_kw: +(2.5 + Math.sin(i / 3) * 1.2 + Math.random() * 0.3).toFixed(2),
  temp_c:   +(42   + Math.cos(i / 4) * 5   + Math.random() * 0.5).toFixed(1),
}));

const RECENT_ALERTS = [
  { id: '1', asset: 'Pump Station A – P1', message: 'Power draw 18% above baseline', severity: 'warning', time: '14 min ago' },
  { id: '2', asset: 'QSR – Fryer Unit 2',  message: 'Temperature sensor offline',    severity: 'critical', time: '1 hr ago' },
  { id: '3', asset: 'Pool Site 3 – Motor', message: 'Flow rate below minimum',        severity: 'warning', time: '3 hr ago' },
];

const STATS = [
  { label: 'Devices Online',   value: '12 / 14', sub: '2 offline',     Icon: Cpu,    color: 'text-brand-purple' },
  { label: 'Open Alerts',      value: '3',       sub: '1 critical',    Icon: Bell,   color: 'text-red-500'     },
  { label: 'Active Sites',     value: '6',       sub: 'across 3 types', Icon: MapPin, color: 'text-brand-green'  },
  { label: 'Open Tickets',     value: '2',       sub: 'awaiting assign', Icon: Ticket, color: 'text-amber-500'   },
];

const SEVERITY_BADGE: Record<string, string> = {
  warning:  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  info:     'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
};

export function Dashboard() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Overview of your estate</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map(({ label, value, sub, Icon, color }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
              <Icon size={16} className={color} />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Telemetry chart */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Power draw — last 24 h (kW)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={TELEMETRY} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" className="dark:opacity-10" />
            <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={3} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Line
              type="monotone"
              dataKey="power_kw"
              stroke="#7C3AED"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Recent alerts */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent alerts</h2>
          <a href="/alerts" className="text-xs text-brand-purple hover:underline">View all</a>
        </div>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {RECENT_ALERTS.map(alert => (
            <li key={alert.id} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{alert.asset}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{alert.message}</p>
              </div>
              <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_BADGE[alert.severity]}`}>
                  {alert.severity}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{alert.time}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
