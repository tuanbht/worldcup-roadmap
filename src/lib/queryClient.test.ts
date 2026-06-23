// Node environment (global vitest default). Asserts the singleton QueryClient's
// default query options encode the focus-only refetch policy (Part 2). No React
// render needed — we read `getDefaultOptions()` directly.
//
// Policy: refetchOnWindowFocus:true, staleTime:3_000, gcTime:3_000, no interval.
// Requirement 1044 (§3): the old `retry: 1` is replaced by the 429-aware
// `shouldRetryQuery` predicate + jittered `queryRetryDelay` backoff. The 3s
// staleTime/gcTime values MUST stay (they are the owner's deliberate eager-on-
// refocus decision — persistence/retry work must COMPOSE with them, not revert
// them); the gcTime/staleTime/focus cases below are regression guards that fail
// loudly if anyone reverts that 3s choice.
import { describe, expect, it } from 'vitest';
import { RateLimitError, RepositoryError } from '@/data/errors';
import { MAX_QUERY_RETRIES, queryRetryDelay, shouldRetryQuery } from './queryRetry';
import { queryClient } from './queryClient';

describe('queryClient default query options (focus-only refetch)', () => {
  const queries = queryClient.getDefaultOptions().queries;

  it('refetches on window focus (was false before this change)', () => {
    expect(queries?.refetchOnWindowFocus).toBe(true);
  });

  it('keeps staleTime short (3s) so a refocus refetches eagerly without sub-3s storms', () => {
    expect(queries?.staleTime).toBe(3_000);
  });

  it('wires the shared shouldRetryQuery predicate as `retry` (no longer a bare retry: 1)', () => {
    // retry is now the predicate function, not the number 1 — and it is the
    // SAME exported helper that queryRetry.test.ts pins exhaustively, so this
    // asserts the wiring identity rather than re-testing the policy here.
    expect(queries?.retry).toBe(shouldRetryQuery);
  });

  it('the wired retry predicate refuses 429 / 4xx and retries a transient error', () => {
    const retry = queries?.retry as (failureCount: number, error: unknown) => boolean;
    // A 429 must never be retried (no retry storm against a throttling upstream).
    expect(retry(0, new RateLimitError())).toBe(false);
    // A 4xx client error must never be retried either.
    expect(retry(0, new RepositoryError('NOT_FOUND', 'missing', 404))).toBe(false);
    // A transient/generic error is retried while under the budget…
    expect(retry(0, new Error('network blip'))).toBe(true);
    // …and is bounded — never an infinite retry loop.
    expect(retry(MAX_QUERY_RETRIES, new Error('network blip'))).toBe(false);
  });

  it('wires the shared queryRetryDelay backoff as `retryDelay`', () => {
    // Identity wiring: the delay is the SAME jittered-backoff helper that
    // queryRetry.test.ts asserts the bounds/cap of.
    expect(queries?.retryDelay).toBe(queryRetryDelay);
  });

  it('the wired retryDelay yields a finite, non-negative delay for attempt 0', () => {
    const retryDelay = queries?.retryDelay as (attempt: number, error: unknown) => number;
    const delay = retryDelay(0, new Error('blip'));
    expect(Number.isFinite(delay)).toBe(true);
    expect(delay).toBeGreaterThanOrEqual(0);
  });

  it('keeps gcTime short (3s) — minimal retention, cache dropped soon after a query is unobserved', () => {
    expect(queries?.gcTime).toBe(3_000);
  });

  it('configures no refetchInterval at the client level (zero query polling)', () => {
    // The interval policy is removed entirely; the client must not reintroduce
    // it as a default. Undefined/false both mean "no interval".
    expect(queries?.refetchInterval ?? false).toBe(false);
  });
});
