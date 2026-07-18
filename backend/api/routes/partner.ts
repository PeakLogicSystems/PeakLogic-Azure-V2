import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withChannelPartner, requirePartnerRole } from '../../shared/db';
import { ok, notFound, parseBody } from '../../shared/response';
import type { PartnerAuthContext } from '../../shared/auth';

interface ChannelPartner {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  branding: { logo_url?: string; primary_color?: string; secondary_color?: string } | null;
}

// API Specification §4.5 — GET /v1/partner, analogous to GET /v1/tenant
// (§4.3). Available to both roles.
export async function getSelf(_event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  return withChannelPartner(auth, async (client) => {
    const { rows: [partner] } = await client.query<ChannelPartner>(
      'SELECT id, name, status, branding FROM channel_partners WHERE id = $1',
      [auth.channelPartnerId],
    );
    return partner ? ok(partner) : notFound('Channel partner not found');
  });
}

interface BrandingBody {
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

// PUT /v1/partner/branding — partner_admin only. Merges into the existing
// branding JSONB rather than replacing it wholesale (API Specification
// §4.5) — an omitted field leaves its current value unchanged.
export async function updateBranding(event: PeakRequest, auth: PartnerAuthContext): Promise<PeakResponse> {
  const body = parseBody<BrandingBody>(event.body, event.isBase64Encoded);

  return withChannelPartner(auth, async (client, session) => {
    requirePartnerRole(session, 'partner_admin');

    const { rows: [partner] } = await client.query<ChannelPartner>(
      `UPDATE channel_partners
       SET branding = COALESCE(branding, '{}'::jsonb) || $2::jsonb
       WHERE id = $1
       RETURNING id, name, status, branding`,
      [auth.channelPartnerId, JSON.stringify(body)],
    );
    return partner ? ok(partner) : notFound('Channel partner not found');
  });
}
