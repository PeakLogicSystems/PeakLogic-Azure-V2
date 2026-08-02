import { Download, Droplets, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CUSTOMER } from '@/data';
import { hasWaterQuality } from '@/data/waterQuality';
import { ReportStatusTag } from '@/components/ui';

// Compliance & operations reports — what a municipal customer cares about
// (NPDES/DMR regulatory reporting + operations summaries). PeakLogic's compliance
// automation drafts these from the telemetry; the operator remains the filer of
// record.
export function Reports() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Reports</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Compliance and operations reports, auto-drafted from your telemetry.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {CUSTOMER.reports.map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-purple-soft text-brand-purple dark:bg-brand-purple/20 dark:text-brand-purple-mid">
                <FileText size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{r.title}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.period} · {r.kind} · {r.date}</p>
              </div>
              <ReportStatusTag status={r.status} />
              <button
                className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-brand-purple-mid hover:text-brand-purple-mid disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                disabled={r.status === 'due'}
                title={r.status === 'due' ? 'Not generated yet' : 'Download (preview)'}
              >
                <Download size={13} /> PDF
              </button>
            </li>
          ))}
        </ul>
      </div>

      {CUSTOMER.sites.filter((s) => hasWaterQuality(s.id)).map((s) => (
        <Link
          key={s.id}
          to={`/sites/${s.id}/water-quality`}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-purple-mid dark:border-slate-800 dark:bg-slate-900"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-purple-soft text-brand-purple dark:bg-brand-purple/20 dark:text-brand-purple-mid">
            <Droplets size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">Water Quality Report</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{s.name} · weekly · sensed + technician-attested</p>
          </div>
          <span className="text-xs font-semibold text-brand-purple-mid">View</span>
        </Link>
      ))}

      <p className="text-xs text-slate-400">
        Compliance automation is operator-assist: PeakLogic drafts the report from your telemetry, but your operator remains
        the filer of record. Preview — no real filing.
      </p>
    </div>
  );
}
