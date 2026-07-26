import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { PartnerShell } from '@/components/PartnerShell';
import { Home } from '@/pages/Home';
import { PartnerLogin } from '@/pages/PartnerLogin';
import { SiteDetail } from '@/pages/SiteDetail';
import { Tickets } from '@/pages/Tickets';

// The channel partner portal for Ace Septic & Waste. Login is a full-screen
// route; the rest lives inside the white-labeled PartnerShell (header + nav):
// the home dashboard (all serviced sites), a site detail (devices — setup,
// monitor, control — plus Facility Builder access and site work), and tickets.
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PartnerLogin />} />
        <Route element={<ShellLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/sites/:siteId" element={<SiteDetail />} />
          <Route path="/tickets" element={<Tickets />} />
        </Route>
      </Routes>
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
