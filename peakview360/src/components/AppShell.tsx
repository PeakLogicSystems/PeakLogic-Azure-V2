import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { BellRing, ChevronLeft, Factory, Gauge, LineChart, Moon, Radio, Sun, TriangleAlert } from 'lucide-react';
import { PREVIEW } from '../api';
import { useTheme } from '../theme';
import { REQUESTED_HUB_ID } from '../scope';
import { usePeakViewData } from '../store';
import { AlarmPanel } from './AlarmPanel';
import { BrandMark } from './BrandMark';

const NAV = [
  { to: '/', label: 'Facility View', icon: Factory, end: true },
  { to: '/historian', label: 'Historian', icon: LineChart, end: false },
  { to: '/equipment', label: 'Equipment', icon: Gauge, end: false },
];

const ALARMS_KEY = 'pv360-alarms-open';

export function AppShell({ children }: { children: ReactNode }) {
  const { site, screen, alarms, acknowledge, workOrders, acknowledgeAndDispatch } = usePeakViewData();

  // The docked alarm panel collapses so the process screens can use the full
  // width — they are responsive grids, so they genuinely reflow into it rather
  // than just leaving the space empty. Persisted, because an operator who wants
  // the wide layout wants it every shift, not once.
  const [alarmsOpen, setAlarmsOpen] = useState(() => {
    try {
      return localStorage.getItem(ALARMS_KEY) !== 'collapsed';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(ALARMS_KEY, alarmsOpen ? 'open' : 'collapsed');
    } catch {
      /* storage blocked — the choice still holds for this session */
    }
  }, [alarmsOpen]);

  const activeAlarms = alarms.filter((a) => a.status === 'active').length;

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900 dark:bg-[#0B1120] dark:text-slate-100">
      {/* Top bar — permanently dark-branded, like the marketing/kiosk canvas. */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 bg-brand-black px-4 text-slate-100">
        <div className="flex items-center gap-4 min-w-0">
          <BrandMark />
          <span className="hidden h-5 w-px bg-white/15 sm:block" />
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold text-white">{site.name}</p>
            {/* Naming the Hub matters as soon as a site has more than one: the
                same screen fed from the headworks and from the chem building
                shows different equipment, and an operator has to be able to
                tell at a glance which source they are looking at. */}
            <p className="truncate text-xs text-slate-400">
              {screen.name}
              {REQUESTED_HUB_ID && <span className="text-slate-500"> · via {REQUESTED_HUB_ID}</span>}
            </p>
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

        {/* Docked alarm panel — collapsible to a rail. */}
        <div className={`hidden shrink-0 lg:block ${alarmsOpen ? 'w-80' : 'w-12'}`}>
          {alarmsOpen ? (
            <AlarmPanel
              alarms={alarms}
              onAcknowledge={acknowledge}
              onCollapse={() => setAlarmsOpen(false)}
              cmms={site.cmms}
              workOrders={workOrders}
              onAcknowledgeAndDispatch={acknowledgeAndDispatch}
            />
          ) : (
            <CollapsedAlarms active={activeAlarms} onExpand={() => setAlarmsOpen(true)} />
          )}
        </div>
      </div>
    </div>
  );
}

// The alarm panel collapsed to a rail.
//
// This deliberately still shows the ACTIVE ALARM COUNT, in severity colour. An
// operator must never be able to hide the fact that alarms exist — collapsing
// is about reclaiming width for the process screens, not about silencing the
// annunciator. A collapsed panel that showed nothing would turn a UI preference
// into a safety hazard on equipment this app supervises.
function CollapsedAlarms({ active, onExpand }: { active: number; onExpand: () => void }) {
  return (
    <button
      onClick={onExpand}
      title={active ? `${active} active alarm${active === 1 ? '' : 's'} — click to open` : 'No active alarms — click to open'}
      aria-label={`Open alarm panel. ${active} active alarm${active === 1 ? '' : 's'}.`}
      className="flex h-full w-full flex-col items-center gap-2.5 border-l border-slate-200 bg-slate-50 py-3 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900/60"
    >
      <ChevronLeft size={15} className="text-slate-400" />
      <BellRing size={17} className={active ? 'text-sev-critical' : 'text-slate-400'} />
      <span
        className={`nums rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
          active ? 'bg-sev-critical/15 text-sev-critical' : 'bg-emerald-500/15 text-emerald-500'
        }`}
      >
        {active}
      </span>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 [writing-mode:vertical-rl]">
        Alarms
      </span>
    </button>
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
