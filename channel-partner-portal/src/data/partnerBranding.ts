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

// The demo channel partner across the PeakLogic demo: Ace Septic & Waste, a
// septic / grease / wastewater service company that services the demo's
// wastewater sites (Riverside Water Reclamation, Bayfront, etc.). Navy +
// service-orange -- an authentic industrial-service palette.
//
// In the real system this resolves server-side from the partner's own
// subdomain/slug and is fetched via GET /v1/partner before authentication --
// hardcoded here since no backend exists to call; swap for a real fetch later.
export const DEMO_PARTNER: PartnerBranding = {
  name: 'Ace Septic & Waste',
  tagline: 'Septic · Grease · Wastewater Services',
  logoText: 'ACE',
  primaryColor: '#12455F', // utility navy
  secondaryColor: '#EA7317', // service orange
};
