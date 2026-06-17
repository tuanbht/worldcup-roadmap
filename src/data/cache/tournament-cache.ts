import type { Tournament } from '@/domain/types';
import { env } from '@/data/config/env';
import type { MatchRepository } from '@/data/repository';

interface CacheState {
  snapshot: Tournament | null;
  expiresAt: number;
  inflight: Promise<Tournament> | null;
}

const state: CacheState = { snapshot: null, expiresAt: 0, inflight: null };

function ttlFor(tournament: Tournament): number {
  const live = tournament.matches.some((m) => m.status === 'live');
  return live ? env.WC_CACHE_TTL_LIVE_MS : env.WC_CACHE_TTL_IDLE_MS;
}

/**
 * Module-singleton snapshot cache with three behaviours:
 *  - TTL tiered by liveness (short while any match is live, long otherwise),
 *  - single-flight (concurrent callers share one upstream refresh),
 *  - stale-on-error (serve the last good snapshot if a refresh fails).
 */
export async function getCachedTournament(repo: MatchRepository): Promise<Tournament> {
  const now = Date.now();
  if (state.snapshot && now < state.expiresAt) return state.snapshot;
  if (state.inflight) return state.inflight;

  const refresh = (async (): Promise<Tournament> => {
    try {
      const fresh = await repo.getTournament();
      state.snapshot = fresh;
      state.expiresAt = Date.now() + ttlFor(fresh);
      return fresh;
    } catch (error) {
      if (state.snapshot) return state.snapshot;
      throw error;
    } finally {
      state.inflight = null;
    }
  })();

  state.inflight = refresh;
  return refresh;
}

/** Test helper — clears the singleton between cases. */
export function resetTournamentCache(): void {
  state.snapshot = null;
  state.expiresAt = 0;
  state.inflight = null;
}
