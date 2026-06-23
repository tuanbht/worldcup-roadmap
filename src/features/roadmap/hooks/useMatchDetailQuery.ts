import { useQuery } from '@tanstack/react-query';
import type { Match, MatchDetail } from '@/domain/types';
import { loadMatchDetail } from '@/data/providers/fifa/match-detail-loader';

export type MatchDetailStatus = 'loading' | 'ready' | 'unavailable' | 'error';

export interface MatchDetailQueryResult {
  readonly detail: MatchDetail | null;
  readonly status: MatchDetailStatus;
  readonly error: string | null;
}

const STALE_TIME_MS = 30_000;

/**
 * Lazily load the FIFA detail for the selected match directly in the browser via
 * the client-side `loadMatchDetail` loader (no internal `/api/*` route, no
 * transport envelope). The hook takes the resolved `Match` (carrying its
 * `providerRef`), so there is no id→ref round-trip. `enabled` only when a match
 * is selected; the TanStack `AbortSignal` is forwarded so switching matches /
 * closing the panel aborts the in-flight fetch.
 *
 * There is no polling timer — detail refreshes on window focus (when stale)
 * only. A null `providerRef` resolves `unavailable` (rendered by the UI-owned
 * `<PanelEmpty />`), not an error; a genuine upstream throw → `status: 'error'`.
 */
export function useMatchDetailQuery(match: Match | null): MatchDetailQueryResult {
  const { data, error, isPending } = useQuery({
    queryKey: ['match-detail', match?.id ?? null],
    queryFn: ({ signal }) => loadMatchDetail(match!, { signal }),
    enabled: match != null,
    staleTime: STALE_TIME_MS,
  });

  if (match == null) return { detail: null, status: 'loading', error: null };
  if (error) return { detail: null, status: 'error', error: error.message };
  if (isPending || data === undefined) return { detail: null, status: 'loading', error: null };
  if (data.kind === 'unavailable') return { detail: null, status: 'unavailable', error: null };
  return { detail: data.detail, status: 'ready', error: null };
}
