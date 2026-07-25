/**
 * CMMS work-order lifecycle — the dispatch funnel, pure.
 *
 * Reporting/KPI design (#32) + Domain Model §2.12 + PRD §5.20. A work order is
 * the existing `service_tickets` row; its funnel is tracked by four timestamp
 * columns (dispatched_at → accepted_at → on_site_at → completed_at), NOT by the
 * `status` enum. This module is the pure funnel logic: derive the stage a work
 * order has reached, compute a forward-only/idempotent stage advance, and roll
 * a set of work orders into the dispatched→on-site conversion funnel (the value
 * KPI). No I/O — see work-order-lifecycle-handler.ts for the DB writer that
 * applies an advance and records the service_visit on completion.
 */

export type WorkOrderStage = 'dispatched' | 'accepted' | 'on_site' | 'completed';
export const WORK_ORDER_STAGES: readonly WorkOrderStage[] = ['dispatched', 'accepted', 'on_site', 'completed'];

export type TimestampColumn = 'dispatched_at' | 'accepted_at' | 'on_site_at' | 'completed_at';
const STAGE_COLUMN: Record<WorkOrderStage, TimestampColumn> = {
  dispatched: 'dispatched_at',
  accepted: 'accepted_at',
  on_site: 'on_site_at',
  completed: 'completed_at',
};

export interface WorkOrderTimestamps {
  dispatchedAt: Date | null;
  acceptedAt: Date | null;
  onSiteAt: Date | null;
  completedAt: Date | null;
}

/**
 * The furthest stage a work order has reached, or null if it isn't dispatched
 * yet. Checked highest-first so a work order where a technician went straight
 * on-site (no separate "accepted" timestamp) still reads as `on_site`.
 */
export function currentStage(ts: WorkOrderTimestamps): WorkOrderStage | null {
  if (ts.completedAt) return 'completed';
  if (ts.onSiteAt) return 'on_site';
  if (ts.acceptedAt) return 'accepted';
  if (ts.dispatchedAt) return 'dispatched';
  return null;
}

function stageIndex(s: WorkOrderStage | null): number {
  return s === null ? -1 : WORK_ORDER_STAGES.indexOf(s);
}

export interface AdvanceResult {
  /** true when the target stage is already reached (or would move backward) — the caller does nothing. */
  noop: boolean;
  /** the timestamp column to set, or null on a no-op. A fixed enum value — safe to interpolate into SQL. */
  timestampColumn: TimestampColumn | null;
  /** true only when THIS advance moves the work order to completed — the trigger to record a service_visit. */
  reachedCompletion: boolean;
  /** the `status` column update implied by this stage, or null to leave it unchanged. */
  newStatus: 'in_progress' | 'completed' | null;
}

/**
 * Compute a forward-only, idempotent advance to `to`.
 *
 * Monotonic by design: advancing to a stage already reached — or attempting to
 * move backward — is a no-op (the funnel never regresses, and a completed work
 * order is never re-completed / never records a second visit). Only a genuine
 * forward move sets a timestamp; `completed` additionally signals a visit.
 */
export function advanceWorkOrder(ts: WorkOrderTimestamps, to: WorkOrderStage): AdvanceResult {
  const from = stageIndex(currentStage(ts));
  const target = stageIndex(to);
  if (target < 0) throw new Error(`unknown work-order stage: ${to}`);

  if (target <= from) {
    return { noop: true, timestampColumn: null, reachedCompletion: false, newStatus: null };
  }

  const newStatus = to === 'completed' ? 'completed' : to === 'accepted' || to === 'on_site' ? 'in_progress' : null;
  return { noop: false, timestampColumn: STAGE_COLUMN[to], reachedCompletion: to === 'completed', newStatus };
}

export interface Funnel {
  dispatched: number;
  accepted: number;
  onSite: number;
  completed: number;
  acceptedRate: number; // accepted / dispatched (%)
  onSiteRate: number; // on-site / accepted (%)
  completedRate: number; // completed / on-site (%)
  conversionRate: number; // HEADLINE: on-site / dispatched (%) — dispatched→on-site
}

/**
 * Roll a set of work orders into the dispatch→service-call funnel. Counts are
 * cumulative-by-stage (an order that reached on-site counts in dispatched,
 * accepted, and on-site), so the funnel is monotonic even when intermediate
 * timestamps were skipped — the same headline (dispatched→on-site) the
 * Reporting/KPI design specifies, computed from real timestamps rather than a
 * stored number.
 */
export function computeFunnel(orders: WorkOrderTimestamps[]): Funnel {
  let dispatched = 0, accepted = 0, onSite = 0, completed = 0;
  for (const o of orders) {
    const s = stageIndex(currentStage(o));
    if (s >= 0) dispatched++;
    if (s >= 1) accepted++;
    if (s >= 2) onSite++;
    if (s >= 3) completed++;
  }
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  return {
    dispatched,
    accepted,
    onSite,
    completed,
    acceptedRate: pct(accepted, dispatched),
    onSiteRate: pct(onSite, accepted),
    completedRate: pct(completed, onSite),
    conversionRate: pct(onSite, dispatched),
  };
}
