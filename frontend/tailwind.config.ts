import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          purple:       '#7C3AED',
          'purple-mid': '#8B5CF6',
          'purple-soft':'#EDE9FE',
          green:        '#22C55E',
          'green-soft': '#DCFCE7',
          black:        '#0F172A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
