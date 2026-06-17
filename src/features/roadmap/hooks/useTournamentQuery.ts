import { useQuery } from '@tanstack/react-query';
import type { Tournament } from '@/domain/types';
import type { ApiEnvelope } from '@/data/envelope';

const WORLDCUP_ENDPOINT = '/api/worldcup';
const REFETCH_INTERVAL_MS = 45_000;

/** The call-site contract `RoadmapCanvas` destructures (`{ data, loading }`). */
interface TournamentQueryResult {
  data: Tournament | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch + validate the normalized tournament at the trust boundary. The server
 * already validated with `parseTournament`; here we only check the envelope
 * discriminant and throw the upstream message so TanStack Query surfaces it.
 */
async function fetchTournament(): Promise<Tournament> {
  const res = await fetch(WORLDCUP_ENDPOINT, { cache: 'no-store' });
  const json = (await res.json()) as ApiEnvelope<Tournament>;
  if (!json.success) {
    throw new Error(json.error.message);
  }
  return json.data;
}

/**
 * Replaces the hand-rolled `useTournament` (fetch + `setInterval` +
 * `AbortController`). TanStack Query owns caching, dedupe, and the 45s live
 * refetch. Returns the FULL `Tournament` so the Legend can read `meta.provider`.
 */
export function useTournamentQuery(): TournamentQueryResult {
  const { data, isPending, error } = useQuery({
    queryKey: ['tournament'],
    queryFn: fetchTournament,
    refetchInterval: REFETCH_INTERVAL_MS,
  });

  return {
    data: data ?? null,
    loading: isPending,
    error: error ? error.message : null,
  };
}
