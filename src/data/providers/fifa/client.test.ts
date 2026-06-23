import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFifaMatches } from './client';
import { RateLimitError, RepositoryError, ValidationError } from '@/data/errors';
import {
  abortError,
  bodyAbortingPage,
  calendarPage,
  FIFA_TIMEOUT_BAND,
  httpResponse,
  isFiniteTimeoutMs,
  okCalendarPage,
  spyFetchRejecting,
  spyFetchResolving,
  spyFetchSequence,
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
function rawRowWithId(idMatch: string) {
  return {
    IdMatch: idMatch,
    StageName: [{ Locale: 'en-GB', Description: 'Round of 16' }],
    Home: { IdTeam: '1', IdCountry: 'FRA', TeamName: [{ Locale: 'en-GB', Description: 'France' }] },
    Away: { IdTeam: '2', IdCountry: 'BRA', TeamName: [{ Locale: 'en-GB', Description: 'Brazil' }] },
    HomeTeamScore: 2,
    AwayTeamScore: 1,
    Date: '2026-07-04T16:00:00Z',
    MatchStatus: 0,
  };
}

const rawRow = rawRowWithId('400251');

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

// --- AF-1: a timeout that fires DURING response-body streaming -------------
//
// fetchCalendarPage splits the abort-guarded fetch() and `await res.json()` into
// TWO try/catch blocks. If AbortSignal.timeout fires while the body is still
// streaming, undici throws an abort-named error from INSIDE res.json(). The
// SECOND catch currently maps EVERY throw to ValidationError/UPSTREAM_INVALID,
// so a body-streaming timeout is mislabeled as a schema failure (502 vs 502 but
// the WRONG code, and the wrong semantic — a parse problem, not a deadline).
//
// FIX (RED until done): re-check isAbortError(error) in the second catch and
// throw UpstreamTimeoutError there too. These tests resolve fetch() OK (so the
// res.ok / 429 gates pass), then reject res.json() with an abort-named error.
// The pre-existing schema-invalid case (a NON-abort SyntaxError-shaped failure)
// must STILL surface UPSTREAM_INVALID — proving the new branch intercepts ONLY
// abort-named errors, never genuine parse failures.
describe('fetchFifaMatches — timeout DURING body streaming [AF-1]', () => {
  it('classifies a TimeoutError thrown from res.json() as UPSTREAM_TIMEOUT/502', async () => {
    // fetch() resolves OK; the deadline elapses mid-stream so `await res.json()`
    // rejects with a TimeoutError — must be a 502 UPSTREAM_TIMEOUT, not a parse
    // failure.
    spyFetchResolving(bodyAbortingPage('TimeoutError'));
    const promise = fetchFifaMatches();
    await expect(promise).rejects.toBeInstanceOf(RepositoryError);
    await expect(promise).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT', httpStatus: 502 });
  });

  it('also classifies an AbortError thrown from res.json() as UPSTREAM_TIMEOUT/502', async () => {
    spyFetchResolving(bodyAbortingPage('AbortError'));
    await expect(fetchFifaMatches()).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      httpStatus: 502,
    });
  });

  it('still maps a genuine (non-abort) json() parse failure to UPSTREAM_INVALID', async () => {
    // A SyntaxError from res.json() (malformed body, NOT abort-named) must remain
    // a ValidationError — the AF-1 branch must not swallow real parse failures
    // into a 502 timeout.
    const parseBoom = { ok: true, status: 200, json: async () => JSON.parse('<<<not json>>>') };
    spyFetchResolving(parseBoom as Response);
    const promise = fetchFifaMatches();
    await expect(promise).rejects.toBeInstanceOf(ValidationError);
    await expect(promise).rejects.toMatchObject({ code: 'UPSTREAM_INVALID' });
  });
});

