// 429-aware retry policy for the direct-FIFA SPA (requirement 1044, §3).
//
// The browser is now the rate-limited FIFA client, so the retry policy must:
//   - NEVER retry a 429 (`RateLimitError`) — retrying an already-throttling
//     upstream just builds a retry storm.
//   - NEVER retry a 4xx `RepositoryError` (client error) — it can't succeed.
//   - Retry transient/5xx/network errors, BOUNDED at `MAX_QUERY_RETRIES`.
//   - Back off exponentially with FULL jitter (so concurrent browsers don't form
//     a thundering herd), capped at `RETRY_MAX_DELAY_MS`, never negative.
//
// Both helpers are pure (no side effects) and wired into `queryClient.ts` as the
// `retry` predicate / `retryDelay` function.
import { RateLimitError, RepositoryError } from '@/data/errors';

/** Max transient (non-4xx / non-429) retry attempts before giving up. */
export const MAX_QUERY_RETRIES = 3;

/** Base delay (ms) for the exponential-backoff window. */
export const RETRY_BASE_DELAY_MS = 500;

/** Hard cap (ms) on any single backoff delay. */
export const RETRY_MAX_DELAY_MS = 30_000;

/** Lower bound (inclusive) of the HTTP 4xx client-error band. */
const HTTP_CLIENT_ERROR_MIN = 400;
/** Upper bound (exclusive) of the HTTP 4xx client-error band. */
const HTTP_CLIENT_ERROR_MAX = 500;

/** True for a 4xx `RepositoryError` — a client error that retrying cannot fix. */
function isClientError(error: unknown): boolean {
  return (
    error instanceof RepositoryError &&
    error.httpStatus >= HTTP_CLIENT_ERROR_MIN &&
    error.httpStatus < HTTP_CLIENT_ERROR_MAX
  );
}

/**
 * TanStack `retry` predicate. Returns `false` for a `RateLimitError` (429) and
 * any 4xx `RepositoryError` at every `failureCount`; otherwise retries a
 * transient error while `failureCount < MAX_QUERY_RETRIES`.
 *
 * `failureCount` is TanStack's 1-based count of failures so far.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof RateLimitError) return false;
  if (isClientError(error)) return false;
  return failureCount < MAX_QUERY_RETRIES;
}

/**
 * TanStack `retryDelay`. Exponential backoff with full jitter: a value in
 * `[0, min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attemptIndex)]`.
 *
 * `attemptIndex` is TanStack's 0-based attempt number. The capped ceiling keeps
 * far-future attempts from waiting longer than `RETRY_MAX_DELAY_MS`, and the
 * `Math.random()` factor spreads concurrent clients across the window.
 */
export function queryRetryDelay(attemptIndex: number): number {
  const ceiling = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attemptIndex);
  return Math.random() * ceiling;
}
