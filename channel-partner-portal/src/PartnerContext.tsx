import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_PARTNER_ID, PARTNERS, partnerById } from '@/data/partners';
import type { Device, Partner, Ticket } from '@/data/types';
import { HUBS_BY_PARTNER } from '@/data/fleet';
import {
  decommissionHub as retire,
  hubsForSite,
  registerHub,
  type Hub,
  type HubModel,
  type RetentionKey,
} from '@/data/hubs';

interface PartnerCtx {
  partner: Partner;
  partners: Partner[];
  setPartnerId: (id: string) => void;
  // Live, editable tickets for the active partner (real management, session-local).
  tickets: Ticket[];
  updateTicket: (id: string, patch: Partial<Ticket>) => void;
  /**
   * Register newly provisioned hardware against a site.
   *
   * Session-local, like tickets. Without this the onboarding wizard validated a
   * serial, issued a Device ID and then dropped both — so a technician finished
   * the flow and the device was nowhere to be found.
   */
  addDevice: (siteId: string, device: Device) => void;

  /**
   * Every Hub this partner touches, in every state — in stock, deployed, and
   * decommissioned.
   *
   * Deliberately one list rather than a live set plus a retired set. The ID
   * allocator has to see retired units or it would reissue their numbers, and
   * splitting the list is exactly how that mistake gets made.
   */
  hubs: Hub[];
  hubsAt: (siteId: string) => Hub[];
  /** Register a Hub in the field. Adopts a stock unit when the serial is known. */
  addHub: (input: { serial: string; model: HubModel; siteId: string; customer: string; label?: string }) => Hub;
  /** Retire a Hub. The record stays in the customer's tenant — see data/hubs.ts. */
  decommissionHub: (hubId: string, opts: { by: string; reason: string; retention: RetentionKey }) => void;
}

const Ctx = createContext<PartnerCtx | null>(null);

export function PartnerProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string>(() => localStorage.getItem('cpp-partner') ?? DEFAULT_PARTNER_ID);
  const partner = partnerById(id) ?? PARTNERS[0];

  const [tickets, setTickets] = useState<Ticket[]>(partner.tickets);
  // Reset the working ticket set when the active partner changes.
  useEffect(() => setTickets(partner.tickets), [partner.id, partner.tickets]);

  // Hardware provisioned during this session, keyed by site. Held separately
  // from the bundled fixtures so switching partners cannot leak one partner's
  // newly claimed devices into another's site list.
  const [added, setAdded] = useState<Record<string, Device[]>>({});
  useEffect(() => setAdded({}), [partner.id]);

  const [hubs, setHubs] = useState<Hub[]>(() => HUBS_BY_PARTNER[partner.id] ?? []);
  useEffect(() => setHubs(HUBS_BY_PARTNER[partner.id] ?? []), [partner.id]);

  // Merge provisioned devices into the partner the rest of the app reads, so
  // a device claimed in the wizard shows up on the site page, in the device
  // count and in the equipment strip without every consumer knowing about it.
  //
  // The live Facility View follows the Hubs, not a static flag: a site has
  // PeakView360 exactly while it has at least one Hub that is not retired. That
  // is what makes decommissioning the last Hub at a site turn the live view off
  // instead of leaving a dead panel pointed at nothing.
  const merged = useMemo<Partner>(
    () => ({
      ...partner,
      sites: partner.sites.map((s) => ({
        ...s,
        devices: added[s.id] ? [...s.devices, ...added[s.id]] : s.devices,
        peakview: hubsForSite(hubs, s.id).length > 0,
      })),
    }),
    [partner, added, hubs],
  );

  const value = useMemo<PartnerCtx>(
    () => ({
      partner: merged,
      partners: PARTNERS,
      setPartnerId: (pid) => {
        setId(pid);
        localStorage.setItem('cpp-partner', pid);
      },
      tickets,
      updateTicket: (tid, patch) => setTickets((ts) => ts.map((t) => (t.id === tid ? { ...t, ...patch } : t))),
      addDevice: (siteId, device) =>
        setAdded((prev) => ({ ...prev, [siteId]: [...(prev[siteId] ?? []), device] })),

      hubs,
      hubsAt: (siteId) => hubsForSite(hubs, siteId),
      addHub: (input) => {
        const { hub, adoptedFromStock } = registerHub(hubs, { ...input, by: 'field' });
        setHubs((prev) => (adoptedFromStock ? prev.map((h) => (h.id === hub.id ? hub : h)) : [...prev, hub]));
        return hub;
      },
      decommissionHub: (hubId, opts) =>
        setHubs((prev) => prev.map((h) => (h.id === hubId ? retire(h, opts) : h))),
    }),
    [merged, tickets, hubs],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePartner(): PartnerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePartner must be used within a PartnerProvider');
  return c;
}
