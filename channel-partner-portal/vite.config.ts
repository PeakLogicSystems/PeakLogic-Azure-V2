import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': '/src' },
  },
  server: {
    // Deliberately a different port from frontend/'s 5173 -- the whole
    // point is running both side by side (tenant app + partner portal),
    // per the user's explicit "a local dev host to run that as well" ask.
    port: 5174,
  },
});
