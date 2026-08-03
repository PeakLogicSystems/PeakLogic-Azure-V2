import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Droplets } from 'lucide-react';
import { alertsForSite, siteById } from '@/data';
import { hasWaterQuality } from '@/data/waterQuality';
import { DeviceStatusDot, HealthPill, SeverityRail } from '@/components/ui';
import { PeakViewEmbed } from '@/components/PeakViewEmbed';

// A customer's view of one of their sites: monitor devices (read-only — the
// customer watches; their service partner services), watch the live operator
// view in PeakView360, and see the site's alerts. PeakView360 is EMBEDDED here
// rather than linked to — it is launched from within the portal and is not a
// separate login, so navigating the tab away to it was the wrong model and left
// the customer stranded outside their own authenticated session.
export function SiteDetail() {
  const { siteId = '' } = useParams();
  const site = siteById(siteId);
  const alerts = site ? alertsForSite(siteId) : [];

  if (!site) {
    return (
      <div className="py-16 text-center text-slate-500 dark:text-slate-400">
        Not found. <Link to="/" className="text-brand-purple-mid hover:underline">Back to home</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">
        <ArrowLeft size={16} /> All sites
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{site.name}</h1>
            <HealthPill health={site.health} />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{site.location}</p>
        </div>
        {hasWaterQuality(site.id) && (
          <Link
            to={`/sites/${site.id}/water-quality`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand-purple-mid hover:text-brand-purple-mid dark:border-slate-700 dark:text-slate-200"
          >
            <Droplets size={15} /> Water Quality Report
          </Link>
        )}
      </div>

      {/* Above Devices: the live view is what a customer opens this page for,
          and it is the one thing on it that changes second to second. */}
      <PeakViewEmbed site={site} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Devices</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {site.devices.map((d) => (
                <tr key={d.id}>
                  <td className="w-8 pl-4"><DeviceStatusDot status={d.status} /></td>
                  <td className="py-2.5">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{d.name}</p>
                    <p className="font-mono text-[11px] text-slate-400">{d.id} · {d.type}</p>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-slate-600 dark:text-slate-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {d.status === 'offline' ? <span className="text-slate-400">offline</span> : d.reading ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Alerts</h2>
        {alerts.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <CheckCircle2 size={16} className="text-emerald-500" /> No active alerts.
          </p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 pl-4 dark:border-slate-800 dark:bg-slate-900">
                <SeverityRail severity={a.severity} />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{a.message}</p>
                  {a.acknowledged && <span className="shrink-0 text-[11px] font-medium text-slate-400">acknowledged</span>}
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{a.asset}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
