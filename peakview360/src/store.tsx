import { createContext, useContext, type ReactNode } from 'react';
import { usePeakView, type PeakViewData } from './data/preview';

// One live store shared by the operator screen (values) and the docked alarm
// panel (alarms) so they stay in lockstep. When a backend exists this provider
// swaps its source from the preview simulation to the real API + Hub-LAN feed.
const Ctx = createContext<PeakViewData | null>(null);

export function PeakViewProvider({ children }: { children: ReactNode }) {
  const data = usePeakView();
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function usePeakViewData(): PeakViewData {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePeakViewData must be used within a PeakViewProvider');
  return c;
}
