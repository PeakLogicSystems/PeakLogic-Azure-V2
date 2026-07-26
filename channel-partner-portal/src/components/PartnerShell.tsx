import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Moon, Settings as SettingsIcon, Sun, Ticket } from 'lucide-react';
import { useAuth } from '@/AuthContext';
import { usePartner } from '@/PartnerContext';
import { useSettings } from '@/SettingsContext';
import { PartnerSwitcher } from '@/components/PartnerSwitcher';

const NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/tickets', label: 'Tickets', icon: Ticket, end: false },
];

export function PartnerShell({ children }: { children: ReactNode }) {
  const { partner: p } = usePartner();
  return (
    <div
      className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      style={{ ['--partner-primary' as string]: p.primaryColor, ['--partner-secondary' as string]: p.secondaryColor } as React.CSSProperties}
    >
      {/* Header uses the partner's own brand color in both themes. */}
      <header className="text-white" style={{ backgroundColor: p.primaryColor }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-end gap-2.5">
            <span className={`grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-black tracking-tight text-white ${p.lowercaseLogo ? 'lowercase' : ''}`} style={{ backgroundColor: p.secondaryColor }}>
              {p.logoText}
            </span>
            <div className="leading-tight">
              <p className="text-base font-bold leading-tight">{p.name}</p>
              <p className="text-[11px] text-white/70">{p.tagline}</p>
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
                    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  <Icon size={16} /> <span className="hidden sm:inline">{label}</span>
                </NavLink>
              ))}
            </nav>
            <PartnerSwitcher />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      {/* Bottom-pinned; real PeakLogic mark (cropped) + Peak/Logic wordmark, tight lockup. */}
      <footer className="mt-auto border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-baseline justify-center gap-1.5 px-4 py-4 text-xs text-slate-400 dark:text-slate-500">
          <span>Powered by</span>
          <span className="inline-flex items-baseline gap-[3px]">
            <svg width="13" height="10" viewBox="4 10 24 18" fill="none" aria-hidden="true">
              <path d="M4 28 L12 10 L18 20 L23 12 L28 28 Z" fill="#7C3AED" />
              <path d="M18 20 L23 12 L28 28 Z" fill="#22C55E" opacity="0.85" />
            </svg>
            <span className="font-bold leading-none tracking-tight text-slate-600 dark:text-slate-300">
              Peak<span style={{ color: '#8B5CF6' }}>Logic</span>
            </span>
          </span>
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
  const { partner } = usePartner();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const initials = partner.user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const handleSignOut = () => {
    setOpen(false);
    signOut();
    navigate('/login');
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-white/10" title={partner.user.name}>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-xs font-bold text-white">{initials}</span>
        <span className="hidden text-sm font-medium text-white md:inline">{partner.user.name}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-60 rounded-xl border border-slate-200 bg-white p-1 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="px-3 py-2">
              <p className="text-sm font-semibold">{partner.user.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{partner.user.role}</p>
              <p className="truncate text-[11px] text-slate-400">{partner.user.email}</p>
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
