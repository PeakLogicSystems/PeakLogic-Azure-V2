import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} });

const STORAGE_KEY = 'pv360-theme';

/** Message the embedding console sends to drive this app's theme. */
const THEME_MESSAGE = 'peaklogic:theme';

// Resolve the starting theme with the same precedence the pre-paint script in
// index.html uses. Both must agree, or the app would repaint on mount — which is
// exactly the white flash that block exists to prevent. Keep them in step.
//
//   1. ?theme= on the URL   — set by an embedding console, so an iframe opens
//                             already matching its parent rather than adopting
//                             the operator's own stored preference and flipping.
//   2. localStorage         — the operator's own choice when running standalone.
//   3. dark                 — control rooms run dark.
function initialTheme(): Theme {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('theme');
    if (fromUrl === 'dark' || fromUrl === 'light') return fromUrl;
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark'; // storage or URL blocked — fail to the control-room default
  }
}

// Control rooms run dark by default; the toggle is per-operator and persisted —
// mirrors the tenant app's SET-4 ThemeContext (user choice, not OS media query).
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // Whether the current value was pushed in by an embedding console rather than
  // chosen here. An embedded theme is applied but deliberately NOT persisted:
  // viewing PeakView360 inside the light-mode Control Center must not silently
  // overwrite the operator's own standalone preference.
  const external = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    // `pv-light` drives the pre-paint <html> background set inline in
    // index.html. Without keeping it in step here, toggling to light would
    // leave the dark canvas showing behind the app on the next load.
    document.documentElement.classList.toggle('pv-light', theme !== 'dark');
    if (!external.current) {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        /* storage blocked — the theme still applies for this session */
      }
    }
  }, [theme]);

  // Follow the embedding console's theme (Control Center → this iframe).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; theme?: string } | null;
      if (!data || data.type !== THEME_MESSAGE) return;
      if (data.theme !== 'dark' && data.theme !== 'light') return;
      external.current = true;
      setTheme(data.theme);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // An explicit toggle here is the operator's own choice again, so it persists.
  //
  // When framed, it is also announced UPWARD so the surrounding portal follows.
  // Sync has to work both ways: a dark operator view sitting inside a light
  // portal looks broken, and the operator should not have to find the host's
  // toggle to fix what they just changed here.
  //
  // No loop: the host applies it, then echoes it back down; that arrives as an
  // external change with the value already set, so setTheme is a no-op and
  // nothing is posted up again.
  const toggle = () => {
    external.current = false;
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (window.parent !== window) {
      try {
        // targetOrigin '*' — a framed app cannot know its host's origin. The
        // payload is a theme name and nothing else, so there is nothing here
        // worth protecting; the HOST is the side that validates, and it checks
        // the message came from this exact frame before acting on it.
        window.parent.postMessage({ type: THEME_MESSAGE, theme: next }, '*');
      } catch {
        /* host unreachable — the local theme still changed */
      }
    }
  };

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
