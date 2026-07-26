import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePartner } from '@/PartnerContext';
import { siteById, type TicketStatus } from '@/data/types';
import { PriorityTag, TicketStatusTag } from '@/components/ui';

const FILTERS: { key: TicketStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
];

// The partner's CMMS work — every work order across the sites/pools they service.
export function Tickets() {
  const { partner } = usePartner();
  const [filter, setFilter] = useState<TicketStatus | 'all'>('all');
  const rows = useMemo(() => (filter === 'all' ? partner.tickets : partner.tickets.filter((t) => t.status === filter)), [partner, filter]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tickets</h1>
        <p className="text-sm text-slate-500">Work orders across every {partner.terms.siteSingular.toLowerCase()} you service.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${filter === f.key ? 'text-white' : 'bg-white text-slate-500 hover:text-slate-800'}`}
            style={filter === f.key ? { backgroundColor: 'var(--partner-primary)' } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {rows.map((t) => {
          const site = siteById(partner, t.siteId);
          return (
            <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-400">{t.id}</span>
                <TicketStatusTag status={t.status} />
              </div>
              <p className="mt-1 text-sm font-medium text-slate-800">{t.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <Link to={`/sites/${t.siteId}`} className="font-medium text-partner-primary hover:underline">{site?.name}</Link>
                <span>·</span>
                <PriorityTag priority={t.priority} />
                <span>·</span>
                <span>{t.technician ?? 'unassigned'}</span>
                <span>·</span>
                <span className="capitalize">{t.source}</span>
                <span>·</span>
                <span>{t.createdDaysAgo === 0 ? 'today' : `${t.createdDaysAgo}d ago`}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
