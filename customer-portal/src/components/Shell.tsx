import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, FileText, LayoutDashboard, LogOut, Moon, Settings as SettingsIcon, Sun } from 'lucide-react';
import { useAuth } from '@/AuthContext';
import { CUSTOMER } from '@/data';
import { useSettings } from '@/settings';

const HUB_URL = 'http://localhost:5180/demo.html';

const NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/alerts', label: 'Alerts', icon: Bell, end: false },
  { to: '/reports', label: 'Reports', icon: FileText, end: false },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="bg-brand-black text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* PeakLogic brand (the customer is a PeakLogic tenant). */}
            <div className="flex items-baseline gap-2">
              <svg width="18" height="14" viewBox="4 10 24 18" fill="none" aria-hidden="true">
                <path d="M4 28 L12 10 L18 20 L23 12 L28 28 Z" fill="#7C3AED" />
                <path d="M18 20 L23 12 L28 28 Z" fill="#22C55E" opacity="0.85" />
              </svg>
              <span className="text-[15px] font-extrabold leading-none tracking-tight">
                <span className="text-white">Peak</span><span className="text-brand-purple-mid">Logic</span>
              </span>
            </div>
            <span className="hidden h-5 w-px bg-white/15 sm:block" />
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-bold">{CUSTOMER.name}</p>
              <p className="text-[11px] text-white/60">{CUSTOMER.kind}</p>
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
          <a href={HUB_URL} className="hover:text-slate-600 dark:hover:text-slate-300">← PeakLogic platform demo</a>
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
