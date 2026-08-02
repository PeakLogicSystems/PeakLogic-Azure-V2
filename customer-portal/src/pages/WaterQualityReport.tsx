import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Droplets, FlaskConical, Info, Wrench } from 'lucide-react';
import { siteById } from '@/data';
import {
  waterQualityReportsForSite,
  type ReagentEntry,
  type SensedReading,
} from '@/data/waterQuality';

// Water-Quality Report — PRD §5.17 / SRS §3.19 (PW-1–PW-14).
// Ported from the retired frontend/ app (2026-08-01) into the Customer Portal,
// which is the correct home: this report is written for the person who OWNS the
// water, not for the service company that maintains it.
//
// PW-7/PW-8 specify partner-branded EMAIL delivery. No outbound email
// infrastructure exists anywhere in this repo, so that is not built. Rendering
// the report as an in-app page sidesteps the missing delivery mechanism without
// pretending it exists — the banner below says exactly that.
//
// PW-4/PW-4.1 is the line this layout exists to hold: a technician-entered
// value is ATTESTED, not measured. Sensed and reagent parameters are therefore
// separate sections with their own provenance badges, never one merged table.
// Do not "simplify" them together.

const inRange = (v: number | null, [lo, hi]: [number, number]): 'in' | 'out' | null =>
  v === null ? null : v >= lo && v <= hi ? 'in' : 'out';

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${iso}T00:00:00`));

const fmtPeriod = (a: string, b: string) =>
  `${fmtDay(a)} – ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${b}T00:00:00`))}`;

function RangePill({ status }: { status: 'in' | 'out' | null }) {
  if (status === null) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">No reading</span>;
  return status === 'in' ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">In range</span>
  ) : (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-400">Out of range</span>
  );
}

// Deliberately hand-rolled rather than pulling in a charting library for one
// page. The property that matters is that a coverage gap renders as an actual
// BREAK in the line — a charting default that interpolates across missing days
// would silently invent data the sensor never produced, which is the exact
// failure this report is designed not to commit.
function GapAwareSparkline({ points }: { points: { date: string; value: number | null }[] }) {
  const W = 260, H = 44, PAD = 3;
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (vals.length === 0) return <div className="h-11 text-xs text-slate-400">No data for this period</div>;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(points.length - 1, 1);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  // Build one path per contiguous run of real readings; gaps produce separate
  // paths, so nothing is drawn across them.
  const runs: string[] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur.length) runs.push(cur.join(' '));
      cur = [];
    } else {
      cur.push(`${cur.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
    }
  });
  if (cur.length) runs.push(cur.join(' '));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="mt-2 overflow-visible" role="img" aria-label="Daily trend">
      {runs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="text-brand-purple-mid" />
      ))}
      {points.map((p, i) =>
        p.value === null ? (
          <circle key={i} cx={x(i)} cy={H / 2} r="1.5" className="fill-slate-300 dark:fill-slate-600" />
        ) : null,
      )}
    </svg>
  );
}

function SensedCard({ reading }: { reading: SensedReading }) {
  const status = inRange(reading.value, reading.range);
  const gaps = reading.trend.filter((t) => t.value === null).length;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{reading.label}</p>
        <RangePill status={status} />
      </div>
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
        {reading.value === null ? '—' : reading.value}
        {reading.unit && reading.value !== null ? <span className="ml-1 text-sm font-medium text-slate-400">{reading.unit}</span> : null}
      </p>
      <p className="text-[11px] text-slate-400">
        Target {reading.range[0]}–{reading.range[1]} {reading.unit}
      </p>
      <GapAwareSparkline points={reading.trend} />
      {gaps > 0 && (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          {gaps} day{gaps === 1 ? '' : 's'} with no reading — shown as a gap, not estimated
        </p>
      )}
    </div>
  );
}

function ReagentRow({ entry }: { entry: ReagentEntry }) {
  const status = inRange(entry.value, entry.range);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{entry.label}</p>
        <p className="text-[11px] text-slate-400">Target {entry.range[0]}–{entry.range[1]} {entry.unit}</p>
      </div>
      <p className="tabular-nums text-sm font-semibold text-slate-900 dark:text-white">
        {entry.value} <span className="text-xs font-normal text-slate-400">{entry.unit}</span>
      </p>
      <RangePill status={status} />
    </li>
  );
}

export function WaterQualityReport() {
  const { siteId } = useParams();
  const site = siteId ? siteById(siteId) : undefined;
  const reports = siteId ? waterQualityReportsForSite(siteId) : [];
  const [idx, setIdx] = useState(0);

  if (!site) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Site not found.</p>
        <Link to="/" className="text-sm text-brand-purple-mid">Back to home</Link>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="space-y-3">
        <Link to={`/sites/${site.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">
          <ArrowLeft size={14} /> Back to {site.name}
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          No water-quality report is available for this site. This site has no pool-chemistry monitoring.
        </div>
      </div>
    );
  }

  const r = reports[idx];

  return (
    <div className="space-y-4">
      <Link to={`/sites/${site.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">
        <ArrowLeft size={14} /> Back to {site.name}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <Droplets size={19} className="text-brand-purple-mid" /> Water Quality Report
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {site.name} · Reporting period: <strong className="text-slate-700 dark:text-slate-200">{fmtPeriod(r.periodStart, r.periodEnd)}</strong>
          </p>
        </div>
        {reports.length > 1 && (
          <select
            value={idx}
            onChange={(e) => setIdx(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            {reports.map((rep, i) => (
              <option key={rep.periodStart} value={i}>{fmtPeriod(rep.periodStart, rep.periodEnd)}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Preview. This report is designed to be emailed to you by your service provider; that delivery is not built yet, so it
          is shown here in the app instead. Figures are preview data.
        </span>
      </div>

      {r.coverageNote && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          {r.coverageNote}
        </p>
      )}

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Sensed parameters</h2>
          <span className="rounded-full bg-brand-purple-soft px-2 py-0.5 text-[11px] font-semibold text-brand-purple dark:bg-brand-purple/20 dark:text-brand-purple-mid">
            Measured continuously by sensor
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {r.sensed.map((s) => <SensedCard key={s.key} reading={s} />)}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
            <FlaskConical size={15} className="text-slate-400" /> Reagent test panel
          </h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Entered by technician — attested, not measured
          </span>
        </div>

        {r.reagentPanel === null ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <strong className="text-slate-700 dark:text-slate-200">Not tested this period.</strong> No technician visit took place,
            so no reagent panel was run. Earlier values are deliberately not repeated here — they would not describe this period.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
              Tested {fmtDay(r.reagentPanel.testDate)} by {r.reagentPanel.technician}
            </p>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {r.reagentPanel.entries.map((e) => <ReagentRow key={e.key} entry={e} />)}
            </ul>
            {r.reagentPanel.photoUrl && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Camera size={13} /> Photo attached (preview)
              </p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
          <Wrench size={15} className="text-slate-400" /> Services performed
        </h2>
        {r.serviceVisits.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            No service visits were recorded during this period.
          </p>
        ) : (
          <ul className="space-y-2">
            {r.serviceVisits.map((v) => (
              <li key={v.date} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fmtDay(v.date)} · {v.technician}</p>
                <ul className="mt-1 list-inside list-disc text-sm text-slate-600 dark:text-slate-300">
                  {v.services.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Sensed values are measured continuously by installed equipment. Reagent-panel values are entered by your technician and
        are attested rather than measured — the distinction is kept deliberately, so you always know which is which.
      </p>
    </div>
  );
}
