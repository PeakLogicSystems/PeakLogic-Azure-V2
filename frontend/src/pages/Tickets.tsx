import { Ticket, Plus, Clock } from 'lucide-react';

const MOCK_TICKETS = [
  { id: 'TK-001', title: 'Fryer Unit 2 — temperature sensor replacement', asset: 'Fryer Unit 2', site: 'QSR — Downtown', priority: 'high',   status: 'open',        created: '1 hr ago',  due: 'Tomorrow' },
  { id: 'TK-002', title: 'Pump P1 — inspect power draw anomaly',          asset: 'Primary Pump P1', site: 'Riverside', priority: 'medium', status: 'assigned',    created: '14 min ago', due: 'In 3 days' },
];

const PRIORITY_BADGE: Record<string, string> = {
  emergency: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  high:      'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  medium:    'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  low:       'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_BADGE: Record<string, string> = {
  open:        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  assigned:    'bg-brand-purple-soft text-brand-purple dark:bg-brand-purple/20 dark:text-brand-purple-mid',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  completed:   'bg-brand-green-soft text-green-700 dark:bg-green-500/15 dark:text-green-400',
  cancelled:   'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
};

export function Tickets() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Service Tickets</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{MOCK_TICKETS.length} open tickets</p>
        </div>
        <button className="flex items-center gap-2 bg-brand-purple text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-purple/90 transition-colors">
          <Plus size={15} /> New ticket
        </button>
      </div>

      {MOCK_TICKETS.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-16 text-center">
          <Ticket size={32} className="mx-auto text-gray-300 dark:text-gray-700 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No open tickets</p>
        </div>
      ) : (
        <div className="space-y-3">
          {MOCK_TICKETS.map(t => (
            <div key={t.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{t.id}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_BADGE[t.priority]}`}>
                      {t.priority}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.asset} · {t.site}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_BADGE[t.status]}`}>
                  {t.status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500">
                <span>Created {t.created}</span>
                <span className="flex items-center gap-1"><Clock size={11} /> Due {t.due}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
