// @vitest-environment jsdom
//
// jsdom-only (per-file pragma), matching useTournamentQuery.test.tsx.
//
// REWRITTEN for the direct-FIFA frontend: the hook takes the resolved `Match`
// (carrying providerRef) and calls the client-side `loadMatchDetail(match,
// { signal })` loader — no internal /api fetch, no ApiEnvelope, no
// DETAIL_UNAVAILABLE code, no apiUrl. The loader is mocked so no network or live
// FIFA is reached; it returns the `DetailOutcome` union the hook maps to
// `{ detail, status, error }`. A thrown loader error → status:'error'.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, type RenderHookResult } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitError } from '@/data/errors';
import { EMPTY_MATCH_DETAIL, teamRef } from '@/domain/types';
import type { Match, ProviderRef } from '@/domain/types';
import { useMatchDetailQuery, type MatchDetailQueryResult } from './useMatchDetailQuery';

// Mock the client-side loader the hook delegates to. Each test sets its outcome.
const loadMatchDetailMock = vi.fn();
vi.mock('@/data/providers/fifa/match-detail-loader', () => ({
  loadMatchDetail: (...args: unknown[]) => loadMatchDetailMock(...args),
}));

const FIFA_REF: ProviderRef = {
  idCompetition: '17',
  idSeason: '285023',
  idStage: 'st-r16',
  idMatch: '400251',
};

function makeMatch(id: string, providerRef: ProviderRef | null): Match {
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
    status: 'finished',
    minute: null,
    venue: { name: null, city: null },
  };
}

const FIFA_MATCH = makeMatch('wc2026-fifa-400251', FIFA_REF);
const MOCK_MATCH = makeMatch('wc2026-mock-1', null);

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

interface QueryProps {
  match: Match | null;
}

function renderQuery(match: Match | null): RenderHookResult<MatchDetailQueryResult, QueryProps> {
  return renderHook(({ match: m }) => useMatchDetailQuery(m), {
    wrapper: makeWrapper(),
    initialProps: { match },
  });
}

/** Render and wait until the detail query reaches a terminal `ready` status. */
async function renderReady(
  match: Match,
): Promise<RenderHookResult<MatchDetailQueryResult, QueryProps>> {
  const view = renderQuery(match);
  await waitFor(() => expect(view.result.current.status).toBe('ready'));
  return view;
}

beforeEach(() => {
  loadMatchDetailMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('useMatchDetailQuery', () => {
  it('exposes the { detail, status, error } contract', () => {
    loadMatchDetailMock.mockResolvedValue({
      kind: 'ready',
      detail: EMPTY_MATCH_DETAIL(FIFA_REF.idMatch),
    });
    const { result } = renderQuery(FIFA_MATCH);
    expect(result.current).toHaveProperty('detail');
    expect(result.current).toHaveProperty('status');
    expect(result.current).toHaveProperty('error');
  });

  it('is disabled (no loader call) when match is null', () => {
    loadMatchDetailMock.mockResolvedValue({
      kind: 'ready',
      detail: EMPTY_MATCH_DETAIL(FIFA_REF.idMatch),
    });
    const { result } = renderQuery(null);
    expect(loadMatchDetailMock).not.toHaveBeenCalled();
    expect(result.current.detail).toBeNull();
  });

  it('calls loadMatchDetail with the resolved Match (carrying its providerRef)', async () => {
    loadMatchDetailMock.mockResolvedValue({
      kind: 'ready',
      detail: EMPTY_MATCH_DETAIL(FIFA_REF.idMatch),
    });
    await renderReady(FIFA_MATCH);
    expect(loadMatchDetailMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: FIFA_MATCH.id, providerRef: FIFA_REF }),
      expect.anything(),
    );
  });

  it('resolves to status "ready" with the detail when the loader returns kind:ready', async () => {
    loadMatchDetailMock.mockResolvedValue({
      kind: 'ready',
      detail: EMPTY_MATCH_DETAIL(FIFA_REF.idMatch),
    });
    const { result } = await renderReady(FIFA_MATCH);
    expect(result.current.detail?.matchId).toBe(FIFA_REF.idMatch);
    expect(result.current.error).toBeNull();
  });

  it('maps a kind:unavailable loader outcome to status "unavailable" (not an error)', async () => {
    // Null providerRef → the loader resolves "unavailable"; the hook surfaces it
    // as a distinct status, never an error.
    loadMatchDetailMock.mockResolvedValue({ kind: 'unavailable' });
    const { result } = renderQuery(MOCK_MATCH);
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.error).toBeNull();
    expect(result.current.detail).toBeNull();
  });

  it('maps a thrown loader error to status "error" with a non-null message', async () => {
    loadMatchDetailMock.mockRejectedValue(new RateLimitError('Upstream rate limit reached'));
    const { result } = renderQuery(FIFA_MATCH);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toContain('rate limit');
    expect(result.current.detail).toBeNull();
  });

  describe('no interval polling', () => {
    it('does not re-fetch on a timer after the mount load (no refetchInterval)', async () => {
      vi.useFakeTimers();
      try {
        loadMatchDetailMock.mockResolvedValue({
          kind: 'ready',
          detail: EMPTY_MATCH_DETAIL(FIFA_REF.idMatch),
        });
        const { result } = renderQuery(FIFA_MATCH);

        await vi.waitFor(() => expect(result.current.status).toBe('ready'));
        const callsAfterMount = loadMatchDetailMock.mock.calls.length;

        // Past the old 30s detail interval; no second request must be scheduled.
        await vi.advanceTimersByTimeAsync(120_000);

        expect(loadMatchDetailMock.mock.calls.length).toBe(callsAfterMount);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('AbortSignal forwarding', () => {
    it('forwards the TanStack-provided AbortSignal into the loader call', async () => {
      loadMatchDetailMock.mockResolvedValue({
        kind: 'ready',
        detail: EMPTY_MATCH_DETAIL(FIFA_REF.idMatch),
      });
      await renderReady(FIFA_MATCH);

      expect(loadMatchDetailMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: FIFA_MATCH.id }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('aborts the in-flight loader call when the query key changes (different match)', async () => {
      // Capture the signal the loader received for the first match; selecting a
      // different match changes the query key and must abort the prior request.
      let firstSignal: AbortSignal | undefined;
      loadMatchDetailMock.mockImplementation(
        (_match: Match, options?: { signal?: AbortSignal }) => {
          if (firstSignal === undefined) firstSignal = options?.signal;
          return new Promise(() => {}); // never resolves → stays in-flight
        },
      );

      const { rerender } = renderQuery(FIFA_MATCH);
      await waitFor(() => expect(loadMatchDetailMock).toHaveBeenCalled());

      expect(firstSignal).toBeInstanceOf(AbortSignal);
      expect(firstSignal?.aborted).toBe(false);

      rerender({ match: makeMatch('wc2026-fifa-400777', FIFA_REF) });

      await waitFor(() => expect(firstSignal?.aborted).toBe(true));
    });
  });
});
