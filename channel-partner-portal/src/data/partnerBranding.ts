// Mirrors Domain Model §2.1's ChannelPartner.branding shape exactly
// (logo_url/primary_color/secondary_color) and what GET /v1/partner
// (API Specification §4.5) would return -- this is deliberately typed
// and shaped like the real API response, not a demo-only convenience
// type, so wiring this to the actual endpoint later is a drop-in swap.
export interface PartnerBranding {
  name: string;
  tagline: string;
  logoText: string; // rendered as styled text -- no real uploaded logo asset exists for this demo partner
  primaryColor: string;
  secondaryColor: string;
}

// Real prospective channel partner, not a placeholder -- WTR DR
// (wtrdr.com), a pool service company in Land O' Lakes, FL. Branding
// details (blue/white palette, "wtr dr" lowercase wordmark, "Your
// Prescription for Clean WTR" tagline) pulled from their real public
// site, 2026-07-16, for an accurate investor-facing demo rather than
// an invented placeholder brand.
//
// In the real system this resolves server-side from the requested
// partner's own subdomain/slug (undesigned specifically -- UX
// Wireframes §3 item 3 flags "no self-service signup, no 'forgot
// branding' fallback" as open) and is fetched via GET /v1/partner
// before authentication. Hardcoded here since no backend exists to
// call -- swap this constant for a real fetch once one does.
export const DEMO_PARTNER: PartnerBranding = {
  name: 'WTR DR',
  tagline: 'Your Prescription for Clean WTR',
  logoText: 'wtr dr',
  primaryColor: '#0EA5E9',
  secondaryColor: '#0C4A6E',
};
