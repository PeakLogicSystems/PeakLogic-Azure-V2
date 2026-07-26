import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Ticket } from 'lucide-react';
import { usePartner } from '@/PartnerContext';
import { PartnerSwitcher } from '@/components/PartnerSwitcher';

// The white-labeled partner portal shell. Header + primary actions use the
// ACTIVE partner's own colors (--partner-primary/secondary), with a small
// "Powered by PeakLogic" attribution and the demo partner switcher.
const NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/tickets', label: 'Tickets', icon: Ticket, end: false },
];

export function PartnerShell({ children }: { children: ReactNode }) {
  const { partner: p } = usePartner();
  return (
    <div
      className="flex min-h-screen flex-col bg-slate-50 text-slate-900"
      style={{ ['--partner-primary' as string]: p.primaryColor, ['--partner-secondary' as string]: p.secondaryColor } as React.CSSProperties}
    >
      <header className="text-white" style={{ backgroundColor: p.primaryColor }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className={`grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-black tracking-tight text-white ${p.lowercaseLogo ? 'lowercase' : ''}`} style={{ backgroundColor: p.secondaryColor }}>
              {p.logoText}
            </span>
            <div className="leading-tight">
              <p className="text-base font-bold">{p.name}</p>
              <p className="text-[11px] text-white/70">{p.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      {/* Pinned to the bottom of the screen (flex-col + flex-1 main). Uses the
          real PeakLogic mark + Peak/Logic wordmark. */}
      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-1.5 px-4 py-4 text-xs text-slate-400">
          <span>Powered by</span>
          <svg width="14" height="14" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M4 28 L12 10 L18 20 L23 12 L28 28 Z" fill="#7C3AED" />
            <path d="M18 20 L23 12 L28 28 Z" fill="#22C55E" opacity="0.85" />
          </svg>
          <span className="font-bold tracking-tight text-slate-600">
            Peak<span style={{ color: '#8B5CF6' }}>Logic</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
