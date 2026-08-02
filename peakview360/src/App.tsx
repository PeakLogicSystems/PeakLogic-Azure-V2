import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { Equipment } from './screens/Equipment';
import { FacilityView } from './screens/FacilityView';
import { PeakViewProvider } from './store';
import { ThemeProvider } from './theme';
import { REQUESTED_SITE_NAME, SITE_IN_SCOPE } from './scope';

// Code-split the Historian: it pulls in the charting library (recharts), which
// the operator screen doesn't need. Loaded on demand when the operator opens it.
const Historian = lazy(() => import('./screens/Historian').then((m) => ({ default: m.Historian })));

export function App() {
  // Scope is checked BEFORE the provider, the shell, and the router — so when
  // this app is opened for a site it holds no data for, no process value, no
  // alarm and no equipment name is ever constructed, let alone rendered. See
  // src/scope.ts for why this refuses instead of falling back.
  if (!SITE_IN_SCOPE) {
    return (
      <ThemeProvider>
        <OutOfScope />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <PeakViewProvider>
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<FacilityView />} />
              <Route
                path="/historian"
                element={
                  <Suspense fallback={<ScreenLoading />}>
                    <Historian />
                  </Suspense>
                }
              />
              <Route path="/equipment" element={<Equipment />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </PeakViewProvider>
    </ThemeProvider>
  );
}

// Shown when this build holds no data for the requested site.
//
// It names ONLY the site the viewer asked for. It must never name, show or
// hint at whichever site this build does hold — a refusal that discloses what
// it is protecting would defeat itself.
function OutOfScope() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 p-6 dark:bg-[#0B1120]">
      <div className="max-w-md text-center">
        <ShieldCheck size={30} className="mx-auto text-brand-purple-mid" />
        <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">No live view for this site</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          PeakView360 is provisioned per site and serves only the site it was opened for.
          {REQUESTED_SITE_NAME ? (
            <>
              {' '}
              This preview build carries no operator data for <strong>{REQUESTED_SITE_NAME}</strong>.
            </>
          ) : (
            ' This preview build carries no operator data for the requested site.'
          )}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          It will not display another site's data in its place. A monitoring view that fell back to
          whichever facility was nearest to hand would be showing you someone else's plant.
        </p>
      </div>
    </div>
  );
}

function ScreenLoading() {
  return (
    <div className="flex h-full items-center justify-center text-slate-400">
      <Loader2 className="animate-spin" size={22} />
    </div>
  );
}
