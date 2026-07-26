import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { PartnerProvider } from '@/PartnerContext';
import { PartnerShell } from '@/components/PartnerShell';
import { Facility } from '@/pages/Facility';
import { Home } from '@/pages/Home';
import { PartnerLogin } from '@/pages/PartnerLogin';
import { SiteDetail } from '@/pages/SiteDetail';
import { Tickets } from '@/pages/Tickets';

// The multi-partner channel portal. One app renders as any partner (Ace ↔ WTR
// DR), switchable in the header — two separate businesses on one PeakLogicSystems
// core. Login is a full-screen route; the rest lives in the white-labeled shell.
export function App() {
  return (
    <BrowserRouter>
      <PartnerProvider>
        <Routes>
          <Route path="/login" element={<PartnerLogin />} />
          <Route element={<ShellLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/sites/:siteId" element={<SiteDetail />} />
            <Route path="/sites/:siteId/facility" element={<Facility />} />
            <Route path="/tickets" element={<Tickets />} />
          </Route>
        </Routes>
      </PartnerProvider>
    </BrowserRouter>
  );
}

function ShellLayout() {
  return (
    <PartnerShell>
      <Outlet />
    </PartnerShell>
  );
}
