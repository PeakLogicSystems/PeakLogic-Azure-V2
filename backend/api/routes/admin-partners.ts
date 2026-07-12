import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withStaffSession } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import { requireStaffRole } from '../../shared/auth';
import type { StaffAuthContext } from '../../shared/auth';

interface ChannelPartner {
  id: string;
  name: string;
  contact_info: Record<string, unknown>;
  branding: Record<string, unknown> | null;
  status: string;
  created_at: Date;
}

interface CreatePartnerBody {
  name: string;
  contact_info?: Record<string, unknown>;
}

// API Specification §4.7 — IA-3. channel_partners has no RLS at all
// (Database Schema §4.5's disclosed scope decision: retrofitting it would
// require re-auditing every existing caller first, tracked as §6 item 7,
// not done in this pass). Unlike tenants, there is no staff_tenant_access-
// style policy backing "superadmin only" here — every list()/getOne()/
// create() below sees every channel partner regardless of role, and
// requireStaffRole() on create() is the ONLY thing preventing an
// account_manager from creating one, not a structural RLS guarantee.
export async function list(_event: APIGatewayProxyEvent, auth: StaffAuthContext): Promise<APIGatewayProxyResult> {
  return withStaffSession(auth, async (client) => {
    const { rows } = await client.query<ChannelPartner>('SELECT * FROM channel_partners ORDER BY name');
    return ok(rows);
  });
}

export async function getOne(event: APIGatewayProxyEvent, auth: StaffAuthContext): Promise<APIGatewayProxyResult> {
  const { partnerId } = event.pathParameters!;
  return withStaffSession(auth, async (client) => {
    const { rows: [partner] } = await client.query<ChannelPartner>(
      'SELECT * FROM channel_partners WHERE id = $1', [partnerId],
    );
    return partner ? ok(partner) : notFound(`Channel partner ${partnerId} not found`);
  });
}

export async function create(event: APIGatewayProxyEvent, auth: StaffAuthContext): Promise<APIGatewayProxyResult> {
  requireStaffRole(auth, 'superadmin');
  const body = parseBody<CreatePartnerBody>(event.body, event.isBase64Encoded);

  if (!body.name?.trim()) return badRequest('name is required');

  return withStaffSession(auth, async (client) => {
    const { rows: [partner] } = await client.query<ChannelPartner>(
      `INSERT INTO channel_partners (name, contact_info) VALUES ($1, $2) RETURNING *`,
      [body.name.trim(), JSON.stringify(body.contact_info ?? {})],
    );
    return created(partner);
  });
}