describe('fetchFifaMatches — plain browser fetch, no spoofed headers [direct-FIFA]', () => {
  // The client now runs in the browser: spoofed User-Agent / Accept-Language are
  // forbidden and removed. The request must carry NO custom headers, and must NOT
  // set `cache: 'no-store'` (so the browser honors FIFA's own Cache-Control — the
  // requirement's third "no shared cache" mitigation leg).
  it('sends NO custom request headers (no User-Agent / Accept-Language / Accept override)', async () => {
    const spy = spyFetchResolving(okCalendarPage([rawRow]));
    await fetchFifaMatches();
    const init = spy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    if (headers) {
      expect(headers['User-Agent']).toBeUndefined();
      expect(headers['Accept-Language']).toBeUndefined();
      expect(headers['Accept']).toBeUndefined();
      expect(Object.keys(headers)).toHaveLength(0);
    } else {
      expect(headers).toBeUndefined();
    }
  });

  it('leaves cache unset (no "no-store") so the browser honors FIFA Cache-Control', async () => {
    // Stronger than `not.toBe('no-store')`: the plan drops the cache directive
    // entirely (Review M-2). Asserting `undefined` fails both the old `'no-store'`
    // value AND any incidental replacement like `'reload'`/`'no-cache'`.
    const spy = spyFetchResolving(okCalendarPage([rawRow]));
    await fetchFifaMatches();
    const init = spy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.cache).toBeUndefined();
  });
});

describe('fetchFifaMatches — ContinuationToken pagination [direct-FIFA]', () => {
  // The pager must follow FIFA's ContinuationToken across pages and concatenate
  // every page's rows. Driven deterministically by a fixed response sequence —
  // page 0 carries a token, page 1 carries null → the loop stops after page 1.
  it('follows the ContinuationToken to a second page and concatenates both pages', async () => {
    const spy = spyFetchSequence([
      calendarPage([rawRowWithId('page0')], 'TOKEN-1'),
      calendarPage([rawRowWithId('page1')], null),
    ]);

    const matches = await fetchFifaMatches();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(matches.map((m) => m.IdMatch)).toEqual(['page0', 'page1']);
  });

  it('forwards the prior page token as ?continuationToken= on the next request', async () => {
    const spy = spyFetchSequence([
      calendarPage([rawRowWithId('page0')], 'TOKEN-1'),
      calendarPage([rawRowWithId('page1')], null),
    ]);

    await fetchFifaMatches();

    // First page must NOT carry a token; the second must carry the token page 0 returned.
    expect(String(spy.mock.calls[0]?.[0])).not.toContain('continuationToken=');
    expect(String(spy.mock.calls[1]?.[0])).toContain('continuationToken=TOKEN-1');
  });

  it('stops paging on the first page that returns a null ContinuationToken', async () => {
    // A single page with no token must produce exactly one request — no spurious
    // follow-up fetch when the upstream signals the end of the calendar.
    const spy = spyFetchSequence([calendarPage([rawRow], null)]);

    await fetchFifaMatches();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('fetchFifaMatches — country query param [L2/L-B]', () => {
  /** The first calendar-page URL the pager hit, as a string. */
  const firstUrl = (spy: ReturnType<typeof spyFetchResolving>): string =>
    String(spy.mock.calls[0]?.[0]);

  it('emits ?country=US by default (config country defaults to US)', async () => {
    const spy = spyFetchResolving(okCalendarPage([rawRow]));
    await fetchFifaMatches();
    expect(firstUrl(spy)).toContain('country=US');
  });

  it('still sends the competition + season ids on the calendar request', async () => {
    const spy = spyFetchResolving(okCalendarPage([rawRow]));
    await fetchFifaMatches();
    const url = firstUrl(spy);
    expect(url).toContain('idCompetition=17');
    expect(url).toContain('idSeason=285023');
  });

  it('omits ?country= entirely when the config country is explicitly empty', async () => {
    // L-B: an explicit empty country is the ONLY way to drop the param. Mock the
    // browser config module with country:'' and load a fresh client copy so the
    // `if (country)` guard is exercised deterministically (no import.meta.env
    // dependency).
    vi.resetModules();
    vi.doMock('@/data/config/fifa-config', () => ({
      fifaConfig: {
        provider: 'mock',
        baseUrl: 'https://api.fifa.com/api/v3',
        competitionId: '17',
        seasonId: '285023',
        country: '',
      },
    }));
    const spy = spyFetchResolving(okCalendarPage([rawRow]));
    const { fetchFifaMatches: freshFetch } = await import('./client');
    await freshFetch();
    expect(String(spy.mock.calls[0]?.[0])).not.toContain('country=');
    vi.doUnmock('@/data/config/fifa-config');
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
