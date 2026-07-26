import type { Config } from 'tailwindcss';

// The Customer Portal is PeakLogic-branded (the customer is a PeakLogic tenant),
// so it uses the PeakLogic brand palette directly — unlike the white-labeled
// partner portal.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#7C3AED',
          'purple-mid': '#8B5CF6',
          'purple-soft': '#EDE9FE',
          green: '#22C55E',
          black: '#0F172A',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
