import { createContext, useContext, useState, type ReactNode } from 'react';
import { usePeakView, type PeakViewData } from './data/preview';

// One live store shared by the operator screen (values) and the docked alarm
// panel (alarms) so they stay in lockstep. When a backend exists this provider
// swaps its source from the preview simulation to the real API + Hub-LAN feed.
export interface PeakViewStore extends PeakViewData {
  /** alarm id -> work-order number raised from it this session. */
  workOrders: Record<string, string>;
  /** Acknowledge and dispatch. Returns null (and does nothing) with no active CMMS link. */
  acknowledgeAndDispatch: (alarmId: string) => string | null;
}

const Ctx = createContext<PeakViewStore | null>(null);

export function PeakViewProvider({ children }: { children: ReactNode }) {
  const data = usePeakView();
  // Work orders raised from an alarm this session. Keyed by alarm id so a row
  // can show the WO number it produced rather than just claiming success.
  const [workOrders, setWorkOrders] = useState<Record<string, string>>({});

  const acknowledgeAndDispatch = (alarmId: string): string | null => {
    // Enforced here, not only in the UI: no CMMS link means no dispatch, even
    // if a caller asks for one. A work order that goes nowhere would leave an
    // operator believing a technician is on the way.
    const link = data.site.cmms;
    if (!link || !link.active) return null;
    data.acknowledge(alarmId);
    const wo = `WO-${Math.floor(1000 + Math.random() * 9000)}`;
    setWorkOrders((prev) => ({ ...prev, [alarmId]: wo }));
    return wo;
  };

  return (
    <Ctx.Provider value={{ ...data, workOrders, acknowledgeAndDispatch }}>{children}</Ctx.Provider>
  );
}

export function usePeakViewData(): PeakViewStore {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePeakViewData must be used within a PeakViewProvider');
  return c;
}
