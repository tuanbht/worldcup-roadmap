import { useQuery } from '@tanstack/react-query';
import type { Tournament } from '@/domain/types';
import type { ApiEnvelope } from '@/data/envelope';
import { apiUrl } from '@/lib/api';

const WORLDCUP_PATH = '/api/worldcup';

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
 * The URL is built through `apiUrl()` so a configured `VITE_API_BASE_URL`
 * points the SPA directly at the Hono origin (no Vite proxy needed in prod).
 */
async function fetchTournament(): Promise<Tournament> {
  const res = await fetch(apiUrl(WORLDCUP_PATH), { cache: 'no-store' });
  const json = (await res.json()) as ApiEnvelope<Tournament>;
  if (!json.success) {
    throw new Error(json.error.message);
  }
  return json.data;
}

/**
 * Replaces the hand-rolled `useTournament` (fetch + timer + `AbortController`).
 * TanStack Query owns caching and dedupe. There is no query polling timer: the
 * feed refreshes on mount + window focus (when stale) + reconnect. Returns the
 * FULL `Tournament` so the Legend can read `meta.provider`.
 */
export function useTournamentQuery(): TournamentQueryResult {
  const { data, isPending, error } = useQuery({
    queryKey: ['tournament'],
    queryFn: fetchTournament,
  });

  return {
    data: data ?? null,
    loading: isPending,
    error: error ? error.message : null,
  };
}
