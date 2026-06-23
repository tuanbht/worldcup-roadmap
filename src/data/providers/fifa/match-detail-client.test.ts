import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFifaMatchDetail } from './match-detail-client';
import type { ProviderRef } from '@/domain/types';
import {
  abortError,
  callHasLiveSignal,
  FIFA_TIMEOUT_BAND,
  isFiniteTimeoutMs,
  malformedSection,
  okSection,
  routeFetch,
} from './__fixtures__/fetch-mock.support';

/**
 * CR-2 — the per-match detail client fetches `/live/football/...` and
 * `/timelines/...` in parallel. Each `fetch` must carry a finite request
 * deadline (an `AbortSignal`), and a timed-out/aborted section must degrade to
 * `null` through the existing `try/catch` so the detail route still responds
 * with whatever section(s) succeeded — it must NEVER throw. Acceptance #6, #8, #10.
 *
 * DETERMINISM: `globalThis.fetch` is mocked via the shared `fetch-mock.support`
 * helper and routed by URL (`/live/football/` vs `/timelines/`) so one section
 * can abort while the other resolves OK. Abort is simulated by REJECTING the
 * mock with an `AbortError`-named error — no real timers, no multi-second waits.
 */

const REF: ProviderRef = {
  idCompetition: '17',
  idSeason: '285023',
  idStage: 'st-r16',
  idMatch: '400251',
};

/** Both happy sections, keyed to REF so each maps to a non-null payload on OK. */
const bothOk = () => ({
  live: () => Promise.resolve(okSection({ IdMatch: REF.idMatch })),
  timeline: () => Promise.resolve(okSection({ IdMatch: REF.idMatch, Event: [] })),
});

/** The URL each section call hit, in spy-call order. */
const calledUrls = (spy: ReturnType<typeof routeFetch>): string[] =>
  spy.mock.calls.map((c) => String(c[0]));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchFifaMatchDetail — request deadline on both sections [CR-2 Acceptance #6]', () => {
  it('hits BOTH the live and timelines endpoints exactly once', async () => {
    const spy = routeFetch(bothOk());
    await fetchFifaMatchDetail(REF);
    expect(spy).toHaveBeenCalledTimes(2);
    const urls = calledUrls(spy);
    expect(urls.some((u) => u.includes('/live/football/'))).toBe(true);
    expect(urls.some((u) => u.includes('/timelines/'))).toBe(true);
  });

  it('passes a live (not pre-aborted) AbortSignal into EACH section fetch', async () => {
    const spy = routeFetch(bothOk());
    await fetchFifaMatchDetail(REF);
    expect(spy).toHaveBeenCalledTimes(2);
    for (const call of spy.mock.calls) {
      expect(callHasLiveSignal(call), 'every detail fetch must pass a live abort signal').toBe(
        true,
      );
    }
  });

  it('produces each section signal from AbortSignal.timeout with a finite 8–10s deadline', async () => {
    // A timer-less `AbortController().signal` would satisfy the instanceof check
    // yet never fire — re-introducing the per-key hang. Pin the time-bounded
    // source and require every deadline to fall in the required band.
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    routeFetch(bothOk());
    await fetchFifaMatchDetail(REF);
    expect(timeoutSpy, 'both sections must use AbortSignal.timeout').toHaveBeenCalledTimes(2);
    const deadlines = timeoutSpy.mock.calls.map(([ms]) => ms);
    expect(
      deadlines.every(isFiniteTimeoutMs),
      `every deadline must be finite and within ${FIFA_TIMEOUT_BAND.min}–${FIFA_TIMEOUT_BAND.max}ms`,
    ).toBe(true);
  });
});

describe('fetchFifaMatchDetail — plain browser fetch, no spoofed headers [direct-FIFA]', () => {
  // Browser context: no spoofed User-Agent / Accept-Language, and no
  // `cache: 'no-store'` (the browser honors FIFA Cache-Control). Both sections
  // must be plain fetches carrying only the abort signal.
  it('sends NO custom request headers on EITHER section fetch', async () => {
    const spy = routeFetch(bothOk());
    await fetchFifaMatchDetail(REF);
    for (const call of spy.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers) {
        expect(headers['User-Agent']).toBeUndefined();
        expect(headers['Accept-Language']).toBeUndefined();
        expect(Object.keys(headers)).toHaveLength(0);
      } else {
        expect(headers).toBeUndefined();
      }
    }
  });

  it('leaves cache unset on EITHER section fetch (browser honors FIFA Cache-Control)', async () => {
    // Stronger than `not.toBe('no-store')`: the plan drops the directive entirely
    // (Review M-2), so each section fetch must pass no `cache` value at all.
    const spy = routeFetch(bothOk());
    await fetchFifaMatchDetail(REF);
    for (const call of spy.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect(init?.cache).toBeUndefined();
    }
  });
});

describe('fetchFifaMatchDetail — graceful degradation on timeout [CR-2 Acceptance #8]', () => {
  it('degrades the aborted section to null and keeps the surviving section populated', async () => {
    routeFetch({
      live: () => Promise.reject(abortError('AbortError')), // live section times out
      timeline: () => Promise.resolve(okSection({ IdMatch: REF.idMatch, Event: [] })),
    });
    const detail = await fetchFifaMatchDetail(REF); // must resolve, never reject
    expect(detail.live).toBeNull(); // aborted → graceful null
    expect(detail.timeline).not.toBeNull(); // the other section survived
  });

  it('degrades when the timelines section is the one that aborts (symmetry)', async () => {
    routeFetch({
      live: () => Promise.resolve(okSection({ IdMatch: REF.idMatch })),
      timeline: () => Promise.reject(abortError('TimeoutError')),
    });
    const detail = await fetchFifaMatchDetail(REF);
    expect(detail.live).not.toBeNull();
    expect(detail.timeline).toBeNull();
  });

  it('resolves { live: null, timeline: null } when BOTH sections abort (never throws)', async () => {
    routeFetch({
      live: () => Promise.reject(abortError('TimeoutError')),
      timeline: () => Promise.reject(abortError('AbortError')),
    });
    await expect(fetchFifaMatchDetail(REF)).resolves.toEqual({ live: null, timeline: null });
  });

  it('also degrades a section whose body is non-JSON (parse failure → null)', async () => {
    // Regression: the existing try/catch → null path must still swallow a malformed
    // body, and adding the signal must not turn that graceful null into a throw.
    routeFetch({
      live: () => Promise.resolve(malformedSection()),
      timeline: () => Promise.resolve(okSection({ IdMatch: REF.idMatch, Event: [] })),
    });
    const detail = await fetchFifaMatchDetail(REF);
    expect(detail.live).toBeNull();
    expect(detail.timeline).not.toBeNull();
  });

  it('returns both sections populated on the happy path (no behavioral drift)', async () => {
    routeFetch(bothOk());
    const detail = await fetchFifaMatchDetail(REF);
    expect(detail.live).not.toBeNull();
    expect(detail.timeline).not.toBeNull();
  });
});
