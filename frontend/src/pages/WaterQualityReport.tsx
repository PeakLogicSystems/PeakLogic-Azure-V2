import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Droplets, FlaskConical, Wrench, Camera, Info } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MOCK_SITES } from '@/lib/mockEstate';
import { siteWaterQualityReports, type SensedReading, type ReagentEntry } from '@/lib/mockWaterQuality';

// Prototype of PRD §5.17 / SRS §3.19 (PW-1–PW-14 / PW-1.1–PW-14.1, v1.9) —
// the first artifact built against that spec; no wireframe or backend
// entity exists yet (see mockWaterQuality.ts's header). Real delivery is
// email, partner-branded (PW-7/PW-8) — both hard-blocked on outbound email
// infrastructure that doesn't exist anywhere in this repo. This page
// sidesteps that gap by rendering the report as an authenticated in-app
// page instead: a preview of what a designated recipient would receive,
// not the delivery mechanism itself. The PREVIEW banner below says so.
//
// PW-4/PW-4.1's hard line — "a technician-entered value is attested, not
// measured, and the report must never blur that line" — is why sensed and
// technician-entered parameters are visually distinct sections with their
// own provenance badge, not one merged table.

const RANGE_BADGE = {
  in: 'bg-brand-green-soft text-green-700 dark:bg-green-500/15 dark:text-green-400',
  out: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};

function rangeStatus(value: number | null, range: [number, number]): 'in' | 'out' | null {
  if (value === null) return null;
  return value >= range[0] && value <= range[1] ? 'in' : 'out';
}

function formatDateRange(startIso: string, endIso: string): string {
  const fmt = (iso: string, withYear: boolean) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: withYear ? 'numeric' : undefined }).format(new Date(`${iso}T00:00:00`));
  return `${fmt(startIso, false)} – ${fmt(endIso, true)}`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${iso}T00:00:00`));
}

function SensedCard({ reading }: { reading: SensedReading }) {
  const status = rangeStatus(reading.value, reading.range);
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{reading.label}</p>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400 mt-1">
            <Droplets size={9} /> Sensed
          </span>
        </div>
        {status && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${RANGE_BADGE[status]}`}>
            {status === 'in' ? 'In range' : 'Out of range'}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
        {reading.value === null ? '—' : reading.value}
        {reading.unit && reading.value !== null && <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">{reading.unit}</span>}
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Target {reading.range[0]}–{reading.range[1]} {reading.unit}</p>
      <ResponsiveContainer width="100%" height={90}>
        <LineChart data={reading.trend} margin={{ top: 2, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" className="dark:opacity-10" />
          <XAxis dataKey="date" tickFormatter={d => formatDate(d)} tick={{ fontSize: 9, fill: '#9ca3af' }} interval={1} />
          <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
            labelStyle={{ fontWeight: 600 }}
            labelFormatter={d => formatDate(d as string)}
            formatter={(v) => [v == null ? 'No reading' : v, reading.label] as [string | number, string]}
          />
          <Line type="monotone" dataKey="value" stroke="#7C3AED" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReagentCard({ entry }: { entry: ReagentEntry }) {
  const status = rangeStatus(entry.value, entry.range);
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{entry.label}</p>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-purple-soft text-brand-purple dark:bg-brand-purple/20 dark:text-brand-purple-mid mt-1">
            <FlaskConical size={9} /> Technician-entered
          </span>
        </div>
        {status && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${RANGE_BADGE[status]}`}>
            {status === 'in' ? 'In range' : 'Out of range'}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
        {entry.value}
        <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">{entry.unit}</span>
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500">Target {entry.range[0]}–{entry.range[1]} {entry.unit}</p>
    </div>
  );
}

export function WaterQualityReportPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const site = MOCK_SITES.find(s => s.id === siteId);
  const reports = siteId ? siteWaterQualityReports(siteId) : [];
  const [periodIndex, setPeriodIndex] = useState(0);
  const report = reports[periodIndex];

  if (!site) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <p className="text-sm text-gray-500 dark:text-gray-400">Site not found.</p>
        <Link to="/sites" className="text-sm text-brand-purple hover:underline">Back to Sites</Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <button
        onClick={() => navigate(`/sites/${site.id}`)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      >
        <ArrowLeft size={14} /> {site.name}
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <Droplets size={18} className="text-brand-purple" />
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Water Quality Report</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{site.name}</p>
        </div>
        {reports.length > 0 && (
          <select
            value={periodIndex}
            onChange={e => setPeriodIndex(Number(e.target.value))}
            className="text-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-lg px-3 py-2"
          >
            {reports.map((r, i) => (
              <option key={r.periodStart} value={i}>{formatDateRange(r.periodStart, r.periodEnd)}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-4 py-3">
        <Info size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Preview — this is what the site's designated recipients would receive, partner-branded, by email (PW-7/PW-8).
          Outbound email delivery is not built yet, so this page renders the report in-app instead of sending it.
        </p>
      </div>

      {reports.length === 0 || !report ? (
        // PW-1/PW-1.1 empty state: a site with no chemistry device produces
        // no report — a valid state, not an error.
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-16 text-center">
          <Droplets size={32} className="mx-auto text-gray-300 dark:text-gray-700 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No water-quality report available for this site.</p>
          <p className="text-gray-400 dark:text-gray-600 text-xs mt-1">This site has no pool-chemistry device reporting yet.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2">
            Reporting period: <span className="font-medium text-gray-700 dark:text-gray-300">{formatDateRange(report.periodStart, report.periodEnd)}</span>
          </p>

          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Droplets size={15} /> Sensed parameters
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {report.sensed.map(s => <SensedCard key={s.key} reading={s} />)}
            </div>
          </div>

          {report.coverageNote && (
            <div className="flex items-start gap-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3">
              <Info size={15} className="text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-600 dark:text-gray-400">{report.coverageNote}</p>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <FlaskConical size={15} /> Reagent test panel
            </h2>
            {report.reagentPanel === null ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Not tested this period — no technician visit was recorded during {formatDateRange(report.periodStart, report.periodEnd)}.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
                  {report.reagentPanel.entries.map(e => <ReagentCard key={e.key} entry={e} />)}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                  Tested {formatDate(report.reagentPanel.testDate)} by {report.reagentPanel.technician}
                  {report.reagentPanel.photoUrl && <><span>·</span><Camera size={11} /> Photo attached</>}
                  <span>· attested by the technician, not measured by a sensor</span>
                </p>
              </>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Wrench size={15} /> Services performed
            </h2>
            {report.serviceVisits.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No service visits recorded this period.</p>
            ) : (
              <div className="space-y-3">
                {report.serviceVisits.map((v, i) => (
                  <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDate(v.date)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{v.technician}</p>
                    </div>
                    <ul className="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside space-y-0.5">
                      {v.services.map((s, j) => <li key={j}>{s}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
