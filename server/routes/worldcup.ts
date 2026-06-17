import { Hono } from 'hono';
import { getCachedTournament } from '@/data/cache/tournament-cache';
import { fail, ok } from '@/data/envelope';
import { RepositoryError, toApiError } from '@/data/errors';
import { selectRepository } from '@/data/repository-factory';

const CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=120';

interface MappedError {
  code: string;
  message: string;
  http: number;
}

/** True for a `RepositoryError`-shaped value (has code + numeric httpStatus). */
function isRepositoryErrorShape(
  error: unknown,
): error is { code: string; message: string; httpStatus: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { httpStatus?: unknown }).httpStatus === 'number' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

/**
 * Map a thrown error to `{ code, message, http }`.
 *
 * Prefers the shared `toApiError`. As a fallback we duck-type the
 * `RepositoryError` shape: a server process can hold more than one module
 * instance of `@/data/errors`, in which case `instanceof RepositoryError` (used
 * inside `toApiError`) is identity-sensitive and would mis-map a domain error to
 * a generic 500. The structural check keeps the upstream code/status intact.
 */
function mapError(error: unknown): MappedError {
  if (error instanceof RepositoryError || !isRepositoryErrorShape(error)) {
    return toApiError(error);
  }
  return { code: error.code, message: error.message, http: error.httpStatus };
}

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
