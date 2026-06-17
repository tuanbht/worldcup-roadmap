import type { Bracket } from './bracket';
import type { Group } from './group';
import type { Match } from './match';
import type { Team } from './team';

export type ProviderName = 'fifa' | 'mock' | 'football-data' | 'api-football';

export interface TournamentMeta {
  readonly id: 'WC-2026';
  readonly name: string;
  readonly season: number;
  readonly provider: ProviderName;
  /** When this snapshot was assembled, ISO 8601 UTC. */
  readonly fetchedAt: string;
}

/**
 * Root aggregate every repository returns and every view consumes. `matches` is
 * the single source of truth; `groups` and `bracket` are derived views over it.
 */
export interface Tournament {
  readonly meta: TournamentMeta;
  readonly teams: readonly Team[];
  readonly matches: readonly Match[];
  readonly groups: readonly Group[];
  readonly bracket: Bracket;
}
