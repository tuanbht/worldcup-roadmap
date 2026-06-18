import type { MatchDetail } from '@/domain/types';
import { env } from '@/data/config/env';

interface DetailCacheEntry {
  snapshot: MatchDetail | null;
  expiresAt: number;
  inflight: Promise<MatchDetail> | null;
}

const cache = new Map<string, DetailCacheEntry>();

function entryFor(matchId: string): DetailCacheEntry {
  let entry = cache.get(matchId);
  if (!entry) {
    entry = { snapshot: null, expiresAt: 0, inflight: null };
    cache.set(matchId, entry);
  }
  return entry;
}

function ttl(isLive: boolean): number {
  return isLive ? env.WC_CACHE_TTL_DETAIL_LIVE_MS : env.WC_CACHE_TTL_DETAIL_IDLE_MS;
}

/**
 * Per-match detail cache keyed by `matchId`, with the same three behaviours as
 * the tournament cache:
 *  - TTL tiered by liveness (short while the match is live, long otherwise),
 *  - single-flight per id (concurrent callers share one upstream refresh),
 *  - stale-on-error (serve the last good snapshot if a refresh fails).
 */
export async function getCachedMatchDetail(
  matchId: string,
  loader: () => Promise<MatchDetail>,
  isLive: boolean,
): Promise<MatchDetail> {
  const entry = entryFor(matchId);
  const now = Date.now();
  if (entry.snapshot && now < entry.expiresAt) return entry.snapshot;
  if (entry.inflight) return entry.inflight;

  const refresh = (async (): Promise<MatchDetail> => {
    try {
      const fresh = await loader();
      entry.snapshot = fresh;
      entry.expiresAt = Date.now() + ttl(isLive);
      return fresh;
    } catch (error) {
      if (entry.snapshot) return entry.snapshot;
      throw error;
    } finally {
      entry.inflight = null;
    }
  })();

  entry.inflight = refresh;
  return refresh;
}

/** Test helper — clears the per-match cache between cases. */
export function resetMatchDetailCache(): void {
  cache.clear();
}
