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

function renderQuery(
  matchId: string | null,
  isLive = false,
): RenderHookResult<MatchDetailQueryResult, unknown> {
  return renderHook(() => useMatchDetailQuery(matchId, isLive), { wrapper: makeWrapper() });
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
});
