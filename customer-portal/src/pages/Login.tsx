import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CUSTOMER } from '@/data';
import { useAuth } from '@/AuthContext';

// PeakLogic-branded sign-in (the customer is a PeakLogic tenant, not white-label
// like the partner portal). Demo-only: no real backend auth exists -- whatever
// is typed is accepted, and a "Continue with demo credentials" bypass is offered
// openly rather than pretending this screen is wired to something real.
export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-brand-black p-6">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-xl">
          <div className="px-8 pb-8 pt-10 text-center">
            <div className="mb-5 flex items-baseline justify-center gap-2">
              <svg width="26" height="20" viewBox="4 10 24 18" fill="none" aria-hidden="true">
                <path d="M4 28 L12 10 L18 20 L23 12 L28 28 Z" fill="#7C3AED" />
                <path d="M18 20 L23 12 L28 28 Z" fill="#22C55E" opacity="0.85" />
              </svg>
              <span className="text-2xl font-extrabold leading-none tracking-tight text-slate-900">
                Peak<span className="text-brand-purple-mid">Logic</span>
              </span>
            </div>
            <h1 className="text-lg font-semibold text-slate-900">Sign in to the Customer Portal</h1>
            <p className="mt-1 text-sm text-slate-500">{CUSTOMER.name}</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-600">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-shadow focus:border-transparent focus:ring-2 focus:ring-brand-purple-mid/40"
                  placeholder="you@bayfrontmd.gov"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-600">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-shadow focus:border-transparent focus:ring-2 focus:ring-brand-purple-mid/40"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-brand-purple py-2.5 text-sm font-semibold text-white transition-opacity hover:bg-brand-purple-mid disabled:opacity-70"
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Demo</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <button
              type="button"
              onClick={bypass}
              className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              Continue with demo credentials
            </button>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-white/40">
          Demo build — any email/password is accepted; no real account or auth exists yet.
        </p>
      </div>
    </div>
  );
}
