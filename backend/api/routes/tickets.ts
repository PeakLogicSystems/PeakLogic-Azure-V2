import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withTenant } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import { requireRole } from '../../shared/auth';
import { postWebhook } from '../../shared/webhook';
import type { AuthContext } from '../../shared/auth';
import type { ServiceTicket } from '../../shared/types';
import { advanceWorkOrderStage } from '../../shared/cmms/work-order-lifecycle-handler';
import { computeFunnel, WORK_ORDER_STAGES, type WorkOrderStage } from '../../shared/cmms/work-order-lifecycle';

interface TicketBody {
  assetId: string;
  alertId?: string;
  title: string;
  description?: string;
  priority?: ServiceTicket['priority'];
  webhookUrl?: string;
  dueAt?: string;
}

export async function list(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const status = event.queryStringParameters?.status;

  return withTenant(auth.tenantId, async (client) => {
    const { rows } = await client.query<ServiceTicket>(
      `SELECT t.*, a.name AS asset_name, s.name AS site_name
       FROM service_tickets t
       JOIN assets a ON a.id = t.asset_id
       JOIN sites  s ON s.id = a.site_id
       ${status ? 'WHERE t.status = $1' : ''}
       ORDER BY t.created_at DESC
       LIMIT 200`,
      status ? [status] : [],
    );
    return ok(rows);
  });
}

export async function getOne(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const { ticketId } = event.pathParameters!;
  return withTenant(auth.tenantId, async (client) => {
    const { rows: [ticket] } = await client.query<ServiceTicket>(
      `SELECT t.*, a.name AS asset_name FROM service_tickets t JOIN assets a ON a.id = t.asset_id WHERE t.id = $1`,
      [ticketId],
    );
    return ticket ? ok(ticket) : notFound(`Ticket ${ticketId} not found`);
  });
}

export async function create(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin', 'operator');
  const body = parseBody<TicketBody>(event.body, event.isBase64Encoded);

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [ticket] } = await client.query<ServiceTicket>(
      `INSERT INTO service_tickets
         (tenant_id, alert_id, asset_id, title, description, priority, webhook_url, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        auth.tenantId,
        body.alertId ?? null,
        body.assetId,
        body.title,
        body.description ?? null,
        body.priority ?? 'medium',
        body.webhookUrl ?? null,
        body.dueAt ?? null,
      ],
    );

    // Fire-and-forget webhook — do not block the response. postWebhook
    // validates the URL (Threat Model §4 — SSRF guard, rejects anything but
    // https:// resolving to a public address) before ever calling fetch().
    if (ticket.webhook_url) {
      postWebhook(ticket.webhook_url, {
        event: 'ticket.created',
        ticket: {
          id:          ticket.id,
          title:       ticket.title,
          description: ticket.description,
          priority:    ticket.priority,
          assetId:     ticket.asset_id,
          alertId:     ticket.alert_id,
          createdAt:   ticket.created_at,
        },
      }).catch((err: unknown) =>
        console.error('Webhook delivery failed', ticket.id, err),
      );
    }

    return created(ticket);
  });
}

export async function update(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin', 'operator');
  const { ticketId } = event.pathParameters!;
  const body = parseBody<{ status?: ServiceTicket['status']; assignedTo?: string; externalRef?: string }>(
    event.body, event.isBase64Encoded,
  );

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [ticket] } = await client.query<ServiceTicket>(
      `UPDATE service_tickets
       SET status       = COALESCE($2, status),
           assigned_to  = COALESCE($3, assigned_to),
           external_ref = COALESCE($4, external_ref),
           resolved_at  = CASE WHEN $2 = 'completed' THEN now() ELSE resolved_at END,
           updated_at   = now()
       WHERE id = $1
       RETURNING *`,
      [ticketId, body.status, body.assignedTo, body.externalRef],
    );
    return ticket ? ok(ticket) : notFound(`Ticket ${ticketId} not found`);
  });
}

export async function remove(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  const { ticketId } = event.pathParameters!;

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [t] } = await client.query<ServiceTicket>(
      `UPDATE service_tickets SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *`,
      [ticketId],
    );
    return t ? ok(t) : notFound(`Ticket ${ticketId} not found`);
  });
}

interface AdvanceBody {
  stage: WorkOrderStage;
  outcome?: string | null;
  notes?: string | null;
}

/**
 * POST /v1/tickets/{ticketId}/advance — move a work order along the dispatch
 * funnel (dispatched → accepted → on_site → completed). Idempotent and
 * forward-only; on completion it records the service_visit that feeds the
 * conversion KPI and the AI training loop.
 */
export async function advance(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const { ticketId } = event.pathParameters!;
  const body = parseBody<AdvanceBody>(event.body, event.isBase64Encoded);
  if (!body.stage || !WORK_ORDER_STAGES.includes(body.stage)) {
    return badRequest(`stage must be one of: ${WORK_ORDER_STAGES.join(', ')}`);
  }
  return withTenant(auth.tenantId, async (client) => {
    const result = await advanceWorkOrderStage(client, auth.tenantId, ticketId, body.stage, new Date(), {
      outcome: body.outcome,
      notes: body.notes,
    });
    // { advanced, visitCreated } — advanced:false is a valid idempotent no-op
    // (already at/past the stage) or an unknown ticket (RLS-scoped miss).
    return ok(result);
  });
}

/** GET /v1/tickets/funnel — the dispatched→on-site conversion funnel across the tenant's work orders. */
export async function funnel(_event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  return withTenant(auth.tenantId, async (client) => {
    const { rows } = await client.query<{
      dispatched_at: Date | null;
      accepted_at: Date | null;
      on_site_at: Date | null;
      completed_at: Date | null;
    }>('SELECT dispatched_at, accepted_at, on_site_at, completed_at FROM service_tickets');
    const f = computeFunnel(
      rows.map((r) => ({
        dispatchedAt: r.dispatched_at,
        acceptedAt: r.accepted_at,
        onSiteAt: r.on_site_at,
        completedAt: r.completed_at,
      })),
    );
    return ok(f);
  });
}

