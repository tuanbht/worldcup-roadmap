import { QueryClient } from '@tanstack/react-query';
import { queryRetryDelay, shouldRetryQuery } from './queryRetry';

/**
 * Singleton TanStack Query client.
 *
 * Refresh is event-driven — there is NO polling timer anywhere. The SPA fetches
 * FIFA directly (no server, no internal API). `refetchOnWindowFocus: true`
 * refetches a query when the tab regains focus, but only if it is already STALE
 * (past `staleTime`). `staleTime`/`gcTime` are kept intentionally SHORT (3s) so a
 * return-to-tab refreshes eagerly, while a sub-3s tab flicker still won't refetch.
 * That 3s window also covers the StrictMode double-mount (synchronous, well under
 * 3s) so dev doesn't churn redundant direct FIFA calls. `refetchOnReconnect` stays
 * at its default (`true`).
 *
 * Resilience (requirement 1044, §3): the browser is now the rate-limited FIFA
 * client, so `retry` is the 429-aware `shouldRetryQuery` predicate (never retries
 * a 429 / 4xx; bounds transient retries) and `retryDelay` is `queryRetryDelay`
 * (exponential backoff with full jitter) so concurrent tabs don't form a
 * thundering herd. The localStorage persistence layer (`queryPersister.ts`)
 * COMPOSES with the 3s window: `gcTime` only governs in-memory retention, while
 * the persisted snapshot's lifetime is the persister's own 24h `maxAge`.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3_000,
      gcTime: 3_000,
      refetchOnWindowFocus: true,
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
    },
  },
});
