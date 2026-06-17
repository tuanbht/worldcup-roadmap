import { buildBracket } from './bracket/build-bracket';
import { computeGroups } from './bracket/standings';
import type { Match, ProviderName, Team, Tournament } from './types';

interface AssembleInput {
  readonly matches: readonly Match[];
  readonly provider: ProviderName;
  readonly fetchedAt: string;
  readonly name?: string;
  readonly season?: number;
}

/**
 * Compose a normalized `Tournament` from a flat match list: dedupe the resolved
 * teams, then derive the group tables and knockout bracket. `matches` is the
 * single source of truth; the rest are views over it.
 */
export function assembleTournament(input: AssembleInput): Tournament {
  const teams = new Map<string, Team>();
  for (const match of input.matches) {
    for (const ref of [match.home, match.away]) {
      if (ref.kind === 'team') teams.set(ref.team.id, ref.team);
    }
  }

  return {
    meta: {
      id: 'WC-2026',
      name: input.name ?? 'FIFA World Cup 2026',
      season: input.season ?? 2026,
      provider: input.provider,
      fetchedAt: input.fetchedAt,
    },
    teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name)),
    matches: input.matches,
    groups: computeGroups(input.matches),
    bracket: buildBracket(input.matches),
  };
}
