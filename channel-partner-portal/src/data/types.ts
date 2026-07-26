// Shared model for the multi-partner portal. The SAME app renders as any channel
// partner — Ace Septic & Waste (wastewater vertical) or WTR DR (pool vertical) —
// each with its own branding, vertical terminology, sites, devices, and work.
// This is the demonstration that two separate partner businesses, built for
// their own purposes, run on one PeakLogicSystems core. Preview data throughout.

export type SiteHealth = 'healthy' | 'watch' | 'critical';
export type DeviceStatus = 'online' | 'offline' | 'fault';
export type TicketStatus = 'open' | 'scheduled' | 'in_progress' | 'completed';
export type TicketPriority = 'critical' | 'high' | 'normal';
export type Vertical = 'wastewater' | 'pool';
export type SiteKind = 'residential' | 'commercial' | 'municipal';

export interface Device {
  id: string; // serial
  name: string;
  type: string;
  status: DeviceStatus;
  reading?: string;
  controllable: boolean;
  running?: boolean;
}

export interface Site {
  id: string;
  name: string;
  customer: string; // the tenant the partner services
  location: string;
  kind: SiteKind;
  health: SiteHealth;
  alarms: number;
  hasFacility: boolean; // a facility/pool layout has been built
  peakview: boolean; // PeakView360 operator view available
  devices: Device[];
}

export interface Ticket {
  id: string;
  title: string;
  siteId: string;
  priority: TicketPriority;
  status: TicketStatus;
  technician?: string;
  createdDaysAgo: number;
  source: 'alarm' | 'pm' | 'manual';
}

// Vertical-specific wording so each partner's portal reads for its own business.
export interface VerticalTerms {
  siteSingular: string; // "Site" / "Pool"
  sitePlural: string; // "Sites" / "Pools"
  homeGreeting: string; // dashboard subtitle
  sitesHeading: string; // "Your sites" / "Your pools"
  facilityOpen: string; // "Open Facility View" / "Open pool layout"
  facilityBuild: string; // "Build in Facility Builder" / "Draw pool & pump system"
  facilityNoun: string; // "facility" / "pool & pump layout"
}

export interface Partner {
  id: string;
  name: string;
  tagline: string;
  logoText: string;
  lowercaseLogo: boolean;
  primaryColor: string;
  secondaryColor: string;
  vertical: Vertical;
  terms: VerticalTerms;
  technicians: string[]; // the partner's field crew (for ticket assignment)
  user: { name: string; role: string; email: string }; // the signed-in portal user
  sites: Site[];
  tickets: Ticket[];
}

// ── selectors (partner-scoped) ───────────────────────────────────────────────

export const siteById = (p: Partner, id: string): Site | undefined => p.sites.find((s) => s.id === id);
export const ticketsForSite = (p: Partner, id: string): Ticket[] => p.tickets.filter((t) => t.siteId === id);
export const openTickets = (p: Partner): Ticket[] => p.tickets.filter((t) => t.status !== 'completed');

export function kpis(p: Partner) {
  const devices = p.sites.flatMap((s) => s.devices);
  return {
    sites: p.sites.length,
    devicesOnline: devices.filter((d) => d.status === 'online').length,
    devicesTotal: devices.length,
    activeAlarms: p.sites.reduce((n, s) => n + s.alarms, 0),
    openTickets: openTickets(p).length,
    faults: devices.filter((d) => d.status === 'fault').length,
  };
}
