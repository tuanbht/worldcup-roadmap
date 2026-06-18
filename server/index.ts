import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { worldcup } from './routes/worldcup';
import { matchDetail } from './routes/match-detail';

/**
 * Standalone Hono API process (was the Next route handler).
 *
 * The Vite dev/preview server proxies `/api` here, so the SPA fetches a relative
 * `/api/worldcup` while this process owns the FIFA fetch + TTL cache server-side.
 */
const PORT = Number(process.env.PORT ?? 8787);

const app = new Hono();
app.route('/', worldcup);
app.route('/', matchDetail);

serve({ fetch: app.fetch, port: PORT });
