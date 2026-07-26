import type { Config } from 'tailwindcss';

// Reuses the PeakLogic brand palette exactly (frontend/tailwind.config.ts) so
// PeakView360 looks like the same product as the tenant app and the marketing
// site — plus HMI-specific semantic status colors (running/fault/offline and
// alarm severities), which are information design, not the brand accent.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class', // user-toggled (ThemeContext), mirrors SET-4
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#7C3AED',
          'purple-mid': '#8B5CF6',
          'purple-soft': '#EDE9FE',
          green: '#22C55E',
          'green-soft': '#DCFCE7',
          black: '#0F172A',
        },
        // Semantic HMI status — distinct from the brand accent.
        status: {
          running: '#22C55E',
          fault: '#F59E0B',
          offline: '#64748B',
        },
        sev: {
          critical: '#EF4444',
          warning: '#F59E0B',
          info: '#3B82F6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
