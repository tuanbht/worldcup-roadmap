import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Pure-frontend SPA: the browser fetches the FIFA API directly, so there is no
 * backend, no internal `/api/*` route, and no dev/preview proxy. `vite build`
 * produces a static `dist/` served by the CDN.
 */
const PORT = 3217;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: PORT },
  preview: { port: PORT },
});
