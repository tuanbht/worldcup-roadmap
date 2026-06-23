import { vi, type MockInstance } from 'vitest';

/**
 * Shared deterministic `fetch` mock support for the FIFA client suites (CR-2).
 *
 * SINGLE SOURCE of the abort-style error shape + `Response` stubs + the
 * `globalThis.fetch` spy so `client.test.ts` and `match-detail-client.test.ts`
 * never copy-paste these builders. Everything is synchronous/in-memory: abort is
 * simulated by REJECTING the mock with an `AbortError`/`TimeoutError`-named error
 * (the exact shape `AbortSignal.timeout` surfaces on the Node/undici runtime), so
 * the suites need no real timers and no multi-second waits.
 */

/** The two error names `AbortSignal.timeout` / an aborted controller can surface. */
export type AbortName = 'AbortError' | 'TimeoutError';

/**
 * An abort-style rejection identical in shape to what `AbortSignal.timeout(ms)`
 * throws once the deadline elapses (undici rejects the `fetch` with a
 * `DOMException`/`Error` whose `.name` is `TimeoutError`; a manually aborted
 * controller surfaces `AbortError`). The production classifier keys off `.name`
 * alone, so a plain named `Error` is a faithful, runtime-independent stand-in.
 */
export function abortError(name: AbortName = 'AbortError'): Error {
  const err = new Error('The operation was aborted');
  err.name = name;
  return err;
}

/** A calendar-pager `Response`: one OK page, no continuation → the pager stops. */
export function okCalendarPage(results: readonly unknown[]): Response {
  return calendarPage(results, null);
}

/**
 * A calendar `Response` carrying an explicit `ContinuationToken`. A non-null
 * token tells the pager to fetch the NEXT page; `null` (the `okCalendarPage`
 * default) stops it. Lets a suite assert ContinuationToken pagination without
 * copy-pasting the `{ Results, ContinuationToken }` envelope per page.
 */
export function calendarPage(results: readonly unknown[], token: string | null): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ Results: results, ContinuationToken: token }),
  } as Response;
}

/**
 * Spy on the global `fetch` and resolve each successive call with the NEXT
 * `Response` in `pages` (page 0, page 1, …). Used to drive multi-page
 * ContinuationToken pagination deterministically: no real network, the page
 * boundary is whatever each stubbed page's token says.
 */
export function spyFetchSequence(pages: readonly Response[]): MockInstance {
  const spy = vi.spyOn(globalThis, 'fetch');
  pages.forEach((page) => spy.mockResolvedValueOnce(page));
  return spy;
}

/** A non-OK calendar `Response` with the given HTTP status (5xx / 429 paths). */
export function httpResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  } as Response;
}

/**
 * An OK (`200`) calendar `Response` whose `.json()` REJECTS with an abort-named
 * error — the shape undici surfaces when `AbortSignal.timeout` fires DURING
 * response-body streaming (AF-1). HTTP status passes the `res.ok`/`429` gates,
 * so the rejection is raised from the `await res.json()` parse block, exercising
 * the second try/catch rather than the fetch() catch.
 */
export function bodyAbortingPage(name: AbortName = 'TimeoutError'): Response {
  return {
    ok: true,
    status: 200,
    json: async (): Promise<unknown> => {
      throw abortError(name);
    },
  } as Response;
}

/** A detail-section `Response` (the detail client reads `.text()`, not `.json()`). */
export function okSection(body: Record<string, unknown> = {}): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  } as Response;
}

/** A malformed detail-section body: valid HTTP, but `.text()` is not JSON. */
export function malformedSection(raw = '<<<not json>>>'): Response {
  return {
    ok: true,
    status: 200,
    text: async () => raw,
  } as Response;
}

/** Spy on the global `fetch` and resolve every call with the same `Response`. */
export function spyFetchResolving(response: Response): MockInstance {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
}

/** Spy on the global `fetch` and reject every call with the same error. */
export function spyFetchRejecting(error: unknown): MockInstance {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);
}

/**
 * Route the mocked `fetch` by URL so the two detail sections resolve/reject
 * independently. Unknown URLs reject (never throw synchronously) so a routing
 * miss surfaces as a readable rejected promise inside the async contract.
 */
export function routeFetch(handlers: {
  live: () => Promise<Response>;
  timeline: () => Promise<Response>;
}): MockInstance {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/live/football/')) return handlers.live();
    if (url.includes('/timelines/')) return handlers.timeline();
    return Promise.reject(new Error(`unexpected detail URL: ${url}`));
  });
}

/** True when a `fetch` mock call passed a live (not pre-aborted) `AbortSignal`. */
export function callHasLiveSignal(call: readonly unknown[] | undefined): boolean {
  const init = call?.[1] as RequestInit | undefined;
  return init?.signal instanceof AbortSignal && init.signal.aborted === false;
}

/**
 * The 8–10s band a FIFA fetch deadline must fall in (mirrors the requirement's
 * "shared ~8-10s deadline"). Asserted against `AbortSignal.timeout`'s recorded
 * argument so the suites prove a FINITE, time-bounded signal without importing
 * the production `FIFA_FETCH_TIMEOUT_MS` constant (which does not exist until the
 * implementer adds it — keeping these RED tests typecheck-clean meanwhile).
 */
export const FIFA_TIMEOUT_BAND = { min: 8_000, max: 10_000 } as const;

/** True when `ms` is a finite deadline inside the required 8–10s band. */
export function isFiniteTimeoutMs(ms: unknown): boolean {
  return (
    typeof ms === 'number' &&
    Number.isFinite(ms) &&
    ms >= FIFA_TIMEOUT_BAND.min &&
    ms <= FIFA_TIMEOUT_BAND.max
  );
}
