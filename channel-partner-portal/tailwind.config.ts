import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class', // user-toggled per-user (SettingsContext), persisted
  theme: {
    extend: {
      colors: {
        // PeakLogic's own brand (used only for the small "Powered by
        // PeakLogic" attribution -- everything else on this screen uses
        // the partner's own colors, which are genuinely dynamic per
        // Domain Model's ChannelPartner.branding, not a Tailwind theme
        // color -- see src/data/partnerBranding.ts and the CSS custom
        // properties in index.css for how those get applied at runtime.
        peaklogic: {
          purple: '#7C3AED',
          black: '#0F172A',
        },
        // Partner brand colors are read from CSS custom properties
        // (--partner-primary/--partner-secondary), set at runtime from
        // whichever partner's branding is active -- this is what makes
        // the white-label mechanism real rather than a hardcoded skin.
        partner: {
          primary: 'var(--partner-primary)',
          secondary: 'var(--partner-secondary)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
