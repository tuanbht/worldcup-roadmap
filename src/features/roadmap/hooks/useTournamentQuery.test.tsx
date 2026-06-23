// @vitest-environment jsdom
//
// M3: only this file opts into jsdom; the domain/data .test.ts files stay on the
// global `node` environment. The pragma above is per-file and does not affect them.
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const WORLDCUP_PATH = '/api/worldcup';
const API_BASE = 'http://localhost:8787';
const ABSOLUTE_ENDPOINT = `${API_BASE}${WORLDCUP_PATH}`;
const EXPECTED_MATCH_COUNT = 104;
const EXPECTED_GROUP_COUNT = 12;

// A real, schema-valid Tournament so meta.provider and the 104/12 shape are exercised.
const stubTournament: Tournament = parseTournament(buildMockTournament('2026-06-17T00:00:00Z'));

interface WrapperOptions {
  /** Window-focus refetch policy under test (mirrors the real queryClient flag). */
  readonly refetchOnWindowFocus?: boolean;
  /** Freshness window; 0 makes a query stale immediately (focus will refetch). */
  readonly staleTime?: number;
}

/**
 * A fresh QueryClient per test → no cross-test cache leakage; retries off so a
 * fail envelope surfaces immediately instead of waiting through backoff. The
 * focus/stale knobs let the focus-refetch cases drive "stale" vs "fresh"
 * deterministically without real timers.
 */
function makeWrapper(options: WrapperOptions = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
        staleTime: options.staleTime ?? 0,
      },
    },
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

function renderQuery(options?: WrapperOptions): RenderHookResult<TournamentQueryResult, unknown> {
  return renderHook(() => useTournamentQuery(), { wrapper: makeWrapper(options) });
}

/** Render and wait until the query has settled (loading flipped false). */
async function renderSettled(
  options?: WrapperOptions,
): Promise<RenderHookResult<TournamentQueryResult, unknown>> {
  const view = renderQuery(options);
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Each test starts from a known "focused" baseline so a prior case's
  // setFocused(false) can never leak in and suppress a fetch.
  focusManager.setFocused(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  focusManager.setFocused(true);
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

    it('builds the fetch URL through apiUrl() — absolute when VITE_API_BASE_URL is set', async () => {
      // Part 1: with the base configured, the fetcher must hit the direct Hono
      // origin, not a bare relative /api path. apiUrl() reads the env lazily, so
      // stubbing it before render drives the absolute URL into fetch.
      vi.stubEnv('VITE_API_BASE_URL', API_BASE);
      const spy = stubFetchResolved(ok(stubTournament));

      await renderSettled();

      expect(spy).toHaveBeenCalledWith(ABSOLUTE_ENDPOINT, expect.anything());
    });

    it('falls back to the relative /api/worldcup path when no base URL is configured', async () => {
      // Base unset → apiUrl() returns the path unchanged so the dev Vite proxy
      // keeps working. Either way the URL comes from apiUrl(), never a hardcoded
      // literal in the fetcher.
      const spy = stubFetchResolved(ok(stubTournament));

      await renderSettled();

      expect(spy).toHaveBeenCalledWith(WORLDCUP_PATH, expect.anything());
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

    it('loads the tournament on mount (refresh = mount + focus-when-stale + reconnect)', async () => {
      // Part 2: with the interval removed, the data must still arrive on the
      // initial mount fetch — no timer needed to populate it.
      stubFetchResolved(ok(stubTournament));

      const { result } = renderQuery();

      await waitFor(() => expect(result.current.data).not.toBeNull());
      expect(result.current.loading).toBe(false);
    });
  });

  describe('no interval polling (Part 2)', () => {
    it('does NOT re-fetch on its own after the initial mount load (no refetchInterval)', async () => {
      // Drive virtual time well past the old 45s interval. With refetchInterval
      // removed, fetch must fire exactly once (the mount load) — no polling tick
      // schedules a second request.
      vi.useFakeTimers();
      try {
        const spy = stubFetchResolved(ok(stubTournament));
        const { result } = renderQuery();

        await vi.waitFor(() => expect(result.current.data).not.toBeNull());
        const callsAfterMount = spy.mock.calls.length;

        await vi.advanceTimersByTimeAsync(120_000); // > old 45s + 30s intervals

        expect(spy.mock.calls.length).toBe(callsAfterMount);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('refetch only on window focus, and only when stale (Part 2)', () => {
    // Deterministic focus simulation via TanStack's focusManager — no DOM
    // visibilitychange events, no timers. setFocused(false) then setFocused(true)
    // is exactly the signal the built-in refetchOnWindowFocus reacts to.
    it('refetches a STALE query when the window regains focus', async () => {
      const spy = stubFetchResolved(ok(stubTournament));
      const { result } = await renderSettled({ refetchOnWindowFocus: true, staleTime: 0 });
      const callsAfterMount = spy.mock.calls.length;

      focusManager.setFocused(false);
      focusManager.setFocused(true);

      await waitFor(() => expect(spy.mock.calls.length).toBe(callsAfterMount + 1));
    });

    it('does NOT refetch a FRESH query on focus (staleTime guards against storms)', async () => {
      const spy = stubFetchResolved(ok(stubTournament));
      const { result } = await renderSettled({
        refetchOnWindowFocus: true,
        staleTime: 60_000,
      });
      const callsAfterMount = spy.mock.calls.length;

      // Data is still fresh (well within staleTime); a focus toggle must not
      // trigger a refetch — this is what prevents refetch storms on rapid tab
      // switching.
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await Promise.resolve();

      expect(spy.mock.calls.length).toBe(callsAfterMount);
      expect(result.current.error).toBeNull();
    });

    it('issues no fetch while the tab is hidden/unfocused (idle tab is quiet)', async () => {
      const spy = stubFetchResolved(ok(stubTournament));
      await renderSettled({ refetchOnWindowFocus: true, staleTime: 0 });
      const callsAfterMount = spy.mock.calls.length;

      // Losing focus alone must never schedule a fetch; only regaining it can.
      focusManager.setFocused(false);
      await Promise.resolve();

      expect(spy.mock.calls.length).toBe(callsAfterMount);
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
