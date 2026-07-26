import { useMemo, useState } from 'react';
import { usePartner } from '@/PartnerContext';
import { type TicketStatus } from '@/data/types';
import { TicketRow } from '@/components/TicketRow';

const FILTERS: { key: TicketStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
];

// The partner's CMMS — real work management: change status, assign a technician,
// close a ticket. Session-local (preview); in production PUT /v1/tickets under
// withChannelPartner.
export function Tickets() {
  const { partner, tickets, updateTicket } = usePartner();
  const [filter, setFilter] = useState<TicketStatus | 'all'>('all');
  const rows = useMemo(() => (filter === 'all' ? tickets : tickets.filter((t) => t.status === filter)), [tickets, filter]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Tickets</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage work across every {partner.terms.siteSingular.toLowerCase()} you service — assign, schedule, and close.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${filter === f.key ? 'text-white' : 'bg-white text-slate-500 hover:text-slate-800 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-100'}`}
            style={filter === f.key ? { backgroundColor: 'var(--partner-primary)' } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {rows.map((t) => (
          <TicketRow key={t.id} ticket={t} onUpdate={updateTicket} technicians={partner.technicians} />
        ))}
      </ul>
    </div>
  );
}
