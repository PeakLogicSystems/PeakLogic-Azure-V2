import { createContext, useContext, useState, type ReactNode } from 'react';
import { detectBrowserTimezone } from '@/lib/datetime';

// SET-3/SET-5 (PRD/SRS v1.6) — clock format and timezone, as real
// application-wide state, not local component state on the Settings page.
// Previously Settings.tsx held clockFormat/timezone in its own useState,
// so a change never affected anything else on the page and vanished on
// navigation — this is the fix: shared state, exactly the same shape as
// ThemeContext (that one wasn't the bug; a stale dev-server process that
// hadn't picked up tailwind.config.ts's darkMode:'class' change was).

export type ClockFormat = '12h' | '24h';

interface PreferencesContextValue {
  clockFormat: ClockFormat;
  timezone: string;
  setClockFormat: (format: ClockFormat) => void;
  setTimezone: (tz: string) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const CLOCK_FORMAT_KEY = 'peaklogic-clock-format';
const TIMEZONE_KEY = 'peaklogic-timezone';

function getInitialClockFormat(): ClockFormat {
  const stored = localStorage.getItem(CLOCK_FORMAT_KEY);
  return stored === '12h' || stored === '24h' ? stored : '24h';
}

function getInitialTimezone(): string {
  return localStorage.getItem(TIMEZONE_KEY) || detectBrowserTimezone();
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [clockFormat, setClockFormatState] = useState<ClockFormat>(getInitialClockFormat);
  const [timezone, setTimezoneState] = useState<string>(getInitialTimezone);

  const setClockFormat = (format: ClockFormat) => {
    setClockFormatState(format);
    localStorage.setItem(CLOCK_FORMAT_KEY, format);
  };

  const setTimezone = (tz: string) => {
    setTimezoneState(tz);
    localStorage.setItem(TIMEZONE_KEY, tz);
  };

  return (
    <PreferencesContext.Provider value={{ clockFormat, timezone, setClockFormat, setTimezone }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
