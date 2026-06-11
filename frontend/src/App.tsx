import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoginBackground } from '@/components/layout/LoginBackground';
import { Dashboard }     from '@/pages/Dashboard';
import { Sites }         from '@/pages/Sites';
import { Assets }        from '@/pages/Assets';
import { Devices }       from '@/pages/Devices';
import { Alerts }        from '@/pages/Alerts';
import { Tickets }       from '@/pages/Tickets';
import { DeviceOnboard } from '@/pages/DeviceOnboard';

// Local preview mode — set VITE_PREVIEW=true in frontend/.env.local to
// bypass Cognito auth. Never set this in production.
const PREVIEW = import.meta.env.VITE_PREVIEW === 'true';

const DEV_USER = { username: 'preview@peaklogic.io', signInDetails: { loginId: 'preview@peaklogic.io' } } as never;

const AppRoutes = ({ signOut, user }: { signOut: () => void; user: never }) => (
  <BrowserRouter>
    <AppShell user={user} onSignOut={signOut}>
      <Routes>
        <Route path="/"                element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"       element={<Dashboard />} />
        <Route path="/sites"           element={<Sites />} />
        <Route path="/assets"          element={<Assets />} />
        <Route path="/devices"         element={<Devices />} />
        <Route path="/devices/onboard" element={<DeviceOnboard />} />
        <Route path="/alerts"          element={<Alerts />} />
        <Route path="/tickets"         element={<Tickets />} />
        <Route path="*"                element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  </BrowserRouter>
);

export function App() {
  if (PREVIEW) {
    return <AppRoutes signOut={() => {}} user={DEV_USER} />;
  }

  return (
    <Authenticator hideSignUp components={{ Header: LoginBackground }}>
      {({ signOut, user }) => (
        <AppRoutes signOut={signOut!} user={user as never} />
      )}
    </Authenticator>
  );
}
