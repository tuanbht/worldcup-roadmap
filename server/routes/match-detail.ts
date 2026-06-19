import { Hono } from 'hono';
import { getCachedMatchDetail } from '@/data/cache/match-detail-cache';
import { getCachedTournament } from '@/data/cache/tournament-cache';
import { fail, ok } from '@/data/envelope';
import { selectRepository } from '@/data/repository-factory';
import { fetchFifaMatchDetail } from '@/data/providers/fifa/match-detail-client';
import { mapFifaMatchDetail } from '@/data/providers/fifa/match-detail-mapper';
import type { Match } from '@/domain/types';
import { CACHE_CONTROL, DETAIL_UNAVAILABLE, mapError, toHttpStatus } from './error-mapping';

const UNAVAILABLE_MESSAGE = "Detailed timeline, lineups and stats aren't available for this match.";

/** Resolve a match by id from the cached tournament snapshot. */
async function resolveMatch(matchId: string): Promise<Match | null> {
  const tournament = await getCachedTournament(selectRepository());
  return tournament.matches.find((m) => m.id === matchId) ?? null;
}

/**
 * `GET /api/worldcup/match/:matchId/detail` → `ApiEnvelope<MatchDetail>`.
 *
 * Resolves matchId → providerRef via the cached tournament, then fetches +
 * caches the FIFA per-match detail. Null providerRef / unknown id → a typed
 * `DETAIL_UNAVAILABLE` HTTP-200 fail envelope. Genuine upstream throws map to
 * their own status via `error-mapping`. Imports only from `@/data` + `@/domain`.
 */
export const matchDetail = new Hono().get('/api/worldcup/match/:matchId/detail', async (c) => {
  const matchId = c.req.param('matchId');
  try {
    const match = await resolveMatch(matchId);
    const ref = match?.providerRef ?? null;
    if (!ref) {
      return c.json(fail(DETAIL_UNAVAILABLE, UNAVAILABLE_MESSAGE), 200, {
        'Cache-Control': CACHE_CONTROL,
      });
    }

    const detail = await getCachedMatchDetail(
      matchId,
      async () => {
        const { live, timeline } = await fetchFifaMatchDetail(ref);
        return mapFifaMatchDetail(live, timeline, ref);
      },
      match!.status === 'live',
    );

    return c.json(ok(detail), 200, { 'Cache-Control': CACHE_CONTROL });
  } catch (error: unknown) {
    const apiError = mapError(error);
    return c.json(fail(apiError.code, apiError.message), toHttpStatus(apiError.http));
  }
});
