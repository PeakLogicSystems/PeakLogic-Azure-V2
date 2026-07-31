import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { Equipment } from './screens/Equipment';
import { FacilityView } from './screens/FacilityView';
import { PeakViewProvider } from './store';
import { ThemeProvider } from './theme';

// Code-split the Historian: it pulls in the charting library (recharts), which
// the operator screen doesn't need. Loaded on demand when the operator opens it.
const Historian = lazy(() => import('./screens/Historian').then((m) => ({ default: m.Historian })));

export function App() {
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

function ScreenLoading() {
  return (
    <div className="flex h-full items-center justify-center text-slate-400">
      <Loader2 className="animate-spin" size={22} />
    </div>
  );
}
