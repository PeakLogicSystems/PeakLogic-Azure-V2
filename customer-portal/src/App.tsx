import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { SettingsProvider } from '@/settings';
import { Shell } from '@/components/Shell';
import { Alerts } from '@/pages/Alerts';
import { Home } from '@/pages/Home';
import { Reports } from '@/pages/Reports';
import { Settings } from '@/pages/Settings';
import { SiteDetail } from '@/pages/SiteDetail';

// The PeakLogic Customer Portal — a tenant's view of THEIR own sites. PeakView360
// is launched from within it (a site's "Open live view"), not a separate login.
export function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<ShellLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/sites/:siteId" element={<SiteDetail />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  );
}

function ShellLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
