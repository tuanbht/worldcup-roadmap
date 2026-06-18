import type { Match, Tournament } from '@/domain/types';
import { dayKey } from './day-axis';
import {
  DAY_ROW_PITCH,
  GROUP_COL_PITCH,
  HEADER_H,
  RAIL_W,
  SLOT,
  type XY,
} from './layout-constants';

/**
 * Timeline-grid group zone: groups A..L are fixed columns, each match at
 * (group column × kickoff-day row). Any `(group, day)` cell holding two matches
 * (in the mock, every matchday) splits into two sub-slots at `x ± SLOT/2`,
 * ordered by kickoff then matchId.
 */
export interface GroupGridLayout {
  /** group-match `Match.id` -> position (± SLOT/2 when its (group,day) cell has 2). */
  readonly matches: ReadonlyMap<string, XY>;
  /** group name "A".."L" -> top header position (y < HEADER_H). */
  readonly headers: ReadonlyMap<string, XY>;
}

/** Header y: a small inset above the row-0 band so it reads as a column title. */
const HEADER_Y = HEADER_H / 2;

/** kickoff ascending (ISO-UTC ⇒ lexical == chronological), id tiebreak. */
function bySlotOrder(a: Match, b: Match): number {
  return a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id);
}

/** Fixed column base x from a group's A..L index. */
function columnX(colIndex: number): number {
  return RAIL_W + colIndex * GROUP_COL_PITCH;
}

/** Day-row y on the shared axis. */
function rowY(dayIndex: ReadonlyMap<string, number>, kickoff: string): number {
  return HEADER_H + (dayIndex.get(dayKey(kickoff)) ?? 0) * DAY_ROW_PITCH;
}

/**
 * Position each group's matches within its fixed column at the kickoff-day row.
 * A cell with two matches gets the earlier kickoff at `base - SLOT/2` (left) and
 * the later at `base + SLOT/2` (right); a singleton keeps the base column x.
 */
function placeColumnMatches(
  groupMatches: Match[],
  baseX: number,
  dayIndex: ReadonlyMap<string, number>,
  out: Map<string, XY>,
): void {
  const byDay = new Map<string, Match[]>();
  for (const match of groupMatches) {
    const key = dayKey(match.kickoff);
    const cell = byDay.get(key) ?? [];
    cell.push(match);
    byDay.set(key, cell);
  }

  for (const cell of byDay.values()) {
    const ordered = [...cell].sort(bySlotOrder);
    if (ordered.length === 1) {
      const match = ordered[0];
      out.set(match.id, { x: baseX, y: rowY(dayIndex, match.kickoff) });
      continue;
    }
    ordered.forEach((match, slot) => {
      const offset = slot === 0 ? -SLOT / 2 : SLOT / 2;
      out.set(match.id, { x: baseX + offset, y: rowY(dayIndex, match.kickoff) });
    });
  }
}

/**
 * Lay the group stage out as fixed A..L columns on the shared day axis.
 * Pure and O(n): one pass to bucket matches by group, then per-group day buckets.
 */
export function computeGroupGridLayout(
  tournament: Tournament,
  dayIndex: ReadonlyMap<string, number>,
): GroupGridLayout {
  const matches = new Map<string, XY>();
  const headers = new Map<string, XY>();

  const byGroup = new Map<string, Match[]>();
  for (const match of tournament.matches) {
    if (match.stage !== 'GROUP_STAGE' || match.group === null) continue;
    const lane = byGroup.get(match.group) ?? [];
    lane.push(match);
    byGroup.set(match.group, lane);
  }

  tournament.groups.forEach((group, colIndex) => {
    const baseX = columnX(colIndex);
    headers.set(group.name, { x: baseX, y: HEADER_Y });
    placeColumnMatches(byGroup.get(group.name) ?? [], baseX, dayIndex, matches);
  });

  return { matches, headers };
}
