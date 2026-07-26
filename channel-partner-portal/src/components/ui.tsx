import type { DeviceStatus, SiteHealth, TicketPriority, TicketStatus } from '@/data/types';

const HEALTH: Record<SiteHealth, { label: string; cls: string }> = {
  healthy: { label: 'Healthy', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  watch: { label: 'Watch', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  critical: { label: 'Critical', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400' },
};

export function HealthPill({ health }: { health: SiteHealth }) {
  const h = HEALTH[health];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${h.cls}`}>{h.label}</span>;
}

const DEVICE_DOT: Record<DeviceStatus, string> = {
  online: 'bg-emerald-500',
  fault: 'bg-amber-500',
  offline: 'bg-slate-400',
};

export function DeviceStatusDot({ status }: { status: DeviceStatus }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${DEVICE_DOT[status]}`} title={status} />;
}

const PRIORITY: Record<TicketPriority, string> = {
  critical: 'text-rose-600 dark:text-rose-400',
  high: 'text-amber-600 dark:text-amber-400',
  normal: 'text-slate-500 dark:text-slate-400',
};

export function PriorityTag({ priority }: { priority: TicketPriority }) {
  return <span className={`text-[11px] font-semibold uppercase ${PRIORITY[priority]}`}>{priority}</span>;
}

const TICKET: Record<TicketStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  completed: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
};

export function TicketStatusTag({ status }: { status: TicketStatus }) {
  const t = TICKET[status];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${t.cls}`}>{t.label}</span>;
}
