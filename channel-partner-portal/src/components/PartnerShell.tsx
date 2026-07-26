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
      className="min-h-screen bg-slate-50 text-slate-900"
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

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-peaklogic-purple" /> Powered by PeakLogic
        </span>
      </footer>
    </div>
  );
}
