import { QueryClient } from '@tanstack/react-query';

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
 * at its default (`true`); `retry: 1` keeps a transient blip from surfacing.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3_000,
      gcTime: 3_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
