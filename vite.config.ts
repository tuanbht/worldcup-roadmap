import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * The SPA fetches a RELATIVE `/api/worldcup`; the Hono API runs as a separate
 * process on :8787. We proxy `/api` to it in BOTH dev and preview.
 *
 * `vite preview` does NOT honor `server.proxy` — it has its own `preview.proxy`
 * key — so the shared `proxy` constant is assigned to both. Without `preview.proxy`,
 * every in-browser `/api/worldcup` call (and the Playwright `request` fixture)
 * would 404 against the preview server.
 */
const proxy = {
  '/api': { target: 'http://localhost:8787', changeOrigin: true },
} as const;

const PORT = 3217;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: PORT, proxy },
  preview: { port: PORT, proxy },
});
