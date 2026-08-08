import { Archive, Infinity as InfinityIcon, Router } from 'lucide-react';
import { CUSTOMER, siteById } from '@/data';
import { HUBS, RETENTION_LABEL, daysUntilPurge, retiredHubs, type Hub } from '@/data/hardware';

// The customer's hardware register: what is on their sites now, and what has
// been retired from them.
//
// Deliberately one page with both. A customer asking "what happened to the Hub
// in the chem building?" is asking a question that spans the two lists, and
// splitting them into separate screens makes the answer something you have to
// assemble yourself.

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const DOT: Record<Hub['state'], string> = {
  online: 'bg-emerald-500',
  offline: 'bg-slate-400',
  provisioning: 'bg-sky-500',
  decommissioned: 'bg-slate-300',
};

function Hold({ hub }: { hub: Hub }) {
  const d = hub.decommission;
  if (!d) return null;
  if (d.retention === 'manual') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <InfinityIcon size={11} /> Kept indefinitely
      </span>
    );
  }
  const left = daysUntilPurge(hub);
  const expired = left !== null && left <= 0;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        expired ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
      title={`${RETENTION_LABEL[d.retention]} hold from ${fmt(d.at)}`}
    >
      {expired ? 'Eligible for removal' : `Kept ${left} more day${left === 1 ? '' : 's'}`}
    </span>
  );
}

export function Hardware() {
  const live = HUBS.filter((h) => h.state !== 'decommissioned');
  const retired = retiredHubs();
  const siteName = (id: string) => siteById(id)?.name ?? 'A site no longer on your account';

  const card = 'rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
  const heading = 'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Hardware</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          The PeakLogic Hubs installed across your sites, and the ones that have been retired from them.{' '}
          {CUSTOMER.provider} installs and maintains this equipment; the records stay on your account either way.
        </p>
      </div>

      <section>
        <h2 className={`mb-3 flex items-center gap-1.5 ${heading}`}>
          <Router size={14} /> In service
        </h2>
        <div className={`overflow-x-auto ${card}`}>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-4 py-2.5 font-semibold">Hub</th>
                <th className="px-4 py-2.5 font-semibold">Site</th>
                <th className="px-4 py-2.5 font-semibold">Installed</th>
                <th className="px-4 py-2.5 font-semibold">Firmware</th>
                <th className="px-4 py-2.5 font-semibold">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {live.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-3 align-top">
                    <p className="flex items-center gap-1.5 font-mono text-[12.5px] font-bold text-slate-800 dark:text-slate-100">
                      <span className={`h-1.5 w-1.5 rounded-full ${DOT[h.state]}`} />
                      {h.id}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {h.model}
                      {h.label ? ` · ${h.label}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700 dark:text-slate-200">{siteName(h.siteId)}</td>
                  <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">{fmt(h.provisionedAt)}</td>
                  <td className="px-4 py-3 align-top font-mono text-[12px] text-slate-600 dark:text-slate-300">
                    {h.firmware} <span className="text-slate-400">({h.channel})</span>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                    {h.state === 'offline' ? <span className="text-amber-600 dark:text-amber-400">{h.lastSeen}</span> : h.lastSeen}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className={`mb-3 flex items-center gap-1.5 ${heading}`}>
          <Archive size={14} /> Decommissioned Hardware
        </h2>
        {retired.length === 0 ? (
          <p className={`flex items-center gap-2 p-4 text-sm text-slate-500 dark:text-slate-400 ${card}`}>
            <Archive size={16} className="text-slate-400" /> Nothing has been retired from your sites.
          </p>
        ) : (
          <div className={`overflow-x-auto ${card}`}>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-4 py-2.5 font-semibold">Hub</th>
                  <th className="px-4 py-2.5 font-semibold">Was installed at</th>
                  <th className="px-4 py-2.5 font-semibold">Retired</th>
                  <th className="px-4 py-2.5 font-semibold">Reason</th>
                  <th className="px-4 py-2.5 font-semibold">Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {retired.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-3 align-top">
                      <p className="font-mono text-[12.5px] font-bold text-slate-800 dark:text-slate-100">{h.id}</p>
                      <p className="text-[11px] text-slate-400">
                        {h.model} · S/N <span className="font-mono">{h.serial}</span>
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-slate-700 dark:text-slate-200">{siteName(h.siteId)}</p>
                      {h.label && <p className="text-[11px] text-slate-400">{h.label}</p>}
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                      <p>{h.decommission ? fmt(h.decommission.at) : '—'}</p>
                      <p className="text-[11px] text-slate-400">by {h.decommission?.by ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">{h.decommission?.reason ?? '—'}</td>
                    <td className="px-4 py-3 align-top">
                      <Hold hub={h} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 max-w-2xl text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">
          A retired unit keeps its record — serial, where it was installed, why it came out, and every reading it
          produced — for a hold period set when it was decommissioned. Without that, a year of compliance history would
          be attributed to a device your account no longer shows. The Hub ID is retired with it and never reissued, so
          an old reading always resolves to the unit that actually took it.
        </p>
      </section>
    </div>
  );
}
