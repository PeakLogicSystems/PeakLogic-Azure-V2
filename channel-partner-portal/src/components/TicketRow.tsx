import { Link } from 'react-router-dom';
import { CheckCircle2, User } from 'lucide-react';
import { usePartner } from '@/PartnerContext';
import { siteById, type Ticket, type TicketStatus } from '@/data/types';
import { PriorityTag } from '@/components/ui';

const STATUS_OPTIONS: TicketStatus[] = ['open', 'scheduled', 'in_progress', 'completed'];
const STATUS_LABEL: Record<TicketStatus, string> = { open: 'Open', scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed' };

// A manageable work-order row — change status, assign a technician, close it.
// Shared by the Tickets page and a site's work list. Session-local; in production
// these map to PUT /v1/tickets under withChannelPartner.
export function TicketRow({ ticket: t, onUpdate, technicians, showSite = true }: { ticket: Ticket; onUpdate: (id: string, patch: Partial<Ticket>) => void; technicians: string[]; showSite?: boolean }) {
  const { partner } = usePartner();
  const site = siteById(partner, t.siteId);
  const done = t.status === 'completed';

  return (
    <li className={`rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 ${done ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{t.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono">{t.id}</span>
            {showSite && site && (
              <>
                <span>·</span>
                <Link to={`/sites/${t.siteId}`} className="font-medium text-partner-primary hover:underline">{site.name}</Link>
              </>
            )}
            <span>·</span>
            <PriorityTag priority={t.priority} />
            <span>·</span>
            <span className="capitalize">{t.source}</span>
          </div>
        </div>
        {done && <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          Status
          <select
            value={t.status}
            onChange={(e) => onUpdate(t.id, { status: e.target.value as TicketStatus })}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-partner-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <User size={13} /> Tech
          <select
            value={t.technician ?? ''}
            onChange={(e) => onUpdate(t.id, { technician: e.target.value || undefined })}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-partner-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">Unassigned</option>
            {technicians.map((tech) => (
              <option key={tech} value={tech}>{tech}</option>
            ))}
          </select>
        </label>

        {!done && (
          <button
            onClick={() => onUpdate(t.id, { status: 'completed' })}
            className="ml-auto rounded-lg px-2.5 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: 'var(--partner-primary)' }}
          >
            Mark complete
          </button>
        )}
      </div>
    </li>
  );
}
