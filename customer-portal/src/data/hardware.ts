// The customer's own hardware register — live Hubs, and the ones that have been
// retired from their sites.
//
// This is the tenant-side copy of what the servicing partner sees. It exists
// here, in the customer's portal, because the record belongs to the CUSTOMER,
// not to whoever installed it: if Bayfront changes service providers, the
// history of what was on their sites goes with the sites, not with the outgoing
// partner. That is the whole reason a decommissioned unit is a state change
// rather than a delete.
//
// Read-only by construction. A customer watches; the partner services. There is
// no decommission action on this side and no retention control — a customer
// cannot retire hardware they do not maintain, and cannot shorten a hold on a
// record that may be the evidence in a dispute with the partner who set it.
//
// Preview data, mirroring channel-partner-portal/src/data/fleet.ts. IDs come
// from PeakLogic's single platform-wide Hub sequence, which is why they are not
// contiguous here — the units in between went to other customers.

export type HubState = 'online' | 'offline' | 'provisioning' | 'decommissioned';
export type RetentionKey = 'd30' | 'd60' | 'd90' | 'y1' | 'manual';

export const RETENTION_LABEL: Record<RetentionKey, string> = {
  d30: '30 days',
  d60: '60 days',
  d90: '90 days',
  y1: '1 year',
  manual: 'Manual deletion only',
};

export interface Hub {
  id: string;
  serial: string;
  model: string;
  siteId: string;
  label?: string;
  state: HubState;
  firmware: string;
  channel: 'stable' | 'beta' | 'preview';
  installedAt: string;
  lastSeen?: string;
  decommission?: { at: string; by: string; reason: string; retention: RetentionKey; purgeAt: string | null };
}

const iso = (daysAgo: number): string => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

export const HUBS: Hub[] = [
  {
    id: 'PLH-00001',
    serial: '4K8M20719334',
    model: 'PeakLogic Hub 400',
    siteId: 'site-riverside',
    label: 'Headworks',
    state: 'online',
    firmware: '4.2.1',
    channel: 'stable',
    installedAt: iso(624),
    lastSeen: 'just now',
  },
  {
    id: 'PLH-00004',
    serial: '4K8M20719412',
    model: 'PeakLogic Hub 400',
    siteId: 'site-riverside',
    label: 'Aeration deck',
    state: 'online',
    firmware: '4.2.1',
    channel: 'stable',
    installedAt: iso(583),
    lastSeen: 'just now',
  },
  {
    id: 'PLH-00009',
    serial: '4K8M21044190',
    model: 'PeakLogic Hub 200',
    siteId: 'site-riverside',
    label: 'Chem building',
    state: 'offline',
    firmware: '4.1.6',
    channel: 'stable',
    installedAt: iso(291),
    lastSeen: '17 min ago',
  },
  {
    id: 'PLH-00006',
    serial: '4K8M20880021',
    model: 'PeakLogic Hub 200',
    siteId: 'site-riverside',
    label: 'Chem building (original)',
    state: 'decommissioned',
    firmware: '4.0.9',
    channel: 'stable',
    installedAt: iso(701),
    lastSeen: '291 days ago',
    decommission: {
      at: iso(291),
      by: 'M. Alvarez',
      reason: 'Damaged — water ingress',
      retention: 'y1',
      purgeAt: new Date(Date.now() + 74 * 86_400_000).toISOString(),
    },
  },
];

export const liveHubsAt = (siteId: string): Hub[] => HUBS.filter((h) => h.siteId === siteId && h.state !== 'decommissioned');
export const retiredHubs = (): Hub[] => HUBS.filter((h) => h.state === 'decommissioned');
export const retiredHubsAt = (siteId: string): Hub[] => retiredHubs().filter((h) => h.siteId === siteId);

/** Days left on a hold, or null when nothing is scheduled. */
export function daysUntilPurge(h: Hub, now: Date = new Date()): number | null {
  if (!h.decommission?.purgeAt) return null;
  return Math.ceil((new Date(h.decommission.purgeAt).getTime() - now.getTime()) / 86_400_000);
}
