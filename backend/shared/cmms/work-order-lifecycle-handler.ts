import type { PoolClient } from 'pg';
import { advanceWorkOrder, type WorkOrderStage, type WorkOrderTimestamps } from './work-order-lifecycle';

// Accept either a PoolClient or a plain pg Client (both have .query) — same
// convention as dispatch.ts.
type Queryable = Pick<PoolClient, 'query'>;

export interface AdvanceOptions {
  outcome?: string | null; // the supervised label the AI feedback loop consumes (recorded on the visit)
  notes?: string | null;
}

export interface AdvanceOutcome {
  advanced: boolean; // a timestamp/status was written
  visitCreated: boolean; // a service_visit was recorded (completion)
}

/**
 * Advance a work order (service_ticket) to a funnel stage and, on completion,
 * record its service_visit — the previously-unwritten table that closes the
 * detect → dispatch → outcome → learn loop (Reporting/KPI #32; AI Analytics #34
 * consumes service_visits.outcome as a training label).
 *
 * Must run inside the caller's tenant context: `withTenant()` has already set
 * `app.current_tenant_id`, so RLS scopes every statement here — the SELECT can
 * only see this tenant's ticket, and the service_visits INSERT's WITH CHECK
 * requires the matching tenant_id. Idempotent (see advanceWorkOrder): a repeat
 * call to an already-reached stage is a no-op and never records a second visit.
 *
 * `timestampColumn` comes from advanceWorkOrder as one of four fixed enum
 * values (never user input), so interpolating it into the SQL is injection-safe.
 */
export async function advanceWorkOrderStage(
  client: Queryable,
  tenantId: string,
  ticketId: string,
  to: WorkOrderStage,
  at: Date = new Date(),
  opts: AdvanceOptions = {},
): Promise<AdvanceOutcome> {
  const { rows } = await client.query<{
    dispatched_at: Date | null;
    accepted_at: Date | null;
    on_site_at: Date | null;
    completed_at: Date | null;
  }>(
    `SELECT dispatched_at, accepted_at, on_site_at, completed_at
     FROM service_tickets WHERE id = $1`,
    [ticketId],
  );
  if (rows.length === 0) return { advanced: false, visitCreated: false }; // RLS-scoped: not found / not this tenant's

  const ts: WorkOrderTimestamps = {
    dispatchedAt: rows[0].dispatched_at,
    acceptedAt: rows[0].accepted_at,
    onSiteAt: rows[0].on_site_at,
    completedAt: rows[0].completed_at,
  };

  const result = advanceWorkOrder(ts, to);
  if (result.noop) return { advanced: false, visitCreated: false };

  if (result.newStatus) {
    await client.query(
      `UPDATE service_tickets SET ${result.timestampColumn} = $1, status = $2, updated_at = now() WHERE id = $3`,
      [at, result.newStatus, ticketId],
    );
  } else {
    await client.query(
      `UPDATE service_tickets SET ${result.timestampColumn} = $1, updated_at = now() WHERE id = $2`,
      [at, ticketId],
    );
  }

  let visitCreated = false;
  if (result.reachedCompletion) {
    await client.query(
      `INSERT INTO service_visits (tenant_id, ticket_id, outcome, on_site_at, completed_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, ticketId, opts.outcome ?? null, ts.onSiteAt ?? at, at, opts.notes ?? null],
    );
    visitCreated = true;
  }

  return { advanced: true, visitCreated };
}
