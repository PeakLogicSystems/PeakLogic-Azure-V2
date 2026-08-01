import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withChannelPartner, requirePartnerRole } from '../../shared/db';
import { ok, created, notFound, badRequest, parseBody } from '../../shared/response';
import { createEntraUser } from '../../shared/identity';
import { writeAuditLog } from '../../shared/audit';
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

export async function list(_event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  return withChannelPartner(auth, async (client) => {
    const { rows } = await client.query<ChannelPartnerUser>(
      `SELECT id, channel_partner_id, cognito_sub, email, display_name, role, territory_id
       FROM channel_partner_users ORDER BY email`,
    );
    return ok(rows);
  });
}

export async function getOne(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
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

// Creates a user in the PeakLogicPartners Entra tenant AND the matching DB
// row — NOT atomic across the two systems (API Specification §7 item 6,
// disclosed, not fixed). No App Role is assigned here: a channel-partner
// user's role (partner_admin/technician) comes from channel_partner_users.
// role, resolved at request time by withChannelPartner(), not from a token
// claim (Security Architecture §2.4) — so createEntraUser is called without
// an appRole for the 'partners' kind.
export async function create(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
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

    // Admin-invited only (Security Architecture §2.4). The channel_partner_id
    // is set as an Entra custom attribute so getPartnerAuth() can read it
    // from the token; the returned oid is the stable subject stored in
    // channel_partner_users.cognito_sub (Security Architecture §2.5).
    const { oid } = await createEntraUser('partners', {
      email: body.email.trim(),
      displayName: body.display_name,
      channelPartnerId: auth.channelPartnerId,
    });

    const { rows: [user] } = await client.query<ChannelPartnerUser>(
      `INSERT INTO channel_partner_users (channel_partner_id, cognito_sub, email, display_name, role, territory_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, channel_partner_id, cognito_sub, email, display_name, role, territory_id`,
      [auth.channelPartnerId, oid, body.email.trim(), body.display_name ?? null, body.role, body.territory_id ?? null],
    );

    await writeAuditLog(client, {
      scope: 'channel_partner', channelPartnerId: auth.channelPartnerId, actorChannelPartnerUserId: session.channelPartnerUserId,
      action: 'partner_user.create', targetEntity: 'channel_partner_user', targetId: user.id,
      newValue: { email: user.email, role: user.role },
    });
    return created(user);
  });
}

export async function update(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
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
    if (!user) return notFound(`Channel partner user ${userId} not found`);

    await writeAuditLog(client, {
      scope: 'channel_partner', channelPartnerId: auth.channelPartnerId, actorChannelPartnerUserId: session.channelPartnerUserId,
      action: 'partner_user.update', targetEntity: 'channel_partner_user', targetId: user.id, newValue: body,
    });
    return ok(user);
  });
}

// CORRECTED 2026-08-01 (Water-Sector Security Hardening Strategy §5 Tier
// 0.2) — this comment previously claimed removing the DB row alone "already
// revokes all meaningful access." That's incomplete: getPartnerAuth()
// resolves channelPartnerId from the Entra JWT's claims directly (Security
// Architecture §2.4); it's only the SEPARATE channel_partner_users lookup
// inside withChannelPartner() that fails closed once this row is gone — so
// access genuinely IS cut off for any call going through that lookup, but a
// still-valid, unexpired JWT is not itself revoked at the identity-provider
// level. Left as-is for the request path, which is what actually matters
// here (unlike settings-team.ts's remove(), which has no equivalent DB-side
// gate at all — see that file's parallel correction). Full Entra-side
// deactivation remains real, proportionate follow-up work.
export async function remove(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  const { userId } = event.pathParameters!;

  return withChannelPartner(auth, async (client, session) => {
    requirePartnerRole(session, 'partner_admin');

    const { rows: [user] } = await client.query<ChannelPartnerUser>(
      'DELETE FROM channel_partner_users WHERE id = $1 RETURNING id',
      [userId],
    );
    if (!user) return notFound(`Channel partner user ${userId} not found`);

    await writeAuditLog(client, {
      scope: 'channel_partner', channelPartnerId: auth.channelPartnerId, actorChannelPartnerUserId: session.channelPartnerUserId,
      action: 'partner_user.remove', targetEntity: 'channel_partner_user', targetId: user.id,
    });
    return ok(user);
  });
}
