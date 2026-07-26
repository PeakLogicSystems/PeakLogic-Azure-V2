import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { PartnerProvider } from '@/PartnerContext';
import { SettingsProvider } from '@/SettingsContext';
import { PartnerShell } from '@/components/PartnerShell';
import { Facility } from '@/pages/Facility';
import { Home } from '@/pages/Home';
import { PartnerLogin } from '@/pages/PartnerLogin';
import { Settings } from '@/pages/Settings';
import { SiteDetail } from '@/pages/SiteDetail';
import { Tickets } from '@/pages/Tickets';

// The multi-partner channel portal. One app renders as any partner (Ace ↔ WTR
// DR), switchable in the header — two separate businesses on one PeakLogicSystems
// core. Each partner has a signed-in user with their own saved settings/theme.
export function App() {
  return (
    <BrowserRouter>
      <PartnerProvider>
        <SettingsProvider>
          <Routes>
            <Route path="/login" element={<PartnerLogin />} />
            <Route element={<ShellLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/sites/:siteId" element={<SiteDetail />} />
              <Route path="/sites/:siteId/facility" element={<Facility />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        </SettingsProvider>
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
