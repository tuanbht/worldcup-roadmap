import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton TanStack Query client.
 *
 * There is no query polling timer anywhere — refresh is event-driven and the
 * SPA fetches FIFA directly (no server, no internal API): `refetchOnWindowFocus:
 * true` refetches a query when the tab regains focus, but only if it is already
 * STALE (past `staleTime`), so rapid tab toggling never causes refetch storms.
 * `refetchOnReconnect` stays at its default (`true`). `staleTime` + `gcTime` also
 * dedupe the StrictMode double-mount so dev does not churn redundant direct FIFA
 * calls. `retry: 1` keeps a transient blip from immediately surfacing.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
