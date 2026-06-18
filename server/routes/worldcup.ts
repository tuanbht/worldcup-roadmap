import { Hono } from 'hono';
import { getCachedTournament } from '@/data/cache/tournament-cache';
import { fail, ok } from '@/data/envelope';
import { selectRepository } from '@/data/repository-factory';
import { CACHE_CONTROL, mapError } from './error-mapping';

/**
 * `GET /api/worldcup` — the thin Hono replacement for the old Next route.
 *
 * Reuses the exact same `selectRepository()` + `getCachedTournament()` pipeline
 * (liveness-tiered TTL, single-flight, stale-on-error) and returns the SAME
 * `ApiEnvelope<Tournament>` (`ok`/`fail`) shape + Cache-Control header. The FIFA
 * `User-Agent`/pagination logic still runs server-side here (CORS-safe).
 */
export const worldcup = new Hono().get('/api/worldcup', async (c) => {
  try {
    const repo = selectRepository();
    const tournament = await getCachedTournament(repo);
    return c.json(ok(tournament), 200, { 'Cache-Control': CACHE_CONTROL });
  } catch (error: unknown) {
    const apiError = mapError(error);
    return c.json(fail(apiError.code, apiError.message), apiError.http as 429 | 500 | 502);
  }
});
