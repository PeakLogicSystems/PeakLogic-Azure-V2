import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface Settings {
  theme: 'light' | 'dark';
  emailAlerts: boolean;
  smsAlerts: boolean;
  monthlyReport: boolean;
}

const DEFAULTS: Settings = { theme: 'light', emailAlerts: true, smsAlerts: true, monthlyReport: true };
const KEY = 'customer-portal-settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  toggleTheme: () => void;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  const value = useMemo<Ctx>(() => {
    const apply = (next: Settings) => {
      setSettings(next);
      localStorage.setItem(KEY, JSON.stringify(next));
    };
    return {
      settings,
      update: (patch) => apply({ ...settings, ...patch }),
      toggleTheme: () => apply({ ...settings, theme: settings.theme === 'dark' ? 'light' : 'dark' }),
    };
  }, [settings]);

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error('useSettings must be used within a SettingsProvider');
  return c;
}
