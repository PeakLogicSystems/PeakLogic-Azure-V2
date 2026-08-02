import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/AuthContext';
import { SettingsProvider } from '@/settings';
import { Shell } from '@/components/Shell';
import { Alerts } from '@/pages/Alerts';
import { Home } from '@/pages/Home';
import { Login } from '@/pages/Login';
import { Reports } from '@/pages/Reports';
import { Settings } from '@/pages/Settings';
import { SiteDetail } from '@/pages/SiteDetail';
import { WaterQualityReport } from '@/pages/WaterQualityReport';

// The PeakLogic Customer Portal — a tenant's view of THEIR own sites. PeakView360
// is launched from within it (a site's "Open live view"), not a separate login.
export function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route element={<ShellLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/sites/:siteId" element={<SiteDetail />} />
                  <Route path="/sites/:siteId/water-quality" element={<WaterQualityReport />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
}

function RequireAuth() {
  const { authed } = useAuth();
  return authed ? <Outlet /> : <Navigate to="/login" replace />;
}

function ShellLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
