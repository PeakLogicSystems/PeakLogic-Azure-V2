import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_PARTNER_ID, PARTNERS, partnerById } from '@/data/partners';
import type { Partner } from '@/data/types';

interface PartnerCtx {
  partner: Partner;
  partners: Partner[];
  setPartnerId: (id: string) => void;
}

const Ctx = createContext<PartnerCtx | null>(null);

export function PartnerProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string>(() => localStorage.getItem('cpp-partner') ?? DEFAULT_PARTNER_ID);
  const partner = partnerById(id) ?? PARTNERS[0];

  const value = useMemo<PartnerCtx>(
    () => ({
      partner,
      partners: PARTNERS,
      setPartnerId: (pid) => {
        setId(pid);
        localStorage.setItem('cpp-partner', pid);
      },
    }),
    [partner],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePartner(): PartnerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePartner must be used within a PartnerProvider');
  return c;
}
