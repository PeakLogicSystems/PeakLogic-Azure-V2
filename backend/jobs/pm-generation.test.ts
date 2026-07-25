import { describe, it, expect } from 'vitest';
import { computeNextDue, findDuePmSchedules, type PmSchedule } from './pm-generation';

const now = new Date('2026-07-25T06:00:00Z');
function daysAgo(d: number): Date {
  return new Date(now.getTime() - d * 86_400_000);
}
function daysAhead(d: number): Date {
  return new Date(now.getTime() + d * 86_400_000);
}
function schedule(overrides: Partial<PmSchedule> = {}): PmSchedule {
  return {
    id: 's1',
    assetId: 'a1',
    category: null,
    title: 'Quarterly pump service',
    intervalDays: 90,
    nextDueAt: daysAgo(1),
    enabled: true,
    ...overrides,
  };
}

describe('computeNextDue', () => {
  it('advances by exactly one interval when just due', () => {
    const next = computeNextDue(now, 30, now); // due exactly now
    expect(next.getTime()).toBe(now.getTime() + 30 * 86_400_000);
  });

  it('leaves a not-yet-due date unchanged', () => {
    const future = daysAhead(5);
    expect(computeNextDue(future, 30, now).getTime()).toBe(future.getTime());
  });

  it('catches a badly-overdue schedule up to the next FUTURE occurrence in one step (no backlog)', () => {
    // due 100 days ago, 30-day interval — should not generate 3 tickets; the
    // next due date should simply be in the future.
    const next = computeNextDue(daysAgo(100), 30, now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    // and within one interval of now
    expect(next.getTime() - now.getTime()).toBeLessThanOrEqual(30 * 86_400_000);
  });

  it('never loops forever on a non-positive interval (defensive)', () => {
    const next = computeNextDue(daysAgo(1), 0, now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('findDuePmSchedules', () => {
  it('returns a due, enabled schedule with its advanced date', () => {
    const due = findDuePmSchedules([schedule({ nextDueAt: daysAgo(1), intervalDays: 90 })], now);
    expect(due).toHaveLength(1);
    expect(due[0].scheduleId).toBe('s1');
    expect(due[0].newNextDueAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it('skips a disabled schedule even when overdue', () => {
    expect(findDuePmSchedules([schedule({ enabled: false, nextDueAt: daysAgo(10) })], now)).toEqual([]);
  });

  it('skips a schedule not yet due', () => {
    expect(findDuePmSchedules([schedule({ nextDueAt: daysAhead(5) })], now)).toEqual([]);
  });

  it('carries category through for category-scoped schedules (asset resolution is the handler’s job)', () => {
    const due = findDuePmSchedules(
      [schedule({ assetId: null, category: 'pump', nextDueAt: daysAgo(1) })],
      now,
    );
    expect(due[0].assetId).toBeNull();
    expect(due[0].category).toBe('pump');
  });
});
