import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Factory, Gauge, LineChart, Moon, Radio, Sun, TriangleAlert } from 'lucide-react';
import { PREVIEW } from '../api';
import { useTheme } from '../theme';
import { usePeakViewData } from '../store';
import { AlarmPanel } from './AlarmPanel';
import { BrandMark } from './BrandMark';

const NAV = [
  { to: '/', label: 'Facility View', icon: Factory, end: true },
  { to: '/historian', label: 'Historian', icon: LineChart, end: false },
  { to: '/equipment', label: 'Equipment', icon: Gauge, end: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { site, screen, alarms, acknowledge } = usePeakViewData();

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900 dark:bg-[#0B1120] dark:text-slate-100">
      {/* Top bar — permanently dark-branded, like the marketing/kiosk canvas. */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 bg-brand-black px-4 text-slate-100">
        <div className="flex items-center gap-4 min-w-0">
          <BrandMark />
          <span className="hidden h-5 w-px bg-white/15 sm:block" />
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold text-white">{site.name}</p>
            <p className="truncate text-xs text-slate-400">{screen.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SourcePill />
          {PREVIEW && (
            <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300 ring-1 ring-amber-400/30">
              <TriangleAlert size={12} /> Preview data
            </span>
          )}
          <Clock />
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left nav rail — permanently dark-branded, like the top bar above it
            and the Control Center's own rail. It deliberately does NOT follow
            the light/dark toggle: the rail is brand chrome, and the theme
            governs the operator canvas. Colours are the Control Center's
            --rail-* palette so the two consoles read as one product, which
            matters most when this app is embedded in that console's iframe. */}
        <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-[#1e2a44] bg-[#0a0f1d] py-3 md:w-44 md:items-stretch md:px-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  'justify-center md:justify-start',
                  isActive
                    ? 'bg-brand-purple/[0.16] font-semibold text-white'
                    : 'font-medium text-[#7f8db0] hover:bg-white/5 hover:text-[#e8ecf5]',
                ].join(' ')
              }
              title={label}
            >
              {({ isActive }) => (
                <>
                  <Icon size={18} className={`shrink-0 ${isActive ? 'text-[#a78bfa]' : ''}`} />
                  <span className="hidden md:inline">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Main surface */}
        <main className="min-w-0 flex-1 overflow-y-auto p-5">{children}</main>

        {/* Docked alarm panel */}
        <div className="hidden w-80 shrink-0 lg:block">
          <AlarmPanel alarms={alarms} onAcknowledge={acknowledge} />
        </div>
      </div>
    </div>
  );
}

function SourcePill() {
  // The dual-source model (§3.1): live process values + local alarm state come
  // from the on-site Hub over the LAN (offline-capable); history/cross-site come
  // from the cloud. Here it advertises the live path.
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
      <Radio size={12} className="animate-pulse" /> Live · Hub (LAN)
    </span>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="nums hidden text-sm font-medium tabular-nums text-slate-300 sm:block">
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
