import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { withChannelPartner, requirePartnerRole } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import type { PartnerAuthContext } from '../../shared/auth';

// API Specification §4.5 — Domain Model §4 decision 8: provisioning is
// partner_admin-initiated, no self-service signup. Every operation here
// requires partner_admin.

interface ChannelPartnerUser {
  id: string;
  channel_partner_id: string;
  cognito_sub: string;
  email: string;
  display_name: string | null;
  role: 'partner_admin' | 'technician';
  territory_id: string | null;
}

interface CreateUserBody {
  email: string;
  display_name?: string;
  role: 'partner_admin' | 'technician';
  territory_id?: string;
}

const cognito = new CognitoIdentityProviderClient({});

export async function list(_event: APIGatewayProxyEvent, auth: PartnerAuthContext): Promise<APIGatewayProxyResult> {
  return withChannelPartner(auth, async (client) => {
    const { rows } = await client.query<ChannelPartnerUser>(
      `SELECT id, channel_partner_id, cognito_sub, email, display_name, role, territory_id
       FROM channel_partner_users ORDER BY email`,
    );
    return ok(rows);
  });
}

export async function getOne(event: APIGatewayProxyEvent, auth: PartnerAuthContext): Promise<APIGatewayProxyResult> {
  const { userId } = event.pathParameters!;
  return withChannelPartner(auth, async (client) => {
    const { rows: [user] } = await client.query<ChannelPartnerUser>(
      `SELECT id, channel_partner_id, cognito_sub, email, display_name, role, territory_id
       FROM channel_partner_users WHERE id = $1`,
      [userId],
    );
    return user ? ok(user) : notFound(`Channel partner user ${userId} not found`);
  });
}

// Creates a real Cognito account in PartnerPool AND the matching DB row —
// NOT atomic across the two systems (API Specification §7 item 6,
// disclosed, not fixed). If the Cognito call succeeds but the DB insert
// fails, a real account exists with no matching row; retrying would then
// hit Cognito's own "user already exists" error on the email. Acceptable
// at design-partner-tenant scale, not production-hardened.
export async function create(event: APIGatewayProxyEvent, auth: PartnerAuthContext): Promise<APIGatewayProxyResult> {
  const body = parseBody<CreateUserBody>(event.body, event.isBase64Encoded);

  if (!body.email?.trim()) return badRequest('email is required');
  if (body.role !== 'partner_admin' && body.role !== 'technician') {
    return badRequest("role must be 'partner_admin' or 'technician'");
  }
  if (body.role === 'partner_admin' && body.territory_id) {
    return badRequest('territory_id is only meaningful for role: technician');
  }

  return withChannelPartner(auth, async (client, session) => {
    requirePartnerRole(session, 'partner_admin');

    // Admin-invited only, matching the tenant pool's selfSignUpEnabled:
    // false posture (Security Architecture §2.4). MessageAction: 'SUPPRESS'
    // so PeakLogic's own invite flow controls delivery instead of
    // Cognito's default templated email -- that invite flow itself isn't
    // built yet (tracked in project memory, not this endpoint's job).
    const cognitoResult = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: process.env.PARTNER_POOL_ID!,
      Username: body.email.trim(),
      UserAttributes: [
        { Name: 'email', Value: body.email.trim() },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'custom:channel_partner_id', Value: auth.channelPartnerId },
        ...(body.display_name ? [{ Name: 'name', Value: body.display_name }] : []),
      ],
      MessageAction: 'SUPPRESS',
    }));

    const cognitoSub = cognitoResult.User?.Attributes?.find(a => a.Name === 'sub')?.Value;
    if (!cognitoSub) {
      throw Object.assign(new Error('Cognito did not return a user sub'), { statusCode: 500 });
    }

    const { rows: [user] } = await client.query<ChannelPartnerUser>(
      `INSERT INTO channel_partner_users (channel_partner_id, cognito_sub, email, display_name, role, territory_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, channel_partner_id, cognito_sub, email, display_name, role, territory_id`,
      [auth.channelPartnerId, cognitoSub, body.email.trim(), body.display_name ?? null, body.role, body.territory_id ?? null],
    );
    return created(user);
  });
}

export async function update(event: APIGatewayProxyEvent, auth: PartnerAuthContext): Promise<APIGatewayProxyResult> {
  const { userId } = event.pathParameters!;
  const body = parseBody<{ display_name?: string; territory_id?: string | null }>(event.body, event.isBase64Encoded);

  return withChannelPartner(auth, async (client, session) => {
    requirePartnerRole(session, 'partner_admin');

    const { rows: [user] } = await client.query<ChannelPartnerUser>(
      `UPDATE channel_partner_users
       SET display_name = COALESCE($2, display_name),
           territory_id = COALESCE($3, territory_id)
       WHERE id = $1
       RETURNING id, channel_partner_id, cognito_sub, email, display_name, role, territory_id`,
      [userId, body.display_name ?? null, body.territory_id ?? null],
    );
    return user ? ok(user) : notFound(`Channel partner user ${userId} not found`);
  });
}

// Deliberately does not deactivate the Cognito account (no
// AdminDisableUser call) -- removing the DB row alone already revokes all
// meaningful access, since withChannelPartner()'s channel_partner_users
// lookup (Security Architecture §2.4) would fail closed with "Channel
// partner user not found" the moment this row is gone, regardless of
// whether the Cognito account can still technically authenticate. Left
// as a known, disclosed simplification rather than silently incomplete --
// full offboarding (Cognito deactivation too) is real, proportionate
// follow-up work, not required for the access-control guarantee itself.
export async function remove(event: APIGatewayProxyEvent, auth: PartnerAuthContext): Promise<APIGatewayProxyResult> {
  const { userId } = event.pathParameters!;

  return withChannelPartner(auth, async (client, session) => {
    requirePartnerRole(session, 'partner_admin');

    const { rows: [user] } = await client.query<ChannelPartnerUser>(
      'DELETE FROM channel_partner_users WHERE id = $1 RETURNING id',
      [userId],
    );
    return user ? ok(user) : notFound(`Channel partner user ${userId} not found`);
  });
}
