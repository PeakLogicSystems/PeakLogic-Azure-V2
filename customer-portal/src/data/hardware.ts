// The customer's own hardware register — live Hubs, and the ones that have
// been retired from their sites.
//
// This is the tenant-side VIEW of what the servicing partner sees. It exists
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
// Reads directly from packages/domain/fleet.ts — the SAME canonical fleet
// register channel-partner-portal writes to — filtered down to this
// customer's own records, rather than a hand-typed mirror of a few of them.
// The previous version of this file duplicated four Hub records by hand with
// an incompatible, narrower `Hub` type; a firmware bump or a decommission on
// the partner side had no compiler check forcing this file to be updated to
// match, so the two portals could silently disagree about what a customer's
// own hardware looked like. Reading the one source removes that drift risk
// entirely: a change to the fleet register is visible here with no second
// edit.

import { HUBS_BY_PARTNER } from '@shared/domain/fleet';
import { RETENTION, daysUntilPurge as domainDaysUntilPurge, type Hub as DomainHub, type HubState as DomainHubState, type RetentionKey as DomainRetentionKey } from '@shared/domain/hubs';

// A customer never sees an in-stock ('available') unit — those belong to no
// customer by definition — so this portal's own `HubState`/`Hub` narrow that
// case away rather than carrying a branch nothing here can ever reach.
export type HubState = Exclude<DomainHubState, 'available'>;
export type RetentionKey = DomainRetentionKey;
export type Hub = Omit<DomainHub, 'state' | 'siteId'> & { state: HubState; siteId: string };

export const RETENTION_LABEL: Record<RetentionKey, string> = Object.fromEntries(
  (Object.entries(RETENTION) as [RetentionKey, { label: string }][]).map(([key, v]) => [key, v.label]),
) as Record<RetentionKey, string>;

// Bayfront Municipal District is this preview build's customer, serviced by
// Ace (see channel-partner-portal/src/data/fleet.ts's ACE_HUBS/HUBS_BY_PARTNER).
const CUSTOMER_NAME = 'Bayfront Municipal District';

export const HUBS: Hub[] = Object.values(HUBS_BY_PARTNER)
  .flat()
  .filter((h) => h.customer === CUSTOMER_NAME && h.siteId !== null && h.state !== 'available') as Hub[];

export const liveHubsAt = (siteId: string): Hub[] => HUBS.filter((h) => h.siteId === siteId && h.state !== 'decommissioned');
export const retiredHubs = (): Hub[] => HUBS.filter((h) => h.state === 'decommissioned');
export const retiredHubsAt = (siteId: string): Hub[] => retiredHubs().filter((h) => h.siteId === siteId);

/** Days left on a hold, or null when nothing is scheduled. */
export const daysUntilPurge = domainDaysUntilPurge;
