import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { DEMO_PARTNER } from '@/data/partnerBranding';

// Implements UX Wireframes §2.11 (Partner Portal Login, CH-3 / Security
// Architecture §2.4) exactly: partner's own logo, "Sign in to your
// {Partner} account", Email/Password, Sign In, background/accent from
// the partner's own primary_color/secondary_color, no self-service
// signup link anywhere (Domain Model §4 decision 8 -- provisioning is
// admin-initiated, made visible in the UI, not just enforced server-
// side). "A genuinely separate screen from the tenant login, not a
// themed variant of it" per the wireframe's own framing -- this is a
// separate app (channel-partner-portal/), not a route inside frontend/.
//
// Demo-only: no real PartnerPool/Cognito auth exists to call (no
// backend deployed at all). Submitting does nothing but hold a brief
// loading state -- honestly disclosed in the UI itself, not silently
// faked as if it worked, matching this project's established rule
// against pretending mock screens are wired to something real.
export function PartnerLogin() {
  const partner = DEMO_PARTNER;
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Demo: no real PartnerPool/Cognito auth exists (no backend). Submitting holds
  // a brief loading state, then enters the portal so the demo flows end to end.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => navigate('/'), 900);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={
        {
          '--partner-primary': partner.primaryColor,
          '--partner-secondary': partner.secondaryColor,
          background: `radial-gradient(circle at 15% 10%, ${partner.primaryColor}1a, transparent 45%), radial-gradient(circle at 85% 90%, ${partner.secondaryColor}1a, transparent 45%), #F8FAFC`,
        } as React.CSSProperties
      }
    >
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-100 overflow-hidden">
          {/* Partner's own branding, front and center -- a technician or
              dispatcher needs to recognize their own employer's brand to
              know they're in the right place (wireframe §2.11's own
              stated reasoning), not PeakLogic's. */}
          <div
            className="px-8 pt-10 pb-8 text-center"
            style={{ background: `linear-gradient(135deg, ${partner.primaryColor}, ${partner.secondaryColor})` }}
          >
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2 mb-5">
              <Truck size={20} className="text-white" />
              <span className="text-xl font-bold tracking-tight text-white">{partner.logoText}</span>
            </div>
            <p className="text-sm text-white/85 font-medium">{partner.tagline}</p>
          </div>

          <div className="px-8 py-8">
            <h1 className="text-lg font-semibold text-slate-900 text-center mb-6">
              Sign in to your {partner.name} account
            </h1>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-slate-600 mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
                  style={{ boxShadow: email ? `0 0 0 2px ${partner.primaryColor}40` : undefined }}
                  placeholder="you@acesepticwaste.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-xs font-medium text-slate-600 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-70"
                style={{ background: partner.primaryColor }}
              >
                {submitting ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            {/* Deliberately no "forgot password" or self-service signup
                link -- Domain Model §4 decision 8's "provisioning is
                admin-initiated" made visible here, not just enforced at
                the API layer (wireframe §2.11's own stated rule). A
                technician's account is created for them by their
                dispatcher (§2.13), never self-registered. */}
            <p className="text-center text-xs text-slate-400 mt-6">
              Accounts are created by your {partner.name} administrator.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Demo build — no real account exists yet.
        </p>
        <div className="flex items-center justify-center gap-1.5 mt-3">
          <span className="text-[11px] text-slate-400">Powered by</span>
          <span className="text-[11px] font-bold tracking-tight text-slate-500">
            Peak<span style={{ color: '#7C3AED' }}>Logic</span>
          </span>
        </div>
      </div>
    </div>
  );
}
