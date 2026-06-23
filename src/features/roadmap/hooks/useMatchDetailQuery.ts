import { useQuery } from '@tanstack/react-query';
import type { MatchDetail } from '@/domain/types';
import type { ApiEnvelope } from '@/data/envelope';
import { DETAIL_UNAVAILABLE } from '@/data/detail-codes';
import { apiUrl } from '@/lib/api';

export type MatchDetailStatus = 'loading' | 'ready' | 'unavailable' | 'error';

export interface MatchDetailQueryResult {
  readonly detail: MatchDetail | null;
  readonly status: MatchDetailStatus;
  readonly error: string | null;
}

const STALE_TIME_MS = 30_000;

/** Discriminated outcome so `DETAIL_UNAVAILABLE` isn't a thrown query error. */
type FetchOutcome =
  | { readonly kind: 'ready'; readonly detail: MatchDetail }
  | { readonly kind: 'unavailable' };

interface FetchOptions {
  readonly signal?: AbortSignal;
}

async function fetchMatchDetail(matchId: string, options?: FetchOptions): Promise<FetchOutcome> {
  const res = await fetch(apiUrl(`/api/worldcup/match/${matchId}/detail`), {
    cache: 'no-store',
    signal: options?.signal,
  });

  let envelope: ApiEnvelope<MatchDetail>;
  try {
    envelope = (await res.json()) as ApiEnvelope<MatchDetail>;
  } catch {
    throw new Error(`Failed to load match detail (HTTP ${res.status}).`);
  }

  if (envelope.success) return { kind: 'ready', detail: envelope.data };
  if (envelope.error.code === DETAIL_UNAVAILABLE) return { kind: 'unavailable' };
  throw new Error(envelope.error.message);
}

/**
 * Lazily fetch `/api/worldcup/match/:id/detail` for the selected match (URL
 * built through `apiUrl()` so the SPA can call the Hono origin directly).
 * `enabled` only when `matchId` is non-null. There is no query polling timer:
 * detail refreshes on window focus (when stale) only, so `isLive` is purely
 * informational and no longer drives fetch timing. A `DETAIL_UNAVAILABLE` fail
 * envelope maps to `status:'unavailable'` (not an error).
 */
export function useMatchDetailQuery(
  matchId: string | null,
  _isLive: boolean,
): MatchDetailQueryResult {
  const { data, error, isPending } = useQuery({
    queryKey: ['match-detail', matchId],
    queryFn: ({ signal }) => fetchMatchDetail(matchId!, { signal }),
    enabled: matchId != null,
    staleTime: STALE_TIME_MS,
  });

  if (matchId == null) return { detail: null, status: 'loading', error: null };
  if (error) return { detail: null, status: 'error', error: error.message };
  if (isPending || data === undefined) return { detail: null, status: 'loading', error: null };
  if (data.kind === 'unavailable') return { detail: null, status: 'unavailable', error: null };
  return { detail: data.detail, status: 'ready', error: null };
}
