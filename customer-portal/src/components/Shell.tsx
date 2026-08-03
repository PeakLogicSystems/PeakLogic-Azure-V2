import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, FileText, LayoutDashboard, LogOut, Moon, Settings as SettingsIcon, Sun } from 'lucide-react';
import { useAuth } from '@/AuthContext';
import { useBrandTab } from '@/useBrandTab';
import { useBrandOverride } from '@/brandOverride';
import { derivedHeader, inkOn } from '@/brandColor';
import { CUSTOMER } from '@/data';
import { useSettings } from '@/settings';

const HUB_URL = 'http://localhost:5180/demo.html';

const NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/alerts', label: 'Alerts', icon: Bell, end: false },
  { to: '/reports', label: 'Reports', icon: FileText, end: false },
];

export function Shell({ children }: { children: ReactNode }) {
  // Branding an administrator set in Control Center wins over the bundled
  // default, and drives the tab. Same rule as the partner portal.
  const override = useBrandOverride('bayfront');
  const branded = override
    ? {
        ...CUSTOMER,
        brand: override.brand || CUSTOMER.brand,
        headerColor: override.header || CUSTOMER.headerColor || derivedHeader(override.brand || CUSTOMER.brand),
        bannerTitle: override.bannerTitle || CUSTOMER.bannerTitle,
        bannerSub: override.bannerSub || CUSTOMER.bannerSub,
        logoText: override.logo || CUSTOMER.logoText,
        logoImg: override.logoImg || CUSTOMER.logoImg,
      }
    : CUSTOMER;
  useBrandTab(branded);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* The customer's own banner — colour, mark and copy all configured in
          Control Center. This was PeakLogic's chrome with the customer's name
          appended; it is now theirs, with PeakLogic credited in the footer. */}
      <header className="text-white" style={{ backgroundColor: branded.headerColor }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            {branded.logoImg ? (
              <span
                className="grid h-9 min-w-9 place-items-center overflow-hidden rounded-lg bg-white"
                style={{ backgroundImage: `url(${branded.logoImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                aria-label={`${branded.name} logo`}
              />
            ) : (
              <span
                className="grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-black tracking-tight ring-1 ring-white/25"
                style={{ backgroundColor: branded.brand, color: inkOn(branded.brand) }}
              >
                {branded.logoText}
              </span>
            )}
            <div className="leading-tight">
              <p className="text-base font-bold">{branded.bannerTitle || branded.name}</p>
              <p className="text-[11px] text-white/70">{branded.bannerSub || branded.kind}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <nav className="flex items-center gap-1">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`
                  }
                >
                  <Icon size={16} /> <span className="hidden sm:inline">{label}</span>
                </NavLink>
              ))}
            </nav>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <footer className="mt-auto border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 text-xs text-slate-400 dark:text-slate-500">
          <span>© 2026 PeakLogic · Serviced by {CUSTOMER.provider}</span>
          {/* Opens in a new tab deliberately. Navigating the portal itself away
              strands the customer outside their authenticated session with no
              way back — the same class of bug as the old PeakView360 link. */}
          <a href={HUB_URL} target="_blank" rel="noreferrer" className="hover:text-slate-600 dark:hover:text-slate-300">← PeakLogic platform demo ↗</a>
        </div>
      </footer>
    </div>
  );
}

function ThemeToggle() {
  const { settings, toggleTheme } = useSettings();
  return (
    <button onClick={toggleTheme} className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white" title={settings.theme === 'dark' ? 'Switch to light' : 'Switch to dark'} aria-label="Toggle theme">
      {settings.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

function UserMenu() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const u = CUSTOMER.user;
  const initials = u.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const handleSignOut = () => {
    setOpen(false);
    signOut();
    navigate('/login');
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-white/10" title={u.name}>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-xs font-bold text-white">{initials}</span>
        <span className="hidden text-sm font-medium text-white md:inline">{u.name}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-60 rounded-xl border border-slate-200 bg-white p-1 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="px-3 py-2">
              <p className="text-sm font-semibold">{u.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{u.role}</p>
              <p className="truncate text-[11px] text-slate-400">{u.email}</p>
            </div>
            <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
            <Link to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              <SettingsIcon size={15} /> Settings
            </Link>
            <button onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-slate-50 dark:hover:bg-slate-800">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
