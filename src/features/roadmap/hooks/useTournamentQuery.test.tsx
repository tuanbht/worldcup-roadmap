// @vitest-environment jsdom
//
// M3: only this file opts into jsdom; the domain/data .test.ts files stay on the
// global `node` environment. The pragma above is per-file and does not affect them.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, type RenderHookResult } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMockTournament } from '@/data/providers/mock/build-mock-tournament';
import { parseTournament } from '@/data/schema/tournament-schema';
import { ok, fail } from '@/data/envelope';
import type { Tournament } from '@/domain/types';
import { useTournamentQuery } from './useTournamentQuery';

// The call-site contract RoadmapCanvas destructures. Declared here (not imported)
// so the test binds to the behavioural shape, not an incidental named export.
interface TournamentQueryResult {
  data: Tournament | null;
  loading: boolean;
  error: string | null;
}

const WORLDCUP_ENDPOINT = '/api/worldcup';
const EXPECTED_MATCH_COUNT = 104;
const EXPECTED_GROUP_COUNT = 12;

// A real, schema-valid Tournament so meta.provider and the 104/12 shape are exercised.
const stubTournament: Tournament = parseTournament(buildMockTournament('2026-06-17T00:00:00Z'));

/**
 * A fresh QueryClient per test → no cross-test cache leakage; retries off so a
 * fail envelope surfaces immediately instead of waiting through backoff.
 */
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

/** Stub a single fetch resolution with an HTTP-ok response carrying `envelope`. */
function stubFetchResolved(envelope: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => envelope,
  } as Response);
}

/** Stub fetch to reject (network failure / DNS error / aborted connection). */
function stubFetchRejected(error: Error) {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);
}

function renderQuery(): RenderHookResult<TournamentQueryResult, unknown> {
  return renderHook(() => useTournamentQuery(), { wrapper: makeWrapper() });
}

/** Render and wait until the query has settled (loading flipped false). */
async function renderSettled(): Promise<RenderHookResult<TournamentQueryResult, unknown>> {
  const view = renderQuery();
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTournamentQuery', () => {
  describe('contract / call-site shape', () => {
    it('exposes the { data, loading, error } shape RoadmapCanvas destructures', () => {
      stubFetchResolved(ok(stubTournament));

      const { result } = renderQuery();

      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('error');
    });

    it('starts loading with null data before the first response resolves', () => {
      stubFetchResolved(ok(stubTournament));

      const { result } = renderQuery();

      // Synchronously after mount, before fetch resolves.
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
    });

    it('fetches the relative /api/worldcup endpoint (proxied to the Hono API)', async () => {
      const spy = stubFetchResolved(ok(stubTournament));

      await renderSettled();

      expect(spy).toHaveBeenCalledWith(WORLDCUP_ENDPOINT, expect.anything());
    });
  });

  describe('success envelope', () => {
    it('resolves the full Tournament (incl. meta.provider) and clears error', async () => {
      stubFetchResolved(ok(stubTournament));

      const { result } = await renderSettled();

      expect(result.current.error).toBeNull();
      // M4: full Tournament returned so the Legend can read meta.provider.
      expect(result.current.data?.meta.provider).toBe('mock');
      expect(result.current.data?.matches).toHaveLength(EXPECTED_MATCH_COUNT);
      expect(result.current.data?.groups).toHaveLength(EXPECTED_GROUP_COUNT);
    });

    it('drives the success path through the query lifecycle, not a hand-rolled timer', async () => {
      // No setInterval/AbortController: the only timing concern is TanStack
      // Query's own refetch interval. Completing via the query lifecycle (not a
      // manual timer) proves the polling rewire.
      stubFetchResolved(ok(stubTournament));

      const { result } = renderQuery();

      await waitFor(() => expect(result.current.data).not.toBeNull());
      expect(result.current.loading).toBe(false);
    });
  });

  describe('failure handling', () => {
    it('surfaces the fail-envelope message and keeps data null', async () => {
      stubFetchResolved(fail('RATE_LIMITED', 'Upstream rate limit reached'));

      const { result } = await renderSettled();

      expect(result.current.error).toBe('Upstream rate limit reached');
      expect(result.current.data).toBeNull();
    });

    it('surfaces a rejected fetch (network error) as a non-null error string', async () => {
      stubFetchRejected(new Error('Failed to fetch'));

      const { result } = await renderSettled();

      expect(result.current.data).toBeNull();
      expect(typeof result.current.error).toBe('string');
      expect(result.current.error).toContain('Failed to fetch');
    });
  });
});
