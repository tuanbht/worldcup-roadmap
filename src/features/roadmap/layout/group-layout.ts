import type { Match, Tournament } from '@/domain/types';
import {
  GROUP_GAP,
  GROUP_MATCH_STEP_X,
  LANE_PITCH_Y,
  TABLE_W,
  groupBandHeight,
  type XY,
} from './layout-constants';

/**
 * Horizontal group band: one lane per group (A..L), the standings table at the
 * lane start (x=0) and that group's matches running left->right by kickoff.
 */
export interface GroupLaneLayout {
  /** key = group name "A".."L" -> {x:0, y:laneY}. */
  readonly table: ReadonlyMap<string, XY>;
  /** key = group-match `Match.id` -> lane position. */
  readonly matches: ReadonlyMap<string, XY>;
  /** Vertical extent of the band = groupBandHeight(groupCount). */
  readonly bandHeight: number;
}

/** kickoff ascending (ISO-UTC ⇒ lexical == chronological), id tiebreak. */
function byKickoff(a: Match, b: Match): number {
  return a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id);
}

/**
 * Lay the group stage out as one horizontal lane per group, in `A..L` order.
 *
 *  - lane index `i` -> `laneY = i * LANE_PITCH_Y`;
 *  - the group's standings table sits at `{x: 0, y: laneY}`;
 *  - its GROUP_STAGE matches, sorted by `kickoff` ascending, follow at
 *    `x = TABLE_W + GROUP_GAP + orderIndex * GROUP_MATCH_STEP_X` (strictly
 *    increasing x), all sharing `laneY`.
 *
 * Pure and O(n): a single pass over the matches plus one sort per lane.
 */
export function computeGroupMatchLanes(tournament: Tournament): GroupLaneLayout {
  const table = new Map<string, XY>();
  const matches = new Map<string, XY>();

  const matchesByGroup = new Map<string, Match[]>();
  for (const match of tournament.matches) {
    if (match.stage !== 'GROUP_STAGE' || match.group === null) continue;
    const lane = matchesByGroup.get(match.group) ?? [];
    lane.push(match);
    matchesByGroup.set(match.group, lane);
  }

  tournament.groups.forEach((group, laneIndex) => {
    const laneY = laneIndex * LANE_PITCH_Y;
    table.set(group.name, { x: 0, y: laneY });

    const lane = [...(matchesByGroup.get(group.name) ?? [])].sort(byKickoff);
    lane.forEach((match, orderIndex) => {
      matches.set(match.id, {
        x: TABLE_W + GROUP_GAP + orderIndex * GROUP_MATCH_STEP_X,
        y: laneY,
      });
    });
  });

  return { table, matches, bandHeight: groupBandHeight(tournament.groups.length) };
}
