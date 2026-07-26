import { createContext, useContext, useState, type ReactNode } from 'react';

const KEY = 'cpp-authed';

interface AuthCtx {
  authed: boolean;
  signIn: () => void;
  signOut: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

// Demo-only session gate: no real PartnerPool/Cognito auth exists (no backend
// deployed at all). Real credentials are never checked -- the login screen is
// honestly a bypassable formality until that auth exists, not faked as working.
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
