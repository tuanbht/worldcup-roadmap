// Node environment (global vitest default). Pure-unit tests for the 429-aware
// retry predicate + jittered exponential backoff (requirement 1044, §3).
//
// The browser is now the rate-limited FIFA client, so the retry policy must:
//   - NEVER retry a 429 (`RateLimitError`) — that would build a retry storm
//     against an already-throttling upstream.
//   - NEVER retry a client error (4xx `RepositoryError`) — it won't succeed.
//   - Retry transient/5xx/network errors, but BOUNDED at MAX_QUERY_RETRIES.
//   - Back off exponentially WITH full jitter (so concurrent browsers don't
//     form a thundering herd), capped at RETRY_MAX_DELAY_MS, never negative.
//
// RED: these fail until `queryRetry.ts` implements the real bodies (the stub
// throws "not implemented"). Jitter is made deterministic by spying on
// `Math.random` so exact boundary values can be asserted — full jitter is
// defined by the plan as `min(CAP, random() * base * 2^attempt)`, so a pinned
// `Math.random()` yields an exact, not merely banded, expected delay.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimitError, RepositoryError } from '@/data/errors';
import {
  MAX_QUERY_RETRIES,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  queryRetryDelay,
  shouldRetryQuery,
} from './queryRetry';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Pin `Math.random` to a fixed fraction so full jitter is deterministic.
 * The plan's formula is `min(CAP, random() * base * 2^attempt)`, so the exact
 * expected delay for a pinned fraction `r` and attempt `n` is computable.
 */
function pinRandom(fraction: number): void {
  vi.spyOn(Math, 'random').mockReturnValue(fraction);
}

/** Uncapped full-jitter window ceiling for an attempt index (`base * 2^n`). */
function jitterWindow(attemptIndex: number): number {
  return RETRY_BASE_DELAY_MS * 2 ** attemptIndex;
}

describe('shouldRetryQuery — 429 / 4xx never retry, transient retries are bounded', () => {
  it('returns false for a RateLimitError (429) regardless of failureCount', () => {
    const err = new RateLimitError();
    // A 429 short-circuits at EVERY failureCount — never schedule a 429 retry.
    expect(shouldRetryQuery(0, err)).toBe(false);
    expect(shouldRetryQuery(1, err)).toBe(false);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES - 1, err)).toBe(false);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES, err)).toBe(false);
  });

  it.each([
    ['400 Bad Request', new RepositoryError('BAD_REQUEST', 'bad', 400)],
    ['401 Unauthorized', new RepositoryError('UNAUTHORIZED', 'nope', 401)],
    ['404 Not Found', new RepositoryError('NOT_FOUND', 'missing', 404)],
    ['499 (top of the 4xx band)', new RepositoryError('CLIENT', 'x', 499)],
  ])('returns false for a 4xx RepositoryError regardless of failureCount (%s)', (_label, err) => {
    // 4xx is a client error — retrying cannot fix it, at any failureCount.
    expect(shouldRetryQuery(0, err)).toBe(false);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES - 1, err)).toBe(false);
  });

  it('returns true for a generic Error while failureCount < MAX_QUERY_RETRIES', () => {
    expect(shouldRetryQuery(0, new Error('network blip'))).toBe(true);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES - 1, new Error('network blip'))).toBe(true);
  });

  it.each([
    ['500 Internal Server Error', 500],
    ['502 Bad Gateway', 502],
    ['503 Service Unavailable', 503],
  ])(
    'returns true for a 5xx RepositoryError while under the retry budget (%s)',
    (_label, status) => {
      const err = new RepositoryError('UPSTREAM_HTTP', 'upstream down', status);
      expect(shouldRetryQuery(0, err)).toBe(true);
      expect(shouldRetryQuery(MAX_QUERY_RETRIES - 1, err)).toBe(true);
    },
  );

  it('returns false once failureCount reaches MAX_QUERY_RETRIES (bounded, no infinite retry)', () => {
    expect(shouldRetryQuery(MAX_QUERY_RETRIES, new Error('still failing'))).toBe(false);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES + 1, new Error('still failing'))).toBe(false);
    // 5xx is also bounded — the budget caps transient retries regardless of kind.
    expect(
      shouldRetryQuery(MAX_QUERY_RETRIES, new RepositoryError('UPSTREAM_HTTP', 'x', 503)),
    ).toBe(false);
  });
});

describe('queryRetryDelay — exponential backoff with full jitter, capped, non-negative', () => {
  it('returns exactly 0 at the jitter floor (Math.random() === 0) for every early attempt', () => {
    pinRandom(0);
    // Full jitter floor is 0 at any attempt: random() * window === 0.
    expect(queryRetryDelay(0)).toBe(0);
    expect(queryRetryDelay(1)).toBe(0);
    expect(queryRetryDelay(3)).toBe(0);
  });

  it('returns exactly half the window at the jitter midpoint (Math.random() === 0.5)', () => {
    pinRandom(0.5);
    // The exact value is computable from the formula, not merely banded:
    // attempt 0 → 0.5 * 500 = 250; attempt 2 → 0.5 * 2000 = 1000.
    expect(queryRetryDelay(0)).toBe(0.5 * jitterWindow(0)); // 250
    expect(queryRetryDelay(1)).toBe(0.5 * jitterWindow(1)); // 500
    expect(queryRetryDelay(2)).toBe(0.5 * jitterWindow(2)); // 1000
  });

  it.each([0, 1, 2, 3])(
    'stays within the inclusive [0, window] jitter band at the ceiling for attempt %i',
    (attempt) => {
      // 0.999999 sits just under 1 so either a `* window` or a `floor(* window)`
      // jitter impl lands inside the band, never above the window ceiling.
      pinRandom(0.999999);
      const window = jitterWindow(attempt);
      const delay = queryRetryDelay(attempt);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(window);
    },
  );

  it('grows the jitter window exponentially with the attempt index (monotonic upper band)', () => {
    pinRandom(0.999999);
    const d0 = queryRetryDelay(0);
    const d1 = queryRetryDelay(1);
    const d2 = queryRetryDelay(2);
    // base*2^0=500 < base*2^1=1000 < base*2^2=2000 → ceilings strictly increase
    // until the cap clamps them.
    expect(d1).toBeGreaterThan(d0);
    expect(d2).toBeGreaterThan(d1);
  });

  it('caps the delay at RETRY_MAX_DELAY_MS once the window would exceed the cap', () => {
    pinRandom(0.999999);
    // 2^20 * 500 ≈ 5.2e8 ms — vastly past the 30s cap; the result must clamp.
    expect(queryRetryDelay(20)).toBeLessThanOrEqual(RETRY_MAX_DELAY_MS);
    // The cap is also honoured at the lower edge of a far-future attempt.
    expect(queryRetryDelay(30)).toBeLessThanOrEqual(RETRY_MAX_DELAY_MS);
  });

  it('never returns a negative or non-finite delay across the random and attempt ranges', () => {
    for (const fraction of [0, 0.25, 0.5, 0.999999]) {
      pinRandom(fraction);
      for (let attempt = 0; attempt <= 5; attempt += 1) {
        const delay = queryRetryDelay(attempt);
        expect(Number.isFinite(delay)).toBe(true);
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
