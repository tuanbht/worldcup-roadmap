import type { Group, Match, MatchEvent, MatchEventKind } from '@/domain/types';

export interface GoalscorerEntry {
  readonly playerName: string;
  readonly minutes: readonly number[];
}

const GOAL_KINDS: ReadonlySet<MatchEventKind> = new Set(['goal', 'own-goal', 'penalty-goal']);

/**
 * Summarize the goal events into one entry per scorer with their goal minutes,
 * in chronological order. Non-goal events are ignored.
 */
export function goalscorerSummary(events: readonly MatchEvent[]): readonly GoalscorerEntry[] {
  const order: string[] = [];
  const minutesByPlayer = new Map<string, number[]>();

  for (const event of [...events].sort((a, b) => a.minute - b.minute)) {
    if (!GOAL_KINDS.has(event.kind)) continue;
    const name = event.playerName;
    if (!name) continue;
    if (!minutesByPlayer.has(name)) {
      minutesByPlayer.set(name, []);
      order.push(name);
    }
    minutesByPlayer.get(name)!.push(event.minute);
  }

  return order.map((playerName) => ({ playerName, minutes: minutesByPlayer.get(playerName)! }));
}

const ORDINAL_SUFFIXES = ['th', 'st', 'nd', 'rd'];

/** Convert a 1-based position to an ordinal label ("1st".."4th"). */
function ordinal(position: number): string {
  const rem100 = position % 100;
  const rem10 = position % 10;
  const suffix = rem100 >= 11 && rem100 <= 13 ? 'th' : (ORDINAL_SUFFIXES[rem10] ?? 'th');
  return `${position}${suffix}`;
}

/**
 * Group standing position label ("1st".."4th") for a team within a group, or
 * `null` when the group letter / teamId is null, the group is missing, or the
 * team has no row. Reads `Group.table` (1-based `position`). The `TeamRef → id`
 * unwrap happens at the call site.
 */
export function standingPositionLabel(
  groups: readonly Group[],
  groupLetter: string | null,
  teamId: string | null,
): string | null {
  if (!groupLetter || !teamId) return null;
  const group = groups.find((g) => g.name === groupLetter);
  if (!group) return null;
  const row = group.table.find((r) => r.team.id === teamId);
  return row ? ordinal(row.position) : null;
}

/** Status pill text (Half-time / `{minute}'` / Full-time / Upcoming). */
export function statusLabel(match: Match): string {
  if (match.status === 'finished') return 'Full-time';
  if (match.status === 'live') {
    return match.minute != null ? `${match.minute}'` : 'Live';
  }
  return 'Upcoming';
}
