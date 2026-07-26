import { createContext, useContext, useState, type ReactNode } from 'react';

const KEY = 'customer-portal-authed';

interface AuthCtx {
  authed: boolean;
  signIn: () => void;
  signOut: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

// Demo-only session gate: no real backend/Cognito auth exists yet. Real
// credentials are never checked -- honestly a bypassable formality, not faked
// as working, matching the same pattern used in channel-partner-portal.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => localStorage.getItem(KEY) === '1');

  const signIn = () => {
    localStorage.setItem(KEY, '1');
    setAuthed(true);
  };
  const signOut = () => {
    localStorage.removeItem(KEY);
    setAuthed(false);
  };

  return <Ctx.Provider value={{ authed, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used within an AuthProvider');
  return c;
}
