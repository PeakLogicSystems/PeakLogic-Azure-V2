import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
      // Shared, buildless source (packages/ui, packages/domain) — one copy of
      // whatever is genuinely identical between this portal and the customer
      // portal, imported straight from TS source with no separate build step.
      '@shared': fileURLToPath(new URL('../packages', import.meta.url)),
      // packages/ lives OUTSIDE this portal's own directory, so a bare
      // "lucide-react" import from a file in there would walk up looking for
      // a node_modules this portal doesn't control and fail to resolve at
      // build time. Point it at this portal's own copy explicitly.
      'lucide-react': fileURLToPath(new URL('./node_modules/lucide-react', import.meta.url)),
    },
    // Same reasoning for react/react-dom — but these ALSO must never resolve
    // to a second copy (as opposed to zero copies), which would break hooks
    // at runtime ("Invalid hook call") by splitting React's module state
    // across two instances. dedupe pins every resolution to this portal's own
    // single copy rather than aliasing to an exact path.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // Deliberately a different port from frontend/'s 5173 -- the whole
    // point is running both side by side (tenant app + partner portal),
    // per the user's explicit "a local dev host to run that as well" ask.
    port: 5174,
  },
});
