import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': '/src' },
  },
  server: {
    // Distinct port from frontend/ (5173) and channel-partner-portal/ (5174),
    // so PeakView360 can run side by side with them for local review.
    port: 5175,
  },
});
