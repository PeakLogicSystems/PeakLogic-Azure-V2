import { Archive, Infinity as InfinityIcon } from 'lucide-react';
import { HUB_MODELS, RETENTION, daysUntilPurge, type Hub } from '@/data/hubs';

// The decommissioned-hardware record, rendered the same way everywhere it
// appears — the partner's own list and the customer's copy of it.
//
// What it shows is chosen to answer the question these records exist for:
// "what was at this site, when, and what happened to it?" So the serial, the
// site, the reason and the dates are all first-class, and the hold is shown as
// TIME REMAINING rather than a purge date — nobody reads "2026-11-04" and
// works out that it is eleven weeks away.

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function RetentionPill({ hub }: { hub: Hub }) {
  const d = hub.decommission;
  if (!d) return null;
  if (d.retention === 'manual') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <InfinityIcon size={11} /> Held — manual deletion only
      </span>
    );
  }
  const left = daysUntilPurge(hub);
  const expired = left !== null && left <= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        expired
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
      title={`${RETENTION[d.retention].label} hold from ${fmt(d.at)}`}
    >
      {expired ? 'Eligible for purge' : `${left} day${left === 1 ? '' : 's'} left of ${RETENTION[d.retention].label}`}
    </span>
  );
}

export function DecommissionedTable({ hubs, siteNameOf }: { hubs: Hub[]; siteNameOf: (siteId: string | null) => string }) {
  if (!hubs.length) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <Archive size={16} className="text-slate-400" /> No decommissioned hardware on record.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
            <th className="px-4 py-2.5 font-semibold">Hub</th>
            <th className="px-4 py-2.5 font-semibold">Was installed at</th>
            <th className="px-4 py-2.5 font-semibold">Retired</th>
            <th className="px-4 py-2.5 font-semibold">Reason</th>
            <th className="px-4 py-2.5 font-semibold">Retention</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {hubs.map((h) => (
            <tr key={h.id}>
              <td className="px-4 py-3 align-top">
                <p className="font-mono text-[12.5px] font-bold text-slate-800 dark:text-slate-100">{h.id}</p>
                <p className="text-[11px] text-slate-400">
                  {HUB_MODELS[h.model].name} · S/N <span className="font-mono">{h.serial}</span>
                </p>
              </td>
              <td className="px-4 py-3 align-top">
                <p className="text-slate-700 dark:text-slate-200">{siteNameOf(h.siteId)}</p>
                {h.label && <p className="text-[11px] text-slate-400">{h.label}</p>}
              </td>
              <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                <p>{h.decommission ? fmt(h.decommission.at) : '—'}</p>
                <p className="text-[11px] text-slate-400">by {h.decommission?.by ?? '—'}</p>
              </td>
              <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">{h.decommission?.reason ?? '—'}</td>
              <td className="px-4 py-3 align-top">
                <RetentionPill hub={h} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
