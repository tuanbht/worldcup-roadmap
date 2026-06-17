// Node environment (the global vitest default) — this exercises the data layer.
//
// H2: env.ts runs `EnvSchema.parse(process.env)` at import time, and WC_PROVIDER
// defaults to `auto` (which builds a FifaRepository → real network). We pin
// WC_PROVIDER=mock BEFORE any data-layer module is imported, then dynamic-import
// the route so import order can never capture `auto`. (vitest.config also sets
// test.env.WC_PROVIDER=mock as belt-and-suspenders.)
process.env.WC_PROVIDER = 'mock';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import { resetTournamentCache } from '@/data/cache/tournament-cache';
import { RateLimitError, RepositoryError, ValidationError } from '@/data/errors';
import type { MatchRepository } from '@/data/repository';

// Counts the World Cup fixture's normalized shape — same numbers the old Next
// route + the e2e API check assert, so a drift in any layer is caught here.
const EXPECTED_MATCH_COUNT = 104;
const EXPECTED_GROUP_COUNT = 12;
const CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=120';
const ENVELOPE_KEYS = ['data', 'error', 'success'];

/**
 * Import a fresh copy of the route AFTER any `vi.doMock` has been registered, so
 * the mocked `selectRepository` is the one the route binds to. `vi.resetModules`
 * in afterEach guarantees each case starts from a clean module graph.
 */
async function loadRoute(): Promise<Hono> {
  const { worldcup } = await import('./worldcup');
  return worldcup;
}

/** Request the endpoint and return the parsed JSON envelope alongside the response. */
async function getWorldcup(): Promise<{ res: Response; body: any }> {
  const worldcup = await loadRoute();
  const res = await worldcup.request('/api/worldcup');
  const body = await res.json();
  return { res, body };
}

/** Make the route's repository throw, exercising the cache miss → error path. */
function mockThrowingRepository(error: unknown): void {
  const throwingRepo: MatchRepository = {
    name: 'throwing',
    getTournament: async () => {
      throw error;
    },
  };
  vi.doMock('@/data/repository-factory', () => ({
    selectRepository: (): MatchRepository => throwingRepo,
  }));
}

beforeEach(() => {
  resetTournamentCache();
});

afterEach(() => {
  resetTournamentCache();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('GET /api/worldcup (Hono route)', () => {
  describe('success path (WC_PROVIDER=mock)', () => {
    it('returns 200 with a success envelope wrapping the normalized tournament', async () => {
      const { res, body } = await getWorldcup();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.error).toBeNull();
      expect(body.data.matches).toHaveLength(EXPECTED_MATCH_COUNT);
      expect(body.data.groups).toHaveLength(EXPECTED_GROUP_COUNT);
    });

    it('preserves tournament meta (id + provider) in the payload', async () => {
      const { body } = await getWorldcup();

      expect(body.data.meta.provider).toBe('mock');
      expect(body.data.meta.id).toBe('WC-2026');
    });

    it('uses the exact ApiEnvelope success shape { success, data, error }', async () => {
      const { body } = await getWorldcup();

      expect(Object.keys(body).sort()).toEqual(ENVELOPE_KEYS);
    });

    it('sets the same Cache-Control header the Next route used', async () => {
      const { res } = await getWorldcup();

      expect(res.headers.get('cache-control')).toBe(CACHE_CONTROL);
    });

    it('serves repeated requests from the single-flight cache (one upstream call)', async () => {
      const getTournament = vi.fn(async () => {
        const { buildMockTournament } = await import('@/data/providers/mock/build-mock-tournament');
        const { parseTournament } = await import('@/data/schema/tournament-schema');
        return parseTournament(buildMockTournament('2026-06-17T00:00:00Z'));
      });
      vi.doMock('@/data/repository-factory', () => ({
        selectRepository: (): MatchRepository => ({ name: 'counting', getTournament }),
      }));

      const worldcup = await loadRoute();
      const [first, second] = await Promise.all([
        worldcup.request('/api/worldcup'),
        worldcup.request('/api/worldcup'),
      ]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      // Cache TTL + single-flight: concurrent callers share one upstream refresh.
      expect(getTournament).toHaveBeenCalledTimes(1);
    });
  });

  describe('routing', () => {
    it('404s any path other than /api/worldcup', async () => {
      const worldcup = await loadRoute();

      const res = await worldcup.request('/api/unknown');

      expect(res.status).toBe(404);
    });
  });

  describe('error path → fail envelope (toApiError mapping)', () => {
    it.each([
      {
        label: 'RateLimitError → 429 RATE_LIMITED',
        error: new RateLimitError('Upstream rate limit reached'),
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Upstream rate limit reached',
      },
      {
        label: 'ValidationError → 502 UPSTREAM_INVALID',
        error: new ValidationError('schema drift in match 37'),
        status: 502,
        code: 'UPSTREAM_INVALID',
        message: 'schema drift in match 37',
      },
      {
        label: 'RepositoryError → its own code + httpStatus',
        error: new RepositoryError('UPSTREAM_DOWN', 'boom', 502),
        status: 502,
        code: 'UPSTREAM_DOWN',
        message: 'boom',
      },
    ])('maps a $label', async ({ error, status, code, message }) => {
      mockThrowingRepository(error);

      const { res, body } = await getWorldcup();

      expect(res.status).toBe(status);
      expect(body.success).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toEqual({ code, message });
    });

    it('maps an unknown (non-RepositoryError) throw to a 500 INTERNAL fail envelope', async () => {
      mockThrowingRepository(new Error('totally unexpected'));

      const { res, body } = await getWorldcup();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toEqual({ code: 'INTERNAL', message: 'totally unexpected' });
    });

    it('emits the canonical fail envelope shape { success:false, data:null, error:{code,message} }', async () => {
      mockThrowingRepository(new RepositoryError('UPSTREAM_DOWN', 'boom', 502));

      const { body } = await getWorldcup();

      expect(Object.keys(body).sort()).toEqual(ENVELOPE_KEYS);
      expect(Object.keys(body.error).sort()).toEqual(['code', 'message']);
    });
  });
});
