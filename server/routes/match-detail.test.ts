// Node environment (global default). Pin the provider before any data-layer
// module loads, exactly like worldcup.test.ts.
process.env.WC_PROVIDER = 'mock';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import { RateLimitError, ValidationError } from '@/data/errors';
import { DETAIL_UNAVAILABLE } from '@/data/detail-codes';
import { EMPTY_MATCH_DETAIL } from '@/domain/types';
import type { Match, MatchDetail, ProviderRef, Tournament } from '@/domain/types';
import { teamRef } from '@/domain/types';

const CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=120';
const ENVELOPE_KEYS = ['data', 'error', 'success'];

const FIFA_REF: ProviderRef = {
  idCompetition: '17',
  idSeason: '285023',
  idStage: 'st-1',
  idMatch: '400251',
};

function makeMatch(id: string, providerRef: ProviderRef | null, status: Match['status']): Match {
  return {
    id,
    providerMatchId: id,
    providerRef,
    stage: 'ROUND_OF_16',
    group: null,
    matchday: null,
    home: teamRef({ id: 'h', name: 'France', code: 'FRA', flagUrl: null }),
    away: teamRef({ id: 'a', name: 'Brazil', code: 'BRA', flagUrl: null }),
    score: {
      home: 2,
      away: 1,
      penaltyHome: null,
      penaltyAway: null,
      resolution: 'regular',
      winner: 'home',
    },
    kickoff: '2026-07-04T16:00:00Z',
    status,
    minute: null,
    venue: { name: null, city: null },
  };
}

const FIFA_MATCH = makeMatch('wc2026-fifa-400251', FIFA_REF, 'finished');
const MOCK_MATCH = makeMatch('wc2026-mock-1', null, 'finished');

function tournamentWith(matches: readonly Match[]): Tournament {
  return {
    meta: {
      id: 'WC-2026',
      name: 'FIFA World Cup 2026',
      season: 2026,
      provider: 'fifa',
      fetchedAt: '',
    },
    teams: [],
    matches,
    groups: [],
    bracket: { rounds: [] },
  } as unknown as Tournament;
}

/** Stub the tournament cache so the route resolves a known match → providerRef. */
function mockTournament(matches: readonly Match[]): void {
  vi.doMock('@/data/cache/tournament-cache', () => ({
    getCachedTournament: async () => tournamentWith(matches),
    resetTournamentCache: () => {},
  }));
}

/** Stub the detail cache as a single-flight loader proxy with a call counter. */
function mockDetailCache(): { loaderCalls: () => number } {
  let calls = 0;
  vi.doMock('@/data/cache/match-detail-cache', () => ({
    getCachedMatchDetail: async (
      _id: string,
      loader: () => Promise<MatchDetail>,
    ): Promise<MatchDetail> => {
      calls += 1;
      return loader();
    },
    resetMatchDetailCache: () => {},
  }));
  return { loaderCalls: () => calls };
}

/** Stub the FIFA detail fetch + mapper so no network is touched. */
function mockFifaDetail(detail: MatchDetail): void {
  vi.doMock('@/data/providers/fifa/match-detail-client', () => ({
    fetchFifaMatchDetail: async () => ({ live: null, timeline: null }),
  }));
  vi.doMock('@/data/providers/fifa/match-detail-mapper', () => ({
    mapFifaMatchDetail: () => detail,
  }));
}

/** Make the FIFA detail fetch throw, exercising the error → mapError path. */
function mockFifaDetailThrows(error: unknown): void {
  vi.doMock('@/data/providers/fifa/match-detail-client', () => ({
    fetchFifaMatchDetail: async () => {
      throw error;
    },
  }));
}

async function loadRoute(): Promise<Hono> {
  const { matchDetail } = await import('./match-detail');
  return matchDetail;
}

