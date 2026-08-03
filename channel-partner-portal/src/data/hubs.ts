// PeakLogic Hub identity, provisioning and lifecycle.
//
// ── Why Hub IDs are NOT customer-scoped ──────────────────────────────────────
//
// Sensors are numbered inside the customer's own series (`BMD-1042`) because a
// sensor is bolted to that customer's equipment and stays there. A Hub is not
// like that. A Hub is PeakLogic hardware: it ships from our stock, sits at a
// site for a few years, comes back on an RMA, gets refurbished, and goes out to
// somebody else entirely.
//
// The earlier scheme (`<customer prefix>-H<nn>`, numbered per site) encoded the
// current owner into the identifier, which meant the identifier had to CHANGE
// when the Hub moved — and an identifier that changes is not an identifier. It
// also made "which Hub is this?" unanswerable from the number alone: BMD-H01
// and SUN-H01 are different physical objects with what reads as the same name.
//
// So Hub IDs come from ONE platform-wide sequence, are allocated in order, and
// are never reissued — not even after a decommission. The number is the Hub's
// permanent name in PeakLogic's own asset register; where it currently lives is
// a property of the record, not part of its name.
//
//   PLH-00042   PeakLogic Hub, forty-second unit ever provisioned
//
// ── Two provisioning routes, one sequence ────────────────────────────────────
//
// Staff provision from Control Center (a unit enters stock as `available`
// before it ships), and installers register in the field (the Hub is claimed by
// serial at the site). Both draw the next ID from the same counter, which is
// what stops two routes from ever issuing the same number. A field claim of a
// serial already in stock adopts that record rather than minting a second one —
// the unit was already counted when staff provisioned it.
//
// In production the allocation is server-side. A client cannot be trusted to
// allocate a unique identifier, and two installers finishing at once on
// different sites would collide.

export type HubState = 'available' | 'provisioning' | 'online' | 'offline' | 'decommissioned';
export type ReleaseChannel = 'stable' | 'beta' | 'preview';

/**
 * How long a decommissioned record is held before it may be purged.
 *
 * The record outlives the hardware on purpose. It is the only remaining
 * evidence that the device which produced a year of compliance readings ever
 * existed — delete it with the box and the history it produced becomes
 * unattributable. So removal from a site is a state change, never a delete.
 */
export type RetentionKey = 'd30' | 'd60' | 'd90' | 'y1' | 'manual';

export const RETENTION: Record<RetentionKey, { label: string; days: number | null; sub: string }> = {
  d30: { label: '30 days', days: 30, sub: 'Shortest hold. For hardware swapped under warranty with no compliance history.' },
  d60: { label: '60 days', days: 60, sub: 'Covers a billing dispute or a returned-goods cycle.' },
  d90: { label: '90 days', days: 90, sub: 'Default. Outlasts a quarterly compliance review.' },
  y1: { label: '1 year', days: 365, sub: 'For sites under a discharge permit — survives an annual audit.' },
  manual: { label: 'Manual deletion only', days: null, sub: 'Never purged automatically. Someone must delete it deliberately.' },
};

export const DEFAULT_RETENTION: RetentionKey = 'd90';

export interface Decommission {
  at: string; // ISO date
  by: string;
  reason: string;
  retention: RetentionKey;
  /** null when the hold is `manual` — nothing is scheduled and nothing expires. */
  purgeAt: string | null;
}

export interface Hub {
  id: string;
  serial: string;
  model: HubModel;
  /** null while the unit is in stock, and retained after decommission. */
  siteId: string | null;
  /** The customer tenant the record belongs to. Set on assignment; kept forever after. */
  customer: string | null;
  state: HubState;
  channel: ReleaseChannel;
  firmware: string;
  agent: string;
  provisionedBy: 'control-center' | 'field';
  provisionedAt: string;
  /** What an operator calls it on site — "Headworks", "Chem building". */
  label?: string;
  /** PLC/RTU points this Hub acquires. */
  tags?: number;
  lastSeen?: string;
  decommission?: Decommission;
}

// ── Models and their release channels ────────────────────────────────────────
//
// A Hub subscribes to a channel for ITS OWN model, not a platform-wide one: the
// 200 and the 400 do not run the same build, and pointing one at the other's
// firmware is how you brick a unit at a site nobody can drive to today.

export type HubModel = 'hub-200' | 'hub-400' | 'hub-400x';

export const HUB_MODELS: Record<HubModel, { name: string; sub: string; protocols: string; channels: Record<ReleaseChannel, string[]> }> = {
  'hub-200': {
    name: 'PeakLogic Hub 200',
    sub: 'Compact single-protocol gateway. Lift stations, package plants, pool rooms.',
    protocols: 'Modbus TCP',
    channels: { stable: ['4.2.1', '4.1.6', '4.0.9'], beta: ['4.3.0'], preview: [] },
  },
  'hub-400': {
    name: 'PeakLogic Hub 400',
    sub: 'Multi-protocol gateway with local historian. Treatment plants and campuses.',
    protocols: 'Modbus TCP · OPC-UA · EtherNet/IP',
    channels: { stable: ['4.2.1', '4.1.6'], beta: ['4.3.0'], preview: ['4.4.0-preview.1'] },
  },
  'hub-400x': {
    name: 'PeakLogic Hub 400X',
    sub: 'Hub 400 in an outdoor-rated enclosure with cellular backhaul.',
    protocols: 'Modbus TCP · OPC-UA · cellular',
    channels: { stable: ['4.2.1'], beta: ['4.3.0'], preview: [] },
  },
};

