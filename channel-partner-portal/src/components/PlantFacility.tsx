import { ArrowRight } from 'lucide-react';
import type { Site } from '@/data/types';

// A wastewater plant layout — the site's equipment as a live process flow. The
// counterpart to PoolFacility for the pool vertical. Placeholder; the Facility
// Builder (roadmapped) authors and binds these to live devices.
const DOT: Record<Site['devices'][number]['status'], string> = {
  online: 'bg-emerald-500',
  fault: 'bg-amber-500',
  offline: 'bg-slate-400',
};

export function PlantFacility({ site }: { site: Site }) {
  const nodes = site.devices;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex min-w-max items-center gap-2">
        {nodes.map((d, i) => (
          <div key={d.id} className="flex items-center gap-2">
            <div className="w-40 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[d.status]}`} />
                <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{d.type}</span>
              </div>
              <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {d.status === 'offline' ? '—' : d.reading ?? '—'}
              </p>
              <p className="truncate text-[11px] text-slate-400">{d.name}</p>
            </div>
            {i < nodes.length - 1 && <ArrowRight size={16} className="shrink-0 text-slate-300 dark:text-slate-600" />}
          </div>
        ))}
      </div>
    </div>
  );
}
