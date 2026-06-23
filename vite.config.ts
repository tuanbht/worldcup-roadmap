import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * The SPA connects to the Hono API origin DIRECTLY via `VITE_API_BASE_URL`
 * (e.g. `http://localhost:8787`) — that is the supported path in dev and prod.
 * This `/api` proxy is an OPTIONAL fallback: when `VITE_API_BASE_URL` is unset
 * the client emits a relative `/api/worldcup`, which the proxy forwards to the
 * separate Hono process on :8787.
 *
 * `vite preview` does NOT honor `server.proxy` — it has its own `preview.proxy`
 * key — so the shared `proxy` constant is assigned to both. Without `preview.proxy`,
 * a relative `/api/worldcup` call (and the Playwright `request` fixture) would
 * 404 against the preview server when no base URL is configured.
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
