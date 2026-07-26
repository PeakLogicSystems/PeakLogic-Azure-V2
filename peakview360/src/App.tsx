import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Construction, Loader2 } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { OperatorScreen } from './screens/OperatorScreen';
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
              <Route path="/" element={<OperatorScreen />} />
              <Route
                path="/historian"
                element={
                  <Suspense fallback={<ScreenLoading />}>
                    <Historian />
                  </Suspense>
                }
              />
              <Route
                path="/equipment"
                element={<ComingSoon title="Equipment dashboard" note="Per-asset live telemetry, trend, and (Intelligence tier) a PdM health score that one-clicks into a CMMS work order (PV-4)." />}
              />
              <Route
                path="/facility"
                element={<ComingSoon title="Facility visualization" note="A fast 2D process schematic by default; the 3D view is an opt-in mode (PV-5)." />}
              />
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

// Honest placeholder — these surfaces are designed (peakview360-hmi-architecture.md
// §3.2) but not built in this pass. Deliberately not faked with mock screens.
function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
        <Construction size={28} className="mx-auto text-brand-purple-mid" />
        <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">{title}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{note}</p>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-400">Designed · not built yet</p>
      </div>
    </div>
  );
}
