import { describe, it, expect } from 'vitest';
import { currentStage, advanceWorkOrder, computeFunnel, type WorkOrderTimestamps } from './work-order-lifecycle';

const t = new Date('2026-07-25T10:00:00Z');
const NONE: WorkOrderTimestamps = { dispatchedAt: null, acceptedAt: null, onSiteAt: null, completedAt: null };
function at(overrides: Partial<WorkOrderTimestamps>): WorkOrderTimestamps {
  return { ...NONE, ...overrides };
}

describe('currentStage', () => {
  it('is null before dispatch', () => {
    expect(currentStage(NONE)).toBeNull();
  });
  it('reads the furthest stage reached', () => {
    expect(currentStage(at({ dispatchedAt: t }))).toBe('dispatched');
    expect(currentStage(at({ dispatchedAt: t, acceptedAt: t }))).toBe('accepted');
    expect(currentStage(at({ dispatchedAt: t, acceptedAt: t, onSiteAt: t }))).toBe('on_site');
    expect(currentStage(at({ dispatchedAt: t, completedAt: t }))).toBe('completed');
  });
  it('reads on_site even when "accepted" was skipped (tech went straight on-site)', () => {
    expect(currentStage(at({ dispatchedAt: t, onSiteAt: t }))).toBe('on_site');
  });
});

describe('advanceWorkOrder', () => {
  it('advances forward, setting the target stage timestamp column', () => {
    const r = advanceWorkOrder(at({ dispatchedAt: t }), 'accepted');
    expect(r.noop).toBe(false);
    expect(r.timestampColumn).toBe('accepted_at');
    expect(r.newStatus).toBe('in_progress');
    expect(r.reachedCompletion).toBe(false);
  });

  it('flags completion (the service_visit trigger) only when moving to completed', () => {
    const r = advanceWorkOrder(at({ dispatchedAt: t, acceptedAt: t, onSiteAt: t }), 'completed');
    expect(r.reachedCompletion).toBe(true);
    expect(r.timestampColumn).toBe('completed_at');
    expect(r.newStatus).toBe('completed');
  });

  it('is idempotent — advancing to an already-reached stage is a no-op (no second visit)', () => {
    const done = at({ dispatchedAt: t, acceptedAt: t, onSiteAt: t, completedAt: t });
    const r = advanceWorkOrder(done, 'completed');
    expect(r.noop).toBe(true);
    expect(r.reachedCompletion).toBe(false);
    expect(r.timestampColumn).toBeNull();
  });

  it('never regresses — a backward target is a no-op', () => {
    const r = advanceWorkOrder(at({ dispatchedAt: t, acceptedAt: t, onSiteAt: t }), 'accepted');
    expect(r.noop).toBe(true);
  });

  it('allows skipping a stage forward (dispatched → on_site)', () => {
    const r = advanceWorkOrder(at({ dispatchedAt: t }), 'on_site');
    expect(r.noop).toBe(false);
    expect(r.timestampColumn).toBe('on_site_at');
  });

  it('throws on an unknown stage', () => {
    expect(() => advanceWorkOrder(NONE, 'bogus' as never)).toThrow();
  });
});

describe('computeFunnel', () => {
  it('rolls work orders into a monotonic dispatched→on-site→completed funnel', () => {
    const orders = [
      at({ dispatchedAt: t, acceptedAt: t, onSiteAt: t, completedAt: t }), // completed
      at({ dispatchedAt: t, acceptedAt: t, onSiteAt: t }), // on-site
      at({ dispatchedAt: t, acceptedAt: t }), // accepted
      at({ dispatchedAt: t }), // dispatched only
    ];
    const f = computeFunnel(orders);
    expect(f.dispatched).toBe(4);
    expect(f.accepted).toBe(3);
    expect(f.onSite).toBe(2);
    expect(f.completed).toBe(1);
    // headline conversion = on-site / dispatched
    expect(f.conversionRate).toBe(50); // 2/4
    expect(f.acceptedRate).toBe(75); // 3/4
  });

  it('counts a stage-skipping order at every stage it passed (monotonic)', () => {
    // dispatched -> straight to on_site: still counts in accepted, since it reached beyond it
    const f = computeFunnel([at({ dispatchedAt: t, onSiteAt: t })]);
    expect(f.dispatched).toBe(1);
    expect(f.accepted).toBe(1);
    expect(f.onSite).toBe(1);
    expect(f.completed).toBe(0);
  });

  it('is all-zeros on empty input, with no divide-by-zero', () => {
    expect(computeFunnel([])).toMatchObject({ dispatched: 0, conversionRate: 0, acceptedRate: 0 });
  });
});
