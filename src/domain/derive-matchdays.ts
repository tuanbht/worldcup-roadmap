import type { Match } from './types';

/** A World Cup group of four plays two matches per matchday. */
const MATCHES_PER_MATCHDAY = 2;

/**
 * Fill missing group-stage matchdays. Some providers (the live FIFA feed) supply
 * a match's group but omit `MatchDay`, so `matchday` arrives `null` and group
 * cards can't be labelled "Group A · MD1". Within each group, matches in kickoff
 * order form consecutive matchdays — the first two are MD1, the next two MD2, and
 * so on for a four-team group.
 *
 * Pure. Only NULL group-stage matchdays are derived; any provider-supplied
 * matchday (e.g. the mock fixture) and all knockout/groupless matches are left
 * exactly as-is. Returns the same array reference when nothing needs filling.
 */
export function deriveGroupMatchdays(matches: readonly Match[]): readonly Match[] {
  const byGroup = new Map<string, Match[]>();
  for (const match of matches) {
    if (match.stage === 'GROUP_STAGE' && match.group !== null && match.matchday === null) {
      const arr = byGroup.get(match.group) ?? [];
      arr.push(match);
      byGroup.set(match.group, arr);
    }
  }
  if (byGroup.size === 0) return matches;

  const matchdayById = new Map<string, number>();
  for (const groupMatches of byGroup.values()) {
    [...groupMatches]
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
      .forEach((match, index) =>
        matchdayById.set(match.id, Math.floor(index / MATCHES_PER_MATCHDAY) + 1),
      );
  }

  return matches.map((match) => {
    const derived = matchdayById.get(match.id);
    return derived === undefined ? match : { ...match, matchday: derived };
  });
}
