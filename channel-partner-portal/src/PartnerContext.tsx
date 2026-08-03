import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_PARTNER_ID, PARTNERS, partnerById } from '@/data/partners';
import type { Device, Partner, Ticket } from '@/data/types';

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

  // Merge provisioned devices into the partner the rest of the app reads, so
  // a device claimed in the wizard shows up on the site page, in the device
  // count and in the equipment strip without every consumer knowing about it.
  const merged = useMemo<Partner>(() => {
    if (!Object.keys(added).length) return partner;
    return {
      ...partner,
      sites: partner.sites.map((s) => (added[s.id] ? { ...s, devices: [...s.devices, ...added[s.id]] } : s)),
    };
  }, [partner, added]);

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
    }),
    [merged, tickets],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePartner(): PartnerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePartner must be used within a PartnerProvider');
  return c;
}
