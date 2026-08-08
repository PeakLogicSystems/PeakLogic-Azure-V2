import type { Hub } from './hubs';

// The seeded Hub fleet, per partner.
//
// IDs run in ONE sequence across every partner and every customer, exactly as
// they would in production — PLH-00001 through PLH-00014 here — because the
// sequence belongs to PeakLogic's asset register, not to any one account. The
// gaps and the ordering are the point: PLH-00003 is at a WTR DR pool and
// PLH-00004 is back at an Ace plant, because that is the order the units were
// provisioned, not the order the customers were signed.
//
// Two things this fixture exists to exercise, both of which were previously
// impossible to see in the portal:
//
//   Riverside carries THREE Hubs. A treatment plant is not one building, and
//   the headworks, the aeration deck and the chem building are each their own
//   acquisition point. The Facility View has to let an operator say which one
//   they are looking at.
//
//   Two records are already decommissioned, one against a 90-day hold and one
//   against manual-only, so the retention states are visible without waiting
//   for someone to retire something.
//
// Preview data. `state` here is what the platform would show; a real fleet
// derives it from heartbeats.
//
// This is the SINGLE canonical fleet register — the Customer Portal's own
// hardware view (customer-portal/src/data/hardware.ts) reads directly from
// HUBS_BY_PARTNER rather than carrying a second, hand-typed copy of a few of
// these records, so a change here (a firmware bump, a new install, a
// decommission) is visible on both sides with no second edit.

const iso = (daysAgo: number): string => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

export const ACE_HUBS: Hub[] = [
  {
    id: 'PLH-00001',
    serial: '4K8M20719334',
    model: 'hub-400',
    siteId: 'site-riverside',
    customer: 'Bayfront Municipal District',
    label: 'Headworks',
    state: 'online',
    channel: 'stable',
    firmware: '4.2.1',
    agent: '4.2.1',
    provisionedBy: 'control-center',
    provisionedAt: iso(624),
    tags: 48,
    lastSeen: 'just now',
  },
  {
    id: 'PLH-00004',
    serial: '4K8M20719412',
    model: 'hub-400',
    siteId: 'site-riverside',
    customer: 'Bayfront Municipal District',
    label: 'Aeration deck',
    state: 'online',
    channel: 'stable',
    firmware: '4.2.1',
    agent: '4.2.1',
    provisionedBy: 'control-center',
    provisionedAt: iso(583),
    tags: 36,
    lastSeen: 'just now',
  },
  {
    // Behind on firmware and offline — the pair of states an operator actually
    // has to act on, and the reason the switcher shows health per Hub rather
    // than one status for the whole site.
    id: 'PLH-00009',
    serial: '4K8M21044190',
    model: 'hub-200',
    siteId: 'site-riverside',
    customer: 'Bayfront Municipal District',
    label: 'Chem building',
    state: 'offline',
    channel: 'stable',
    firmware: '4.1.6',
    agent: '4.1.6',
    provisionedBy: 'field',
    provisionedAt: iso(291),
    tags: 12,
    lastSeen: '17 min ago',
  },
  {
    // In stock, not yet installed. Staff provisioned it in Control Center and
    // it shipped to the partner; an installer typing this serial in the field
    // ADOPTS this record rather than minting a second ID for hardware the
    // platform has already counted.
    id: 'PLH-00012',
    serial: '4K8M21106733',
    model: 'hub-400x',
    siteId: null,
    customer: null,
    state: 'available',
    channel: 'stable',
    firmware: '4.2.1',
    agent: '4.2.1',
    provisionedBy: 'control-center',
    provisionedAt: iso(9),
    tags: 0,
  },
  {
    id: 'PLH-00006',
    serial: '4K8M20880021',
    model: 'hub-200',
    siteId: 'site-riverside',
    customer: 'Bayfront Municipal District',
    label: 'Chem building (original)',
    state: 'decommissioned',
    channel: 'stable',
    firmware: '4.0.9',
    agent: '4.0.9',
    provisionedBy: 'control-center',
    provisionedAt: iso(701),
    tags: 12,
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

export const WTRDR_HUBS: Hub[] = [
  {
    id: 'PLH-00003',
    serial: 'B31P4T2207645',
    model: 'hub-200',
    siteId: 'pool-sunsetridge',
    customer: 'Sunset Ridge HOA',
    label: 'Pump room',
    state: 'online',
    channel: 'stable',
    firmware: '4.2.1',
    agent: '4.2.1',
    provisionedBy: 'control-center',
    provisionedAt: iso(430),
    tags: 18,
    lastSeen: 'just now',
  },
  {
    id: 'PLH-00011',
    serial: 'B31P4T2301880',
    model: 'hub-200',
    siteId: 'pool-sunsetridge',
    customer: 'Sunset Ridge HOA',
    label: 'Spa equipment pad',
    state: 'online',
    channel: 'stable',
    firmware: '4.2.1',
    agent: '4.2.1',
    provisionedBy: 'field',
    provisionedAt: iso(88),
    tags: 9,
    lastSeen: 'just now',
  },
  {
    id: 'PLH-00007',
    serial: 'B31P4T2209117',
    model: 'hub-200',
    siteId: 'pool-johnson',
    customer: 'Johnson Residence',
    label: 'Equipment pad',
    state: 'online',
    channel: 'stable',
    firmware: '4.2.1',
    agent: '4.2.1',
    provisionedBy: 'field',
    provisionedAt: iso(212),
    tags: 8,
    lastSeen: 'just now',
  },
  {
    // Manual-only hold: the unit went back on an RMA and the dispute is open,
    // so nothing about it may expire on a timer.
    id: 'PLH-00002',
    serial: 'B31P4T2114002',
    model: 'hub-200',
    siteId: 'pool-johnson',
    customer: 'Johnson Residence',
    label: 'Equipment pad (original)',
    state: 'decommissioned',
    channel: 'stable',
    firmware: '4.0.9',
    agent: '4.0.9',
    provisionedBy: 'control-center',
    provisionedAt: iso(640),
    tags: 8,
    lastSeen: '212 days ago',
    decommission: {
      at: iso(212),
      by: 'K. Nakamura',
      reason: 'Returned to PeakLogic (RMA)',
      retention: 'manual',
      purgeAt: null,
    },
  },
];

export const HUBS_BY_PARTNER: Record<string, Hub[]> = {
  ace: ACE_HUBS,
  wtrdr: WTRDR_HUBS,
};