/**
 * The channel a newly registered Hub is put on.
 *
 * Always `stable`, never inherited from whatever the last unit happened to be
 * running. Beta and preview are deliberate, per-unit decisions made by staff
 * with a reason — a field installer registering hardware is not making a
 * release-engineering choice, and should not accidentally make one.
 */
export const REGISTRATION_CHANNEL: ReleaseChannel = 'stable';

/** The version a Hub converges to on its first sync, for its own model. */
export function channelVersion(model: HubModel, channel: ReleaseChannel = REGISTRATION_CHANNEL): string {
  const list = HUB_MODELS[model].channels[channel];
  return list.length ? list[0] : HUB_MODELS[model].channels.stable[0];
}

// ── Identity ─────────────────────────────────────────────────────────────────

export const HUB_ID_PREFIX = 'PLH';
const HUB_ID_DIGITS = 5;

export const formatHubId = (n: number): string => `${HUB_ID_PREFIX}-${String(n).padStart(HUB_ID_DIGITS, '0')}`;

/** The sequence number inside a Hub ID, or 0 if it is not one of ours. */
export function hubSeq(id: string): number {
  const m = id.match(new RegExp(`^${HUB_ID_PREFIX}-(\\d+)$`, 'i'));
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * The next ID in the platform sequence.
 *
 * Takes the WHOLE fleet, including decommissioned units, because a retired ID
 * must never come back. Reissuing PLH-00042 to new hardware would silently
 * re-point every historical reading, ticket and audit entry that named the old
 * one at a unit that was never there.
 */
export function nextHubId(fleet: readonly Hub[]): string {
  const highest = fleet.reduce((n, h) => Math.max(n, hubSeq(h.id)), 0);
  return formatHubId(highest + 1);
}

/** Serials as manufacturers print them — permissive on purpose. */
export const SERIAL_SHAPE = /^[A-Z0-9][A-Z0-9-]{4,22}[A-Z0-9]$/i;

// ── Registration ─────────────────────────────────────────────────────────────

export interface RegisterResult {
  hub: Hub;
  /** True when the serial matched a unit staff had already provisioned into stock. */
  adoptedFromStock: boolean;
}

/**
 * Register a Hub at a site, from either provisioning route.
 *
 * A serial already in stock is ADOPTED — it keeps the ID it was issued when
 * staff provisioned it. Only genuinely unknown hardware takes a new number.
 */
export function registerHub(
  fleet: readonly Hub[],
  input: { serial: string; model: HubModel; siteId: string; customer: string; label?: string; by: 'control-center' | 'field' },
): RegisterResult {
  const serial = input.serial.trim().toUpperCase();
  const stock = fleet.find((h) => h.serial.toUpperCase() === serial && h.state === 'available');
  const channel = REGISTRATION_CHANNEL;

  const base: Hub = {
    id: stock ? stock.id : nextHubId(fleet),
    serial,
    model: input.model,
    siteId: input.siteId,
    customer: input.customer,
    state: 'provisioning',
    channel,
    firmware: channelVersion(input.model, channel),
    agent: channelVersion(input.model, channel),
    provisionedBy: stock ? stock.provisionedBy : input.by,
    provisionedAt: stock ? stock.provisionedAt : new Date().toISOString(),
    label: input.label,
    tags: 0,
    lastSeen: '—',
  };
  return { hub: base, adoptedFromStock: Boolean(stock) };
}

/** Provision a unit into stock without assigning it — the Control Center route. */
export function provisionToStock(fleet: readonly Hub[], input: { serial: string; model: HubModel }): Hub {
  const channel = REGISTRATION_CHANNEL;
  return {
    id: nextHubId(fleet),
    serial: input.serial.trim().toUpperCase(),
    model: input.model,
    siteId: null,
    customer: null,
    state: 'available',
    channel,
    firmware: channelVersion(input.model, channel),
    agent: channelVersion(input.model, channel),
    provisionedBy: 'control-center',
    provisionedAt: new Date().toISOString(),
    tags: 0,
  };
}

/**
 * Retire a Hub.
 *
 * Note what this does NOT do: it does not clear `siteId` or `customer`. The
 * record stays where it lived, in that customer's tenant, because the question
 * it has to answer later is "what was at this site in March?" — and a record
 * with its site erased cannot answer it.
 */
export function decommissionHub(hub: Hub, opts: { by: string; reason: string; retention: RetentionKey; now?: Date }): Hub {
  const now = opts.now ?? new Date();
  const days = RETENTION[opts.retention].days;
  const purgeAt = days === null ? null : new Date(now.getTime() + days * 86_400_000).toISOString();
  return {
    ...hub,
    state: 'decommissioned',
    decommission: { at: now.toISOString(), by: opts.by, reason: opts.reason, retention: opts.retention, purgeAt },
  };
}

/** Days remaining on the hold, or null when nothing is scheduled. */
export function daysUntilPurge(hub: Hub, now: Date = new Date()): number | null {
  if (!hub.decommission?.purgeAt) return null;
  return Math.ceil((new Date(hub.decommission.purgeAt).getTime() - now.getTime()) / 86_400_000);
}

export const isLive = (h: Hub): boolean => h.state === 'online' || h.state === 'offline' || h.state === 'provisioning';
export const hubsForSite = (fleet: readonly Hub[], siteId: string): Hub[] => fleet.filter((h) => h.siteId === siteId && isLive(h));
export const retiredForCustomer = (fleet: readonly Hub[], customer: string): Hub[] =>
  fleet.filter((h) => h.state === 'decommissioned' && h.customer === customer);

export const DECOMMISSION_REASONS = [
  'Replaced under warranty',
  'End of life',
  'Site closed',
  'Upgraded to newer model',
  'Damaged — water ingress',
  'Damaged — lightning / surge',
  'Returned to PeakLogic (RMA)',
  'Other',
];
