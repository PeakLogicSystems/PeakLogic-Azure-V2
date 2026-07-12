import { AlertTriangle, Info, XCircle, Check } from 'lucide-react';

const MOCK_ALERTS = [
  { id: '1', severity: 'critical', type: 'threshold', asset: 'Fryer Unit 2',    site: 'QSR — Downtown', message: 'Temperature sensor offline — no data for 3 h',    time: '1 hr ago',  status: 'open'         },
  { id: '2', severity: 'warning',  type: 'threshold', asset: 'Primary Pump P1', site: 'Riverside',      message: 'Power draw 18% above rated — 3.8 kW vs 3.2 kW',  time: '14 min ago', status: 'open'         },
  { id: '3', severity: 'warning',  type: 'threshold', asset: 'Pool Circulation',site: 'Lakewood Pool',  message: 'Flow rate dropped below 120 L/min (min: 150)',     time: '3 hr ago',  status: 'acknowledged' },
  { id: '4', severity: 'info',     type: 'offline',   asset: 'PLG-0005',        site: '—',              message: 'Device in provisioning state for > 24 h',          time: '1 day ago', status: 'open'         },
];

const SEVERITY_CONFIG: Record<string, { icon: typeof AlertTriangle; badge: string; row: string; iconColor: string }> = {
  critical: { icon: XCircle,       badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',       row: 'border-l-4 border-red-400 dark:border-red-500',     iconColor: 'text-red-500'   },
  warning:  { icon: AlertTriangle, badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', row: 'border-l-4 border-amber-400 dark:border-amber-500', iconColor: 'text-amber-500' },
  info:     { icon: Info,          badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',   row: 'border-l-4 border-blue-400 dark:border-blue-500',   iconColor: 'text-blue-500'   },
};

const STATUS_BADGE: Record<string, string> = {
  open:         'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  acknowledged: 'bg-brand-purple-soft text-brand-purple dark:bg-brand-purple/20 dark:text-brand-purple-mid',
  resolved:     'bg-brand-green-soft text-green-700 dark:bg-green-500/15 dark:text-green-400',
};

export function Alerts() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Alerts</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {MOCK_ALERTS.filter(a => a.status === 'open').length} open · {MOCK_ALERTS.filter(a => a.severity === 'critical').length} critical
        </p>
      </div>

      <div className="space-y-3">
        {MOCK_ALERTS.map(alert => {
          const cfg = SEVERITY_CONFIG[alert.severity];
          const SeverityIcon = cfg.icon;
          return (
            <div key={alert.id} className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 ${cfg.row} p-5`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <SeverityIcon size={18} className={cfg.iconColor} />
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{alert.asset}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{alert.site}</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1.5">{alert.message}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.badge}`}>
                    {alert.severity}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE[alert.status]}`}>
                    {alert.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <span className="text-xs text-gray-400 dark:text-gray-500">{alert.time}</span>
                {alert.status === 'open' && (
                  <button className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-brand-purple transition-colors">
                    <Check size={13} /> Acknowledge
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
