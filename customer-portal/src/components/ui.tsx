import type { AlertSeverity, DeviceStatus, Health, ReportStatus } from '@/data';

const HEALTH: Record<Health, { label: string; cls: string }> = {
  healthy: { label: 'Healthy', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  watch: { label: 'Watch', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  critical: { label: 'Critical', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400' },
};
export function HealthPill({ health }: { health: Health }) {
  const h = HEALTH[health];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${h.cls}`}>{h.label}</span>;
}

const DOT: Record<DeviceStatus, string> = { online: 'bg-emerald-500', fault: 'bg-amber-500', offline: 'bg-slate-400' };
export function DeviceStatusDot({ status }: { status: DeviceStatus }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[status]}`} title={status} />;
}

const SEV: Record<AlertSeverity, string> = {
  critical: 'bg-rose-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
};
export function SeverityRail({ severity }: { severity: AlertSeverity }) {
  return <span className={`absolute inset-y-0 left-0 w-1 ${SEV[severity]}`} />;
}

const REPORT: Record<ReportStatus, { label: string; cls: string }> = {
  submitted: { label: 'Submitted', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  draft: { label: 'Draft', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  due: { label: 'Due', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};
export function ReportStatusTag({ status }: { status: ReportStatus }) {
  const r = REPORT[status];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.cls}`}>{r.label}</span>;
}
