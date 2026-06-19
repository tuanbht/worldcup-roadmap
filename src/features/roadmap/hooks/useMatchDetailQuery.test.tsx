// @vitest-environment jsdom
//
// jsdom-only (per-file pragma), matching useTournamentQuery.test.tsx. Stubs
// global.fetch; never touches the network or live FIFA.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, type RenderHookResult } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, fail } from '@/data/envelope';
import { DETAIL_UNAVAILABLE } from '@/data/detail-codes';
import { EMPTY_MATCH_DETAIL } from '@/domain/types';
import { useMatchDetailQuery, type MatchDetailQueryResult } from './useMatchDetailQuery';

const MATCH_ID = 'wc2026-fifa-400251';
const ENDPOINT = `/api/worldcup/match/${MATCH_ID}/detail`;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function stubFetchResolved(envelope: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => envelope,
  } as Response);
}

/** A non-OK HTTP response whose body is not JSON (the route 500 path). */
function stubFetchHttpError(status = 500) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token I in JSON');
    },
  } as unknown as Response);
}

/**
 * Stub `fetch` with a request that NEVER resolves, capturing the per-call
 * AbortSignal so a test can keep the request "in flight" and later assert the
 * signal aborts on unmount / key-change. Returns both the spy and a getter for
 * the most-recently-captured signal.
 */
function stubFetchInFlight() {
  let capturedSignal: AbortSignal | undefined;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
    capturedSignal = (init as RequestInit | undefined)?.signal ?? undefined;
    return new Promise<Response>(() => {});
  });
  return { spy, lastSignal: (): AbortSignal | undefined => capturedSignal };
}

interface QueryProps {
  id: string | null;
}

function renderQuery(
  matchId: string | null,
  isLive = false,
): RenderHookResult<MatchDetailQueryResult, QueryProps> {
  return renderHook(({ id }) => useMatchDetailQuery(id, isLive), {
    wrapper: makeWrapper(),
    initialProps: { id: matchId },
  });
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('useMatchDetailQuery', () => {
  it('exposes the { detail, status, error } contract', () => {
    stubFetchResolved(ok(EMPTY_MATCH_DETAIL(MATCH_ID)));
    const { result } = renderQuery(MATCH_ID);
    expect(result.current).toHaveProperty('detail');
    expect(result.current).toHaveProperty('status');
    expect(result.current).toHaveProperty('error');
  });

  it('is disabled (no fetch, no loading) when matchId is null', () => {
    const spy = stubFetchResolved(ok(EMPTY_MATCH_DETAIL(MATCH_ID)));
    const { result } = renderQuery(null);
    expect(spy).not.toHaveBeenCalled();
    expect(result.current.detail).toBeNull();
  });

  it('lazily fetches the per-match detail endpoint when a match is selected', async () => {
    const spy = stubFetchResolved(ok(EMPTY_MATCH_DETAIL(MATCH_ID)));
    const { result } = renderQuery(MATCH_ID);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(spy).toHaveBeenCalledWith(ENDPOINT, expect.anything());
  });

  it('resolves to status "ready" with the detail on a success envelope', async () => {
    stubFetchResolved(ok(EMPTY_MATCH_DETAIL(MATCH_ID)));
    const { result } = renderQuery(MATCH_ID);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.detail?.matchId).toBe(MATCH_ID);
    expect(result.current.error).toBeNull();
  });

  it('maps a DETAIL_UNAVAILABLE fail envelope to status "unavailable" (not an error)', async () => {
    stubFetchResolved(fail(DETAIL_UNAVAILABLE, 'Detail not available for this match.'));
    const { result } = renderQuery(MATCH_ID);
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.error).toBeNull();
  });

  it('maps a genuine upstream fail envelope to status "error"', async () => {
    stubFetchResolved(fail('RATE_LIMITED', 'Upstream rate limit reached'));
    const { result } = renderQuery(MATCH_ID);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toContain('rate limit');
  });

  it('maps a non-OK HTTP response (non-JSON body) to status "error", not a crash', async () => {
    stubFetchHttpError(500);
    const { result } = renderQuery(MATCH_ID);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.detail).toBeNull();
    expect(result.current.error).not.toBeNull();
  });

  it('still resolves to "ready" when the match is live (isLive flag does not block the fetch)', async () => {
    const spy = stubFetchResolved(ok(EMPTY_MATCH_DETAIL(MATCH_ID)));
    const { result } = renderQuery(MATCH_ID, true);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(spy).toHaveBeenCalledWith(ENDPOINT, expect.anything());
    expect(result.current.detail?.matchId).toBe(MATCH_ID);
  });

  // CR-13 #9/#10: TanStack Query creates an AbortController per query and aborts
  // it on unmount / key-change. The queryFn must thread its context `signal` into
  // fetch so the in-flight detail request is actually cancellable.
  describe('CR-13: AbortSignal forwarding + cancellation', () => {
    it('forwards the TanStack-provided AbortSignal into the fetch call (#9/#10)', async () => {
      const spy = stubFetchResolved(ok(EMPTY_MATCH_DETAIL(MATCH_ID)));
      const { result } = renderQuery(MATCH_ID);
      await waitFor(() => expect(result.current.status).toBe('ready'));

      expect(spy).toHaveBeenCalledWith(
        ENDPOINT,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('keeps the existing fetch options (cache: no-store) alongside the new signal', async () => {
      const spy = stubFetchResolved(ok(EMPTY_MATCH_DETAIL(MATCH_ID)));
      const { result } = renderQuery(MATCH_ID);
      await waitFor(() => expect(result.current.status).toBe('ready'));

      // Forwarding the signal must NOT drop the no-store cache directive that
      // keeps live detail fresh — both belong in the same options object.
      expect(spy).toHaveBeenCalledWith(
        ENDPOINT,
        expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
      );
    });

    it('aborts the in-flight detail request when the query unmounts (#9)', async () => {
      const { spy, lastSignal } = stubFetchInFlight();
      const { unmount } = renderQuery(MATCH_ID);
      await waitFor(() => expect(spy).toHaveBeenCalled());

      expect(lastSignal()).toBeInstanceOf(AbortSignal);
      expect(lastSignal()?.aborted).toBe(false);

      unmount();

      await waitFor(() => expect(lastSignal()?.aborted).toBe(true));
    });

    it('aborts the in-flight detail request when the query key changes (#9)', async () => {
      const { spy, lastSignal } = stubFetchInFlight();
      const { rerender } = renderQuery(MATCH_ID);
      await waitFor(() => expect(spy).toHaveBeenCalled());

      const firstSignal = lastSignal();
      expect(firstSignal).toBeInstanceOf(AbortSignal);
      expect(firstSignal?.aborted).toBe(false);

      // Selecting a different match changes the query key; the prior in-flight
      // request must be aborted rather than left dangling.
      rerender({ id: 'wc2026-fifa-400252' });

      await waitFor(() => expect(firstSignal?.aborted).toBe(true));
    });
  });
});
