import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArrowLeft } from 'lucide-react';
import { usePartner } from '@/PartnerContext';
import { RETENTION } from '@/data/hubs';
import { DecommissionedTable } from '@/components/DecommissionedTable';

// Decommissioned hardware, GROUPED BY CUSTOMER.
//
// The grouping is the point, not a presentation choice. A retired record
// belongs to the tenant whose site it served, not to the partner who happened
// to install it — so if this partner's agreement with a customer ends, that
// customer keeps their own equipment history, and this page simply stops
// showing it.

export function Decommissioned() {
  const { partner, hubs } = usePartner();
  const t = partner.terms;

  const byCustomer = useMemo(() => {
    const retired = hubs.filter((h) => h.state === 'decommissioned');
    const groups = new Map<string, typeof retired>();
    for (const h of retired) {
      const key = h.customer ?? 'Unassigned';
      groups.set(key, [...(groups.get(key) ?? []), h]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [hubs]);

  const siteNameOf = (siteId: string | null) => partner.sites.find((s) => s.id === siteId)?.name ?? 'Site no longer serviced';
  const total = byCustomer.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">
        <ArrowLeft size={16} /> All {t.sitePlural.toLowerCase()}
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Archive size={19} className="text-partner-primary" /> Decommissioned Hardware
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Every unit retired from a {t.siteSingular.toLowerCase()} you service. The record stays in the customer&rsquo;s
          own tenant — with its serial, where it was installed, why it came out, and the readings it produced — because
          deleting it with the hardware would leave a year of compliance history that no device accounts for.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { l: 'Retired units', v: String(total), s: 'across all customers' },
          { l: 'On a timed hold', v: String(hubs.filter((h) => h.decommission && h.decommission.retention !== 'manual').length), s: 'purge scheduled' },
          { l: 'Manual deletion only', v: String(hubs.filter((h) => h.decommission?.retention === 'manual').length), s: 'nothing expires' },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{s.l}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{s.v}</p>
            <p className="text-[11px] text-slate-400">{s.s}</p>
          </div>
        ))}
      </div>

      {byCustomer.length === 0 ? (
        <DecommissionedTable hubs={[]} siteNameOf={siteNameOf} />
      ) : (
        byCustomer.map(([customer, list]) => (
          <section key={customer}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {customer} <span className="ml-1 font-normal normal-case text-slate-400">· {list.length} unit{list.length === 1 ? '' : 's'}</span>
            </h2>
            <DecommissionedTable hubs={list} siteNameOf={siteNameOf} />
          </section>
        ))
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <p className="mb-1.5 font-semibold text-slate-700 dark:text-slate-200">Hold periods</p>
        <ul className="space-y-1">
          {(Object.keys(RETENTION) as (keyof typeof RETENTION)[]).map((k) => (
            <li key={k}>
              <span className="font-semibold">{RETENTION[k].label}</span> — {RETENTION[k].sub}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          The hold is chosen per unit when it is retired, not set once globally: a warranty swap on a pool pad and a
          failed Hub at a permitted discharge site have different evidentiary lives. A Hub ID is retired with its record
          and is never reissued.
        </p>
      </div>
    </div>
  );
}
