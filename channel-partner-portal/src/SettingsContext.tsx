import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePartner } from '@/PartnerContext';

// Per-USER settings (keyed by the active partner/user), persisted to
// localStorage — so John Smith (Ace) and Dana Brown (WTR DR) each keep their own
// theme and preferences, and switching users loads theirs. Mirrors the control
// surface's SET-4 theme model (user choice, not OS media query).
export interface UserSettings {
  theme: 'light' | 'dark';
  emailAlerts: boolean;
  smsAlerts: boolean;
  weeklyDigest: boolean;
}

const DEFAULTS: UserSettings = { theme: 'light', emailAlerts: true, smsAlerts: false, weeklyDigest: true };

const keyFor = (partnerId: string) => `cpp-settings-${partnerId}`;

function load(partnerId: string): UserSettings {
  try {
    const raw = localStorage.getItem(keyFor(partnerId));
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<UserSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

interface SettingsCtx {
  settings: UserSettings;
  update: (patch: Partial<UserSettings>) => void;
  toggleTheme: () => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { partner } = usePartner();
  const [settings, setSettings] = useState<UserSettings>(() => load(partner.id));

  // Load this user's saved settings when the active user changes.
  useEffect(() => setSettings(load(partner.id)), [partner.id]);

  // Apply the theme whenever it (or the user) changes.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  const value = useMemo<SettingsCtx>(() => {
    const apply = (next: UserSettings) => {
      setSettings(next);
      localStorage.setItem(keyFor(partner.id), JSON.stringify(next)); // saved immediately
    };
    return {
      settings,
      update: (patch) => apply({ ...settings, ...patch }),
      toggleTheme: () => apply({ ...settings, theme: settings.theme === 'dark' ? 'light' : 'dark' }),
    };
  }, [settings, partner.id]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSettings must be used within a SettingsProvider');
  return c;
}
