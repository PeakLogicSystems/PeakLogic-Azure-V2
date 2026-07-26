import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_PARTNER_ID, PARTNERS, partnerById } from '@/data/partners';
import type { Partner, Ticket } from '@/data/types';

interface PartnerCtx {
  partner: Partner;
  partners: Partner[];
  setPartnerId: (id: string) => void;
  // Live, editable tickets for the active partner (real management, session-local).
  tickets: Ticket[];
  updateTicket: (id: string, patch: Partial<Ticket>) => void;
}

const Ctx = createContext<PartnerCtx | null>(null);

export function PartnerProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string>(() => localStorage.getItem('cpp-partner') ?? DEFAULT_PARTNER_ID);
  const partner = partnerById(id) ?? PARTNERS[0];

  const [tickets, setTickets] = useState<Ticket[]>(partner.tickets);
  // Reset the working ticket set when the active partner changes.
  useEffect(() => setTickets(partner.tickets), [partner.id, partner.tickets]);

  const value = useMemo<PartnerCtx>(
    () => ({
      partner,
      partners: PARTNERS,
      setPartnerId: (pid) => {
        setId(pid);
        localStorage.setItem('cpp-partner', pid);
      },
      tickets,
      updateTicket: (tid, patch) => setTickets((ts) => ts.map((t) => (t.id === tid ? { ...t, ...patch } : t))),
    }),
    [partner, tickets],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePartner(): PartnerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePartner must be used within a PartnerProvider');
  return c;
}
