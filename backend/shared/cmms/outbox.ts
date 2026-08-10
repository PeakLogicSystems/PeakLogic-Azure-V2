import type { PoolClient } from 'pg';
import type { CmmsConnector, WorkOrder, BillingRecord, DispatchResult } from './types';
import { getAdapter } from './adapters';
import { resolveConnectorSecret } from './credentials';

// Durable dispatch outbox — closes the gap alerts.ts's createTicketForAlert()
// has disclosed in its own comment since the CMMS connector framework was
// first built: "fire-and-forget... a durable retry sweep for dispatches
// that never confirm is the next increment (CMMS Dispatch §6 phase 1
// outbox)." Rows are never deleted, only transitioned pending -> sent |
// failed, so this table doubles as a dispatch audit trail — closes the
// same "a missed dispatch is a missed service call and a missed KPI event"
// reliability gap reporting-and-kpi-design.md §2.2 names explicitly.
//
// Two dispatch paths share this one durable store:
//   1. An immediate, non-blocking attempt right after enqueue (low latency
//      for the common case — most dispatches succeed on the first try).
//   2. The scheduled sweep (cmms-dispatch-sweep.main.ts) picks up anything
//      still 'pending' — either the immediate attempt never got a chance
//      to run (a cold start, a crashed invocation) or it failed — and
//      retries with backoff. The outbox row is the single source of truth
//      either way; the immediate attempt is purely a latency optimization,
//      never a substitute for durability.

type Queryable = Pick<PoolClient, 'query'>;

export type OutboxKind = 'work_order' | 'billing_record';

export interface OutboxRow {
  id: string;
  tenantId: string;
  connectorId: string;
  ticketId: string | null;
  kind: OutboxKind;
  payload: WorkOrder | BillingRecord;
  attemptCount: number;
  nextAttemptAt: Date;
}

// Backoff schedule — a disclosed engineering-estimate placeholder, same
// honesty as every other interval constant in this codebase (e.g.
// silence-detection.ts's DEFAULT_REPORTING_INTERVAL_S): nothing has ever
// dispatched to a real CMMS vendor in production, so there is no real
// retry-success-rate data to tune against yet. Gives up after the 6th
// attempt (~66 minutes total) rather than retrying forever — a dispatch
// still failing after that many attempts needs a human, not another retry.
const BACKOFF_SECONDS = [30, 120, 300, 900, 1800, 2400];
const MAX_ATTEMPTS = BACKOFF_SECONDS.length;

/** PURE. */
export function nextBackoffAt(attemptCount: number, now: Date = new Date()): Date {
  const seconds = BACKOFF_SECONDS[Math.min(attemptCount, BACKOFF_SECONDS.length - 1)];
  return new Date(now.getTime() + seconds * 1000);
}

/** PURE. */
export function hasExhaustedRetries(attemptCount: number): boolean {
  return attemptCount >= MAX_ATTEMPTS;
}

