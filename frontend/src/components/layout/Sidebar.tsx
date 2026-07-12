import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MapPin,
  Boxes,
  Cpu,
  Bell,
  Ticket,
  LogOut,
} from 'lucide-react';
import type { AuthUser } from 'aws-amplify/auth';

interface SidebarProps {
  user: AuthUser;
  onSignOut: () => void;
}

const NAV = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/sites',     label: 'Sites',     Icon: MapPin           },
  { to: '/assets',    label: 'Assets',    Icon: Boxes            },
  { to: '/devices',   label: 'Devices',   Icon: Cpu              },
  { to: '/alerts',    label: 'Alerts',    Icon: Bell             },
  { to: '/tickets',   label: 'Tickets',   Icon: Ticket           },
];

export function Sidebar({ user, onSignOut }: SidebarProps) {
  return (
    <aside className="w-60 flex-shrink-0 bg-brand-black flex flex-col h-screen sticky top-0">
      {/* Logo — px-4 matches the nav and bottom sections below, so the
          logo mark, nav icons, and sign-out row all sit flush on the
          same left edge instead of three different indents. items-end
          bottom-justifies the wordmark against the icon's base. The
          viewBox is cropped tight to the mountain path's own bounds
          (originally "0 0 32 32" with the shape only spanning x:4-28,
          y:10-28 — leaving ~4px of invisible canvas below the visible
          base) so the SVG's box edge IS the mountain's visible base,
          not empty space below it — otherwise items-end aligns box
          edges, not visible pixels, and the text still looks too high. */}
      <div className="flex items-end gap-2.5 px-4 py-5 border-b border-white/10">
        <svg width="28" height="21" viewBox="4 10 24 18" fill="none" aria-hidden>
          <path d="M4 28 L12 10 L18 20 L23 12 L28 28 Z" fill="#7C3AED" />
          <path d="M18 20 L23 12 L28 28 Z" fill="#22C55E" opacity="0.85" />
        </svg>
        {/* leading-none collapses the default ~28px line-height box
            down to hug the glyphs — without it, "PeakLogic" (which has
            no descenders) sits visually centered in that tall box,
            so its baseline ends up well above the box's true bottom
            edge, and items-end above ends up flushing that empty
            space with the icon's base instead of the actual letters. */}
        <span className="text-lg font-bold tracking-tight leading-none">
          <span className="text-white">Peak</span>
          <span className="text-brand-purple-mid">Logic</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-purple text-white'
                  : 'text-gray-400 hover:bg-white/8 hover:text-white',
              ].join(' ')
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User + sign out */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">
              {user.signInDetails?.loginId ?? user.username}
            </p>
            <p className="text-xs text-gray-500">Signed in</p>
          </div>
          <button
            onClick={onSignOut}
            className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
