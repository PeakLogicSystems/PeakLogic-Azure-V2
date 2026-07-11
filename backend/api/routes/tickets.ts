import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withTenant } from '../../shared/db';
import { ok, created, notFound, parseBody } from '../../shared/response';
import { requireRole } from '../../shared/auth';
import { postWebhook } from '../../shared/webhook';
import type { AuthContext } from '../../shared/auth';
import type { ServiceTicket } from '../../shared/types';

interface TicketBody {
  assetId: string;
  alertId?: string;
  title: string;
  description?: string;
  priority?: ServiceTicket['priority'];
  webhookUrl?: string;
  dueAt?: string;
}

export async function list(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
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

export async function getOne(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { ticketId } = event.pathParameters!;
  return withTenant(auth.tenantId, async (client) => {
    const { rows: [ticket] } = await client.query<ServiceTicket>(
      `SELECT t.*, a.name AS asset_name FROM service_tickets t JOIN assets a ON a.id = t.asset_id WHERE t.id = $1`,
      [ticketId],
    );
    return ticket ? ok(ticket) : notFound(`Ticket ${ticketId} not found`);
  });
}

export async function create(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
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

export async function update(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
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

export async function remove(event: APIGatewayProxyEvent, auth: AuthContext): Promise<APIGatewayProxyResult> {
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

