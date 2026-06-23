import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { buildCorsMiddleware } from './cors';
import { worldcup } from './routes/worldcup';
import { matchDetail } from './routes/match-detail';

/**
 * Standalone Hono API process (was the Next route handler).
 *
 * The SPA connects to this origin DIRECTLY via `VITE_API_BASE_URL` (e.g.
 * `http://localhost:8787` in dev, the deployed API origin in prod). The Vite
 * `/api` proxy is an optional dev/preview fallback, not the supported prod path.
 * This process owns the FIFA fetch + TTL cache server-side.
 *
 * CORS is opt-in (CR-7 + Batch G): unset keeps the same-origin default (no CORS
 * headers). `CORS_ALLOWED_ORIGIN` (singular, legacy) restricts `/api/*` to that
 * one origin; `CORS_ALLOWED_ORIGINS` (plural, comma-separated) is an allowlist.
 * Both are unioned for direct cross-origin GETs. See `docs/deploy-runbook.md`.
 */
const PORT = Number(process.env.PORT ?? 8787);

const app = new Hono();

const corsMiddleware = buildCorsMiddleware({
  single: process.env.CORS_ALLOWED_ORIGIN,
  allowlist: process.env.CORS_ALLOWED_ORIGINS,
});
if (corsMiddleware) app.use('/api/*', corsMiddleware);

app.route('/', worldcup);
app.route('/', matchDetail);

serve({ fetch: app.fetch, port: PORT });