async function request(matchId: string): Promise<{ res: Response; body: any }> {
  const route = await loadRoute();
  const res = await route.request(`/api/worldcup/match/${matchId}/detail`);
  const body = await res.json();
  return { res, body };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('GET /api/worldcup/match/:matchId/detail (Hono route)', () => {
  describe('FIFA-ref match → success', () => {
    it('returns 200 with an ok(MatchDetail) envelope', async () => {
      mockTournament([FIFA_MATCH]);
      mockDetailCache();
      mockFifaDetail(EMPTY_MATCH_DETAIL(FIFA_MATCH.id));

      const { res, body } = await request(FIFA_MATCH.id);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.error).toBeNull();
      expect(body.data.matchId).toBe(FIFA_MATCH.id);
    });

    it('sets the shared Cache-Control header on success', async () => {
      mockTournament([FIFA_MATCH]);
      mockDetailCache();
      mockFifaDetail(EMPTY_MATCH_DETAIL(FIFA_MATCH.id));

      const { res } = await request(FIFA_MATCH.id);

      expect(res.headers.get('cache-control')).toBe(CACHE_CONTROL);
    });

    it('routes every detail request through getCachedMatchDetail (delegates dedupe to the cache)', async () => {
      mockTournament([FIFA_MATCH]);
      const cache = mockDetailCache();
      mockFifaDetail(EMPTY_MATCH_DETAIL(FIFA_MATCH.id));

      const route = await loadRoute();
      await Promise.all([
        route.request(`/api/worldcup/match/${FIFA_MATCH.id}/detail`),
        route.request(`/api/worldcup/match/${FIFA_MATCH.id}/detail`),
      ]);

      // The passthrough cache stub forwards each call, so both requests reaching
      // it proves the route delegates to getCachedMatchDetail rather than
      // fetching directly. Single-flight dedupe itself is the cache's own test.
      expect(cache.loaderCalls()).toBe(2);
    });
  });

  describe('unavailable detail', () => {
    it('returns 200 fail(DETAIL_UNAVAILABLE) for a mock match (null providerRef)', async () => {
      mockTournament([MOCK_MATCH]);
      mockDetailCache();

      const { res, body } = await request(MOCK_MATCH.id);

      expect(res.status).toBe(200);
      expect(body.success).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error.code).toBe(DETAIL_UNAVAILABLE);
    });

    it('returns 200 fail(DETAIL_UNAVAILABLE) for an unknown matchId', async () => {
      mockTournament([FIFA_MATCH]);
      mockDetailCache();

      const { res, body } = await request('does-not-exist');

      expect(res.status).toBe(200);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(DETAIL_UNAVAILABLE);
    });

    it('sets the Cache-Control header on the unavailable response too', async () => {
      mockTournament([MOCK_MATCH]);
      mockDetailCache();

      const { res } = await request(MOCK_MATCH.id);

      expect(res.headers.get('cache-control')).toBe(CACHE_CONTROL);
    });
  });

  describe('upstream error mapping', () => {
    it('maps a RateLimitError thrown by the loader to a 429 fail envelope', async () => {
      mockTournament([FIFA_MATCH]);
      // Let the loader run (no swallow) so the thrown error reaches the route.
      vi.doMock('@/data/cache/match-detail-cache', () => ({
        getCachedMatchDetail: async (_id: string, loader: () => Promise<MatchDetail>) => loader(),
        resetMatchDetailCache: () => {},
      }));
      mockFifaDetailThrows(new RateLimitError('Upstream rate limit reached'));

      const { res, body } = await request(FIFA_MATCH.id);

      expect(res.status).toBe(429);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RATE_LIMITED');
    });

    it('maps a ValidationError (zod boundary) thrown by the loader to a 502 fail envelope', async () => {
      mockTournament([FIFA_MATCH]);
      vi.doMock('@/data/cache/match-detail-cache', () => ({
        getCachedMatchDetail: async (_id: string, loader: () => Promise<MatchDetail>) => loader(),
        resetMatchDetailCache: () => {},
      }));
      mockFifaDetailThrows(new ValidationError('FIFA detail payload failed validation'));

      const { res, body } = await request(FIFA_MATCH.id);

      expect(res.status).toBe(502);
      expect(body.success).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error.code).toBe('UPSTREAM_INVALID');
    });
  });

  describe('envelope shape', () => {
    it('emits the canonical { success, data, error } keys', async () => {
      mockTournament([MOCK_MATCH]);
      mockDetailCache();

      const { body } = await request(MOCK_MATCH.id);

      expect(Object.keys(body).sort()).toEqual(ENVELOPE_KEYS);
    });
  });
});
