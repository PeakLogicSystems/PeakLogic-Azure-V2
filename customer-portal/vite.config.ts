import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src' } },
  server: { port: 5176 }, // frontend 5173 · partner 5174 · peakview360 5175 · customer 5176
});
