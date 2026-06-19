import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFifaMatches } from './client';
import { RateLimitError, RepositoryError, ValidationError } from '@/data/errors';
import {
  abortError,
  FIFA_TIMEOUT_BAND,
  httpResponse,
  isFiniteTimeoutMs,
  okCalendarPage,
  spyFetchRejecting,
  spyFetchResolving,
} from './__fixtures__/fetch-mock.support';

/**
 * CR-2 — the FIFA calendar pager (`fetchFifaMatches`) must give every `fetch` a
 * finite request deadline via an `AbortSignal`, and classify an abort/timeout as
 * `RepositoryError('UPSTREAM_TIMEOUT', …, 502)` instead of pinning a hung
 * single-flight promise. It must NOT reclassify any other in-flight failure
 * (non-OK HTTP, 429, schema-invalid) as a timeout. Acceptance #6, #7, #9, #10.
 *
 * DETERMINISM: `globalThis.fetch` is mocked via the shared `fetch-mock.support`
 * helper. Abort is simulated by REJECTING the mock with an `AbortError`-named
 * error — no real timers, no multi-second waits. The happy path returns a
 * schema-valid single-page payload so parsing is exercised end to end.
 */

/** A minimal schema-valid FIFA calendar row (rawMatchSchema requires only these). */
const rawRow = {
  IdMatch: '400251',
  StageName: [{ Locale: 'en-GB', Description: 'Round of 16' }],
  Home: { IdTeam: '1', IdCountry: 'FRA', TeamName: [{ Locale: 'en-GB', Description: 'France' }] },
  Away: { IdTeam: '2', IdCountry: 'BRA', TeamName: [{ Locale: 'en-GB', Description: 'Brazil' }] },
  HomeTeamScore: 2,
  AwayTeamScore: 1,
  Date: '2026-07-04T16:00:00Z',
  MatchStatus: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchFifaMatches — request deadline [CR-2 Acceptance #6]', () => {
  it('passes a live (not pre-aborted) AbortSignal into fetch', async () => {
    const spy = spyFetchResolving(okCalendarPage([rawRow]));
    await fetchFifaMatches();
    expect(spy).toHaveBeenCalledTimes(1);
    const init = spy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init, 'fetch must receive an init object carrying the signal').toBeDefined();
    expect(init!.signal, 'every FIFA fetch must pass an abort signal').toBeInstanceOf(AbortSignal);
    expect(init!.signal!.aborted, 'the deadline must still be live at call time').toBe(false);
  });

  it('produces the signal from AbortSignal.timeout with a finite 8–10s deadline', async () => {
    // Guards against a regression that passes `new AbortController().signal` with
    // NO timer — an AbortSignal that never fires, re-introducing the hang. Assert
    // the time-bounded producer was used with a deadline in the required band.
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    spyFetchResolving(okCalendarPage([rawRow]));
    await fetchFifaMatches();
    expect(timeoutSpy, 'every FIFA fetch must use AbortSignal.timeout').toHaveBeenCalled();
    const deadlines = timeoutSpy.mock.calls.map(([ms]) => ms);
    expect(
      deadlines.every(isFiniteTimeoutMs),
      `every deadline must be finite and within ${FIFA_TIMEOUT_BAND.min}–${FIFA_TIMEOUT_BAND.max}ms`,
    ).toBe(true);
  });
});

describe('fetchFifaMatches — happy path unchanged [CR-2 Acceptance #9]', () => {
  it('parses and returns the calendar rows when fetch resolves OK', async () => {
    spyFetchResolving(okCalendarPage([rawRow]));
    const matches = await fetchFifaMatches();
    expect(matches).toHaveLength(1);
    expect(matches[0]?.IdMatch).toBe('400251');
  });

  it('returns an empty list (no throw) when the calendar page has no results', async () => {
    spyFetchResolving(okCalendarPage([]));
    await expect(fetchFifaMatches()).resolves.toEqual([]);
  });
});

describe('fetchFifaMatches — timeout classification [CR-2 Acceptance #7]', () => {
  it('surfaces an AbortError as RepositoryError(UPSTREAM_TIMEOUT, …, 502)', async () => {
    spyFetchRejecting(abortError('AbortError'));
    const promise = fetchFifaMatches();
    await expect(promise).rejects.toBeInstanceOf(RepositoryError);
    await expect(promise).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT', httpStatus: 502 });
  });

  it('also classifies a TimeoutError (AbortSignal.timeout shape) as UPSTREAM_TIMEOUT/502', async () => {
    spyFetchRejecting(abortError('TimeoutError'));
    await expect(fetchFifaMatches()).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      httpStatus: 502,
    });
  });

  it('does NOT misclassify a generic network error as a timeout (rethrows untouched)', async () => {
    const boom = new Error('ECONNRESET'); // not abort-named → must pass through verbatim
    spyFetchRejecting(boom);
    await expect(fetchFifaMatches()).rejects.toBe(boom);
  });
});

describe('fetchFifaMatches — non-timeout failures pass through unchanged [CR-2 Acceptance #9]', () => {
  it('still throws UPSTREAM_HTTP/502 on a non-OK 500 response', async () => {
    spyFetchResolving(httpResponse(500));
    await expect(fetchFifaMatches()).rejects.toMatchObject({
      code: 'UPSTREAM_HTTP',
      httpStatus: 502,
    });
  });

  it('still throws RateLimitError (RATE_LIMITED/429) on a 429 response', async () => {
    spyFetchResolving(httpResponse(429));
    const promise = fetchFifaMatches();
    await expect(promise).rejects.toBeInstanceOf(RateLimitError);
    await expect(promise).rejects.toMatchObject({ code: 'RATE_LIMITED', httpStatus: 429 });
  });

  it('still throws ValidationError (UPSTREAM_INVALID) on a schema-invalid payload', async () => {
    // The timeout catch must NOT swallow a parse failure into a 502 timeout.
    const malformed = { ok: true, status: 200, json: async () => ({ Results: 'not-an-array' }) };
    spyFetchResolving(malformed as Response);
    const promise = fetchFifaMatches();
    await expect(promise).rejects.toBeInstanceOf(ValidationError);
    await expect(promise).rejects.toMatchObject({ code: 'UPSTREAM_INVALID' });
  });
});
