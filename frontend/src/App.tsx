import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { PreferencesProvider } from '@/contexts/PreferencesContext';
import { AppShell } from '@/components/layout/AppShell';
import { LoginBackground } from '@/components/layout/LoginBackground';
import { Dashboard }     from '@/pages/Dashboard';
import { Sites }         from '@/pages/Sites';
import { SiteDetail }    from '@/pages/SiteDetail';
import { Assets }        from '@/pages/Assets';
import { AssetDetail }   from '@/pages/AssetDetail';
import { Devices }       from '@/pages/Devices';
import { DeviceDetail }  from '@/pages/DeviceDetail';
import { Alerts }        from '@/pages/Alerts';
import { Tickets }       from '@/pages/Tickets';
import { DeviceOnboard } from '@/pages/DeviceOnboard';
import { Settings }      from '@/pages/Settings';

// Local preview mode — set VITE_PREVIEW=true in frontend/.env.local to
// bypass Cognito auth. Never set this in production.
const PREVIEW = import.meta.env.VITE_PREVIEW === 'true';

const DEV_USER = { username: 'preview@peaklogic.io', signInDetails: { loginId: 'preview@peaklogic.io' } } as never;

const AppRoutes = ({ signOut, user }: { signOut: () => void; user: never }) => (
  <BrowserRouter>
    <AppShell user={user} onSignOut={signOut}>
      <Routes>
        <Route path="/"                    element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"           element={<Dashboard />} />
        <Route path="/sites"               element={<Sites />} />
        <Route path="/sites/:siteId"       element={<SiteDetail />} />
        <Route path="/assets"              element={<Assets />} />
        <Route path="/assets/:assetId"     element={<AssetDetail />} />
        <Route path="/devices"             element={<Devices />} />
        <Route path="/devices/onboard"     element={<DeviceOnboard />} />
        <Route path="/devices/:deviceId"   element={<DeviceDetail />} />
        <Route path="/alerts"              element={<Alerts />} />
        <Route path="/tickets"             element={<Tickets />} />
        <Route path="/settings"            element={<Settings />} />
        <Route path="*"                    element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  </BrowserRouter>
);

export function App() {
  if (PREVIEW) {
    return (
      <ThemeProvider>
        <PreferencesProvider>
          <AppRoutes signOut={() => {}} user={DEV_USER} />
        </PreferencesProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <PreferencesProvider>
        <Authenticator hideSignUp components={{ Header: LoginBackground }}>
          {({ signOut, user }) => (
            <AppRoutes signOut={signOut!} user={user as never} />
          )}
        </Authenticator>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