export async function enqueueOutbox(
  client: Queryable,
  args: {
    tenantId: string;
    connectorId: string;
    ticketId: string | null;
    kind: OutboxKind;
    payload: WorkOrder | BillingRecord;
  },
): Promise<string> {
  const { rows: [row] } = await client.query<{ id: string }>(
    `INSERT INTO cmms_dispatch_outbox (tenant_id, connector_id, ticket_id, kind, payload)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [args.tenantId, args.connectorId, args.ticketId, args.kind, JSON.stringify(args.payload)],
  );
  return row.id;
}

export async function claimDueOutboxRows(client: Queryable, now: Date = new Date(), limit = 50): Promise<OutboxRow[]> {
  const { rows } = await client.query<{
    id: string;
    tenant_id: string;
    connector_id: string;
    ticket_id: string | null;
    kind: OutboxKind;
    payload: WorkOrder | BillingRecord;
    attempt_count: number;
    next_attempt_at: Date;
  }>(
    `SELECT id, tenant_id, connector_id, ticket_id, kind, payload, attempt_count, next_attempt_at
     FROM cmms_dispatch_outbox
     WHERE status = 'pending' AND next_attempt_at <= $1
     ORDER BY next_attempt_at
     LIMIT $2`,
    [now, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    connectorId: r.connector_id,
    ticketId: r.ticket_id,
    kind: r.kind,
    payload: r.payload,
    attemptCount: r.attempt_count,
    nextAttemptAt: r.next_attempt_at,
  }));
}

export async function recordOutboxResult(
  client: Queryable,
  rowId: string,
  attemptCountBeforeThisTry: number,
  result: DispatchResult,
  now: Date = new Date(),
): Promise<void> {
  if (result.ok) {
    await client.query(
      `UPDATE cmms_dispatch_outbox SET status = 'sent', external_ref = $1, updated_at = now() WHERE id = $2`,
      [result.externalRef, rowId],
    );
    return;
  }

  const attemptCount = attemptCountBeforeThisTry + 1;
  if (hasExhaustedRetries(attemptCount)) {
    await client.query(
      `UPDATE cmms_dispatch_outbox SET status = 'failed', attempt_count = $1, last_error = $2, updated_at = now() WHERE id = $3`,
      [attemptCount, result.error ?? 'unknown error', rowId],
    );
    return;
  }

  await client.query(
    `UPDATE cmms_dispatch_outbox SET attempt_count = $1, last_error = $2, next_attempt_at = $3, updated_at = now() WHERE id = $4`,
    [attemptCount, result.error ?? 'unknown error', nextBackoffAt(attemptCount, now), rowId],
  );
}

/**
 * Resolve the connector's adapter + credential and make one real dispatch
 * attempt for an outbox row, recording the result durably either way. Used
 * by both the immediate post-enqueue attempt and the scheduled sweep — the
 * single place "how do we actually try to send this" is implemented, so
 * the two callers can't drift.
 *
 * Never throws: an adapter lookup failure, a credential-resolution failure,
 * and an adapter that threw instead of returning a DispatchResult are all
 * caught and recorded as a failed attempt (eligible for retry / eventual
 * `failed` status), never left as an unrecorded outbox row.
 */
export async function attemptOutboxDispatch(client: Queryable, row: OutboxRow, connector: CmmsConnector): Promise<void> {
  const adapter = getAdapter(connector.vendor);
  if (!adapter) {
    await recordOutboxResult(client, row.id, row.attemptCount, {
      ok: false,
      externalRef: null,
      error: `no adapter registered for vendor "${connector.vendor}"`,
    });
    return;
  }

  let secret: string | null = null;
  try {
    secret = connector.credentialRef ? await resolveConnectorSecret(connector.credentialRef) : null;
  } catch (err) {
    await recordOutboxResult(client, row.id, row.attemptCount, {
      ok: false,
      externalRef: null,
      error: `credential resolution failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  let result: DispatchResult;
  try {
    if (row.kind === 'work_order') {
      result = await adapter.send(connector, row.payload as WorkOrder, secret);
    } else if (adapter.sendBilling) {
      result = await adapter.sendBilling(connector, row.payload as BillingRecord, secret);
    } else {
      result = { ok: false, externalRef: null, error: `adapter for vendor "${connector.vendor}" does not support billing export` };
    }
  } catch (err) {
    result = { ok: false, externalRef: null, error: err instanceof Error ? err.message : String(err) };
  }

  await recordOutboxResult(client, row.id, row.attemptCount, result);

  // On a confirmed work_order dispatch, persist the vendor's returned id
  // onto the ticket itself — service_tickets.external_ref is what the
  // inbound callback (cmms-callback.main.ts) later looks up by
  // (connector_id, external_ref) to reconcile funnel-stage updates back to
  // this ticket. This was a real, silent gap before the outbox existed:
  // the prior fire-and-forget dispatch never wrote external_ref anywhere.
  if (result.ok && result.externalRef && row.kind === 'work_order' && row.ticketId) {
    await client.query(`UPDATE service_tickets SET external_ref = $1, updated_at = now() WHERE id = $2`, [
      result.externalRef,
      row.ticketId,
    ]);
  }
}
