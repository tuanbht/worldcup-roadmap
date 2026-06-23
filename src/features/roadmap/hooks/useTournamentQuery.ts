import { useQuery } from '@tanstack/react-query';
import type { Tournament } from '@/domain/types';
import { selectRepository } from '@/data/repository-factory';

/** The call-site contract `RoadmapCanvas` destructures (`{ data, loading }`). */
interface TournamentQueryResult {
  data: Tournament | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch the normalized tournament directly from the active repository (FIFA with
 * a transparent mock fallback under `auto`). No internal `/api/*` hop and no
 * transport envelope: the SPA calls FIFA from the browser and the domain builders
 * assemble the `Tournament` client-side. TanStack Query owns caching and dedupe;
 * there is no polling timer — the feed refreshes on mount + window focus (when
 * stale) + reconnect. Returns the FULL `Tournament` so the Legend can read
 * `meta.provider`.
 */
export function useTournamentQuery(): TournamentQueryResult {
  const { data, isPending, error } = useQuery({
    queryKey: ['tournament'],
    queryFn: () => selectRepository().getTournament(),
  });

  return {
    data: data ?? null,
    loading: isPending,
    error: error ? error.message : null,
  };
}
