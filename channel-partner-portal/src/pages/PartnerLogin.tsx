import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Truck, Waves } from 'lucide-react';
import { useAuth } from '@/AuthContext';
import { usePartner } from '@/PartnerContext';

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
  const { partner, partners, setPartnerId } = usePartner();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const LogoIcon = partner.vertical === 'pool' ? Waves : Truck;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Demo: no real PartnerPool/Cognito auth exists (no backend). Whatever is
  // typed is accepted -- submitting holds a brief loading state, then enters
  // the portal so the demo flows end to end. Real credential checking is
  // deliberately out of scope until PartnerPool auth is actually built.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      signIn();
      navigate('/');
    }, 900);
  };

  const bypass = () => {
    signIn();
    navigate('/');
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
        {/* In production each partner signs in at their own subdomain, which is
            what determines the branding below -- there's no subdomain routing in
            local dev, so this neutral PeakLogic-chrome picker stands in for that:
            an explicit, visible choice instead of silently reusing whichever
            partner was last active in this browser. */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white/80 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Demo · sign in as</p>
          <div className="flex gap-2">
            {partners.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPartnerId(p.id)}
                className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                  p.id === partner.id ? 'border-slate-300 bg-slate-50' : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10px] font-black text-white" style={{ backgroundColor: p.secondaryColor }}>
                  {p.logoText.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{p.name}</span>
                {p.id === partner.id && <Check size={14} className="shrink-0 text-emerald-500" />}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-100 overflow-hidden">
          {/* Partner's own branding, front and center -- a technician or
              dispatcher needs to recognize their own employer's brand to
              know they're in the right place (wireframe §2.11's own
              stated reasoning), not PeakLogic's. */}
          <div
            className="px-8 pt-10 pb-8 text-center"
            style={{ background: `linear-gradient(135deg, ${partner.primaryColor}, ${partner.secondaryColor})` }}
          >
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2">
              <LogoIcon size={20} className="text-white" />
              <span className={`text-xl font-bold tracking-tight text-white ${partner.lowercaseLogo ? 'lowercase' : ''}`}>{partner.logoText}</span>
            </div>
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
                  placeholder="you@yourcompany.com"
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

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Demo</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <button
              type="button"
              onClick={bypass}
              className="w-full py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
            >
              Continue with demo credentials
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Demo build — any email/password is accepted; no real account or auth exists yet.
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
