// @vitest-environment jsdom
//
// M3: only this file opts into jsdom; the domain/data .test.ts files stay on the
// global `node` environment. The pragma above is per-file and does not affect them.
//
// REWRITTEN for the direct-FIFA frontend: the hook now calls
// `selectRepository().getTournament()` directly (no internal /api/worldcup fetch,
// no ApiEnvelope, no apiUrl/VITE_API_BASE_URL). The repository is mocked so no
// network or live FIFA is reached; TanStack Query owns caching/dedupe/focus.
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, type RenderHookResult } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMockTournament } from '@/data/providers/mock/build-mock-tournament';
import { parseTournament } from '@/data/schema/tournament-schema';
import type { MatchRepository } from '@/data/repository';
import type { Tournament } from '@/domain/types';
import { useTournamentQuery } from './useTournamentQuery';

// The call-site contract RoadmapCanvas destructures. Declared here (not imported)
// so the test binds to the behavioural shape, not an incidental named export.
interface TournamentQueryResult {
  data: Tournament | null;
  loading: boolean;
  error: string | null;
}

const EXPECTED_MATCH_COUNT = 104;
const EXPECTED_GROUP_COUNT = 12;

// A real, schema-valid Tournament so meta.provider and the 104/12 shape are exercised.
const stubTournament: Tournament = parseTournament(buildMockTournament('2026-06-17T00:00:00Z'));

// Mock the repository factory: the hook resolves the active repository and calls
// getTournament(). Each test sets getTournamentMock's behavior; no network.
const getTournamentMock = vi.fn<() => Promise<Tournament>>();
vi.mock('@/data/repository-factory', () => ({
  selectRepository: (): MatchRepository => ({
    name: 'mock',
    getTournament: () => getTournamentMock(),
  }),
}));

interface WrapperOptions {
  /** Window-focus refetch policy under test (mirrors the real queryClient flag). */
  readonly refetchOnWindowFocus?: boolean;
  /** Freshness window; 0 makes a query stale immediately (focus will refetch). */
  readonly staleTime?: number;
}

/**
 * A fresh QueryClient per test → no cross-test cache leakage; retries off so a
 * rejected query surfaces immediately instead of waiting through backoff. The
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

// EXPECTED-WARNING FILTER (Review L1): the focus-refetch cases (staleTime:0 +
// refetchOnWindowFocus) deliberately leave a stale/cancelled query in flight.
// When teardown's `vi.restoreAllMocks()` resets `getTournamentMock`, that
// in-flight refetch resolves with `undefined`, which TanStack logs (async, during
// teardown) as the benign "Query data cannot be undefined" message. It is a side
// effect of the cancel-on-blur path under test, NOT a real undefined return from
// the hook's query function (which resolves `stubTournament`).
//
// Because the warning fires AFTER `vi.restoreAllMocks()` in a microtask, a
// `vi.spyOn` is the wrong tool (it would already be restored). We instead wrap the
// real `console.error` ONCE at module load with a plain filter that drops only
// this exact line and forwards everything else verbatim — vitest's mock
// restoration never touches it, so a genuinely unexpected `console.error` still
// surfaces.
const realConsoleError = console.error.bind(console);
console.error = (...args: unknown[]): void => {
  const first = args[0];
  if (typeof first === 'string' && first.includes('Query data cannot be undefined')) return;
  realConsoleError(...args);
};

beforeEach(() => {
  getTournamentMock.mockReset();
  getTournamentMock.mockResolvedValue(stubTournament);
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
      const { result } = renderQuery();

      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('error');
    });

    it('starts loading with null data before the repository resolves', () => {
      const { result } = renderQuery();

      // Synchronously after mount, before getTournament resolves.
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
    });
  });

  describe('repository success', () => {
    it('calls selectRepository().getTournament() directly (no internal /api fetch)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await renderSettled();

      expect(getTournamentMock).toHaveBeenCalledTimes(1);
      // No internal API hop: the hook must not call window.fetch at all.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('resolves the full Tournament (incl. meta.provider) and clears error', async () => {
      const { result } = await renderSettled();

      expect(result.current.error).toBeNull();
      // Full Tournament returned so the Legend can read meta.provider.
      expect(result.current.data?.meta.provider).toBe('mock');
      expect(result.current.data?.matches).toHaveLength(EXPECTED_MATCH_COUNT);
      expect(result.current.data?.groups).toHaveLength(EXPECTED_GROUP_COUNT);
    });

    it('loads the tournament on mount (refresh = mount + focus-when-stale + reconnect)', async () => {
      const { result } = renderQuery();

      await waitFor(() => expect(result.current.data).not.toBeNull());
      expect(result.current.loading).toBe(false);
    });
  });

  describe('no interval polling', () => {
    it('does NOT re-fetch on its own after the initial mount load (no refetchInterval)', async () => {
      // Drive virtual time well past the old 45s interval. With refetchInterval
      // removed, the repository must be called exactly once (the mount load) — no
      // polling tick schedules a second request.
      vi.useFakeTimers();
      try {
        const { result } = renderQuery();

        await vi.waitFor(() => expect(result.current.data).not.toBeNull());
        const callsAfterMount = getTournamentMock.mock.calls.length;

        await vi.advanceTimersByTimeAsync(120_000); // > old 45s + 30s intervals

        expect(getTournamentMock.mock.calls.length).toBe(callsAfterMount);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('refetch only on window focus, and only when stale', () => {
    // Deterministic focus simulation via TanStack's focusManager — no DOM
    // visibilitychange events, no timers. setFocused(false) then setFocused(true)
    // is exactly the signal the built-in refetchOnWindowFocus reacts to.
    it('refetches a STALE query when the window regains focus', async () => {
      await renderSettled({ refetchOnWindowFocus: true, staleTime: 0 });
      const callsAfterMount = getTournamentMock.mock.calls.length;

      focusManager.setFocused(false);
      focusManager.setFocused(true);

      await waitFor(() => expect(getTournamentMock.mock.calls.length).toBe(callsAfterMount + 1));
    });

    it('does NOT refetch a FRESH query on focus (staleTime guards against storms)', async () => {
      const { result } = await renderSettled({
        refetchOnWindowFocus: true,
        staleTime: 60_000,
      });
      const callsAfterMount = getTournamentMock.mock.calls.length;

      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await Promise.resolve();

      expect(getTournamentMock.mock.calls.length).toBe(callsAfterMount);
      expect(result.current.error).toBeNull();
    });

    it('issues no fetch while the tab is hidden/unfocused (idle tab is quiet)', async () => {
      await renderSettled({ refetchOnWindowFocus: true, staleTime: 0 });
      const callsAfterMount = getTournamentMock.mock.calls.length;

      // Losing focus alone must never schedule a fetch; only regaining it can.
      // (The benign "Query data cannot be undefined" TanStack log this path emits
      // during teardown is filtered at the module-level console.error wrapper above.)
      focusManager.setFocused(false);
      await Promise.resolve();

      expect(getTournamentMock.mock.calls.length).toBe(callsAfterMount);
    });
  });

  describe('failure handling', () => {
    it('surfaces a thrown repository error as a non-null error string and keeps data null', async () => {
      getTournamentMock.mockRejectedValue(new Error('Upstream rate limit reached'));

      const { result } = await renderSettled();

      expect(result.current.error).toBe('Upstream rate limit reached');
      expect(result.current.data).toBeNull();
    });
  });
});
