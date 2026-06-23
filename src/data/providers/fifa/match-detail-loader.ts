import type { Match, MatchDetail } from '@/domain/types';
import { fetchFifaMatchDetail } from './match-detail-client';
import { mapFifaMatchDetail } from './match-detail-mapper';

/**
 * Bare union — carries NO user-facing copy (Review M-B). The empty-state text for
 * the 'unavailable' branch is UI-owned by `<PanelEmpty />` default props.
 */
export type DetailOutcome =
  | { readonly kind: 'ready'; readonly detail: MatchDetail }
  | { readonly kind: 'unavailable' };

export interface LoadMatchDetailOptions {
  readonly signal?: AbortSignal;
}

/**
 * Client-side port of the deleted Hono detail route. Given a resolved `Match`:
 *   • `providerRef == null` (mock matches) → `{ kind: 'unavailable' }`, no fetch.
 *   • else fetch FIFA `live` + `timelines` (signal threaded) and map to domain.
 *     The mapper degrades any null/empty section to an `EMPTY_MATCH_DETAIL`-shaped
 *     value, so a per-section gap still yields `{ kind: 'ready' }`.
 *   • a GENUINE upstream throw (rate-limit / invalid schema / timeout) propagates
 *     — the loader does not swallow it; the hook maps it to `status: 'error'`.
 *
 * Pure orchestration around `fetchFifaMatchDetail` + `mapFifaMatchDetail`.
 */
export async function loadMatchDetail(
  match: Match,
  options?: LoadMatchDetailOptions,
): Promise<DetailOutcome> {
  const ref = match.providerRef;
  if (!ref) return { kind: 'unavailable' };

  const { live, timeline } = await fetchFifaMatchDetail(ref, { signal: options?.signal });
  const detail = mapFifaMatchDetail(live, timeline, ref);
  return { kind: 'ready', detail };
}
