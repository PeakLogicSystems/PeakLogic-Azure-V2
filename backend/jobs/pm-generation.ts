/**
 * Preventive-maintenance work-order generation — CMMS (PRD §5.20 CM-3.1 /
 * SRS §3.22, Domain Model §2.12). Pure logic: given PM schedules and the
 * current time, decide which are due and compute their next due date. No I/O
 * (mirrors silence-detection.ts / rules.ts's split — the date math stays
 * testable in isolation from DB/RLS plumbing). See pm-generation-handler.ts
 * for the tenant-scoped orchestration that turns a due schedule into real
 * work orders.
 */

const MS_PER_DAY = 86_400_000;

export interface PmSchedule {
  id: string;
  assetId: string | null; // a specific asset…
  category: string | null; // …or an asset category (a WO per matching asset)
  title: string;
  intervalDays: number;
  nextDueAt: Date;
  enabled: boolean;
}

export interface DuePmSchedule {
  scheduleId: string;
  assetId: string | null;
  category: string | null;
  title: string;
  /** Where next_due_at should be advanced to after this generation. */
  newNextDueAt: Date;
}

/**
 * Advance a due date forward by whole intervals until it is strictly after
 * `now`. Advancing by interval (not resetting to `now + interval`) keeps the
 * cadence anchored to the original schedule and prevents slow drift. If a
 * schedule is badly overdue (host was down for weeks), this catches it up in
 * one step to the next future occurrence rather than generating a backlog of
 * missed work orders — a maintenance schedule wants "do it now, next due
 * then," not a pile of retroactive tickets.
 */
export function computeNextDue(nextDueAt: Date, intervalDays: number, now: Date): Date {
  const intervalMs = intervalDays * MS_PER_DAY;
  // Defensive: the schema CHECK guarantees interval_days > 0, but never loop
  // forever if a bad row ever reaches here.
  if (intervalMs <= 0) return new Date(now.getTime() + MS_PER_DAY);

  let next = nextDueAt.getTime();
  if (next > now.getTime()) return new Date(next); // not actually due — unchanged
  const stepsBehind = Math.floor((now.getTime() - next) / intervalMs) + 1;
  next += stepsBehind * intervalMs;
  return new Date(next);
}

/**
 * Which schedules are due to generate a work order right now. A schedule is
 * due when it is enabled and its next_due_at is at or before `now`. (The DB
 * query already filters on both in practice; this pure function is the
 * testable source of truth and also computes each schedule's advanced date.)
 */
export function findDuePmSchedules(schedules: PmSchedule[], now: Date): DuePmSchedule[] {
  const due: DuePmSchedule[] = [];
  for (const s of schedules) {
    if (!s.enabled) continue;
    if (s.nextDueAt.getTime() > now.getTime()) continue;
    due.push({
      scheduleId: s.id,
      assetId: s.assetId,
      category: s.category,
      title: s.title,
      newNextDueAt: computeNextDue(s.nextDueAt, s.intervalDays, now),
    });
  }
  return due;
}
