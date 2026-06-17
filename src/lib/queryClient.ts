import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton TanStack Query client.
 *
 * `staleTime` + `gcTime` make the 45s `refetchInterval` and the StrictMode
 * double-mount dedupe in-flight requests, so dev does not churn redundant
 * `/api/worldcup` calls. The server's single-flight TTL cache is a second line
 * of defense. `retry: 1` keeps a transient blip from immediately surfacing.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
