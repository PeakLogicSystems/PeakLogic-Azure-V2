import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} });

// Control rooms run dark by default; the toggle is per-operator and persisted —
// mirrors the tenant app's SET-4 ThemeContext (user choice, not OS media query).
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('pv360-theme') as Theme) ?? 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    // `pv-light` drives the pre-paint <html> background set inline in
    // index.html. Without keeping it in step here, toggling to light would
    // leave the dark canvas showing behind the app on the next load.
    document.documentElement.classList.toggle('pv-light', theme !== 'dark');
    localStorage.setItem('pv360-theme', theme);
  }, [theme]);

  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
