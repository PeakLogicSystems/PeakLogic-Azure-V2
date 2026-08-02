import { BellRing, CheckCircle2, ChevronRight, CircleHelp, Sparkles, Wrench } from 'lucide-react';
import type { Alarm, CmmsLink, Severity } from '../types';

// The docked alarm panel (PV-2): a projection over the alerts pipeline. Each
// alarm carries its AI/threshold context and a one-click PeakAssist deep-link
// (PA-3). Acknowledge is local operator state; severity reads from a color rail.
// MooreView's floating alarm windows are redesigned to this docked, responsive
// panel.
const RAIL: Record<Severity, string> = {
  critical: 'bg-sev-critical',
  warning: 'bg-sev-warning',
  info: 'bg-sev-info',
};
const DOT: Record<Severity, string> = {
  critical: 'text-sev-critical',
  warning: 'text-sev-warning',
  info: 'text-sev-info',
};

export function AlarmPanel({
  alarms,
  onAcknowledge,
  onCollapse,
  cmms,
  workOrders = {},
  onAcknowledgeAndDispatch,
}: {
  alarms: Alarm[];
  onAcknowledge: (id: string) => void;
  onCollapse?: () => void;
  /** The site's outbound work-order link, or null when there is none. */
  cmms?: CmmsLink | null;
  workOrders?: Record<string, string>;
  onAcknowledgeAndDispatch?: (id: string) => string | null;
}) {
  // "Acknowledge & Issue WO" appears ONLY with a live link to a real
  // work-order partner. With no link — or a link that exists but is
  // disconnected — the action is absent entirely rather than shown disabled:
  // a greyed-out button still advertises a capability this site does not have,
  // and an operator in an incident should not be reading tooltips to find out
  // that dispatch was never available.
  const canDispatch = Boolean(cmms && cmms.active && onAcknowledgeAndDispatch);
  const active = alarms.filter((a) => a.status === 'active');

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          <BellRing size={16} className={active.length ? 'text-sev-critical' : 'text-slate-400'} />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Alarms</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`nums rounded-full px-2 py-0.5 text-xs font-bold ${
              active.length
                ? 'bg-sev-critical/15 text-sev-critical'
                : 'bg-emerald-500/15 text-emerald-500'
            }`}
          >
            {active.length} active
          </span>
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Collapse the alarm panel"
              aria-label="Collapse the alarm panel"
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {alarms.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
            <CheckCircle2 size={28} className="text-emerald-500" />
            <p className="text-sm">All clear — no active alarms.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {alarms.map((a) => (
              <AlarmRow
                key={a.id}
                alarm={a}
                onAcknowledge={onAcknowledge}
                cmms={canDispatch ? cmms! : null}
                workOrder={workOrders[a.id]}
                onAcknowledgeAndDispatch={canDispatch ? onAcknowledgeAndDispatch : undefined}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function AlarmRow({
  alarm,
  onAcknowledge,
  cmms,
  workOrder,
  onAcknowledgeAndDispatch,
}: {
  alarm: Alarm;
  onAcknowledge: (id: string) => void;
  cmms: CmmsLink | null;
  workOrder?: string;
  onAcknowledgeAndDispatch?: (id: string) => string | null;
}) {
  const acked = alarm.status === 'acknowledged';
  return (
    <li className={`relative pl-4 pr-3 py-3 ${acked ? 'opacity-55' : ''}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${RAIL[alarm.severity]}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{alarm.message}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className={`font-semibold uppercase ${DOT[alarm.severity]}`}>{alarm.severity}</span>
            {' · '}
            {alarm.asset} · {timeAgo(alarm.raisedAt)}
          </p>
        </div>
      </div>

      {alarm.aiContext && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-brand-purple-soft/60 px-2 py-1.5 text-xs text-brand-black dark:bg-brand-purple/15 dark:text-brand-purple-soft">
          <Sparkles size={13} className="mt-0.5 shrink-0 text-brand-purple-mid" />
          <span>{alarm.aiContext}</span>
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {acked ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-500">
            <CheckCircle2 size={13} /> Acknowledged
          </span>
        ) : (
          <>
            <button
              onClick={() => onAcknowledge(alarm.id)}
              className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
            >
              Acknowledge
            </button>
            {cmms && onAcknowledgeAndDispatch && (
              <button
                onClick={() => onAcknowledgeAndDispatch(alarm.id)}
                title={`Raise a work order to ${cmms.partner} via ${cmms.system}`}
                className="flex items-center gap-1 rounded-md bg-brand-purple px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-purple-mid"
              >
                <Wrench size={12} /> Acknowledge &amp; Issue WO
              </button>
            )}
          </>
        )}
        {workOrder && cmms && (
          <span className="flex items-center gap-1 text-xs font-medium text-brand-purple-mid">
            <Wrench size={12} /> {workOrder} → {cmms.partner}
          </span>
        )}
        <a
          href={`#/help/${alarm.helpContextKey}`}
          className="flex items-center gap-1 text-xs font-medium text-brand-purple-mid hover:underline"
          title="Open the PeakAssist explanation for this alarm"
        >
          <CircleHelp size={13} /> Help
        </a>
      </div>
    </li>
  );
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
