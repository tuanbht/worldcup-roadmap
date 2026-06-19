import type { Match, Tournament } from '@/domain/types';
import { dayKey } from './day-axis';
import {
  DAY_ROW_PITCH,
  GROUP_COL_PITCH,
  HEADER_H,
  RAIL_W,
  SLOT,
  STACK,
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

/**
 * Header y: the column-title pill (~44px tall — a 26px badge + `py-2` + border)
 * sits high in the top band with clear air beneath it before row 0 begins at
 * `HEADER_H`. Was `HEADER_H / 2` (= 48), which dropped the pill's bottom to ~92px
 * — only ~4px above the first day's cards, reading as an overlap. At 24 the gap
 * is ~28px and the title is balanced in the band.
 */
const HEADER_Y = 24;

/** kickoff ascending (ISO-UTC ⇒ lexical == chronological), id tiebreak. */
function bySlotOrder(a: Match, b: Match): number {
  return a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id);
}

/** Fixed column base x from a group's A..L index. */
function columnX(colIndex: number): number {
  return RAIL_W + colIndex * GROUP_COL_PITCH;
}

/** Day-row y on the shared axis. */
function rowY(dayIndex: ReadonlyMap<string, number>, kickoff: string, tz?: string): number {
  return HEADER_H + (dayIndex.get(dayKey(kickoff, tz)) ?? 0) * DAY_ROW_PITCH;
}

/**
 * Horizontal sub-slot for one kickoff-group within a cell: a single kickoff
 * centres on the column; two distinct kickoffs sit side-by-side at ± SLOT/2.
 */
function subSlotX(index: number, count: number): number {
  return count === 1 ? 0 : (index - (count - 1) / 2) * SLOT;
}

/**
 * Position each group's matches within its fixed column at the kickoff-day row.
 * Within a (group, day) cell, matches are grouped by EXACT kickoff: distinct
 * kickoffs sit side-by-side (± SLOT/2), while matches that share a kickoff (the
 * simultaneous final group matchday) STACK VERTICALLY in one sub-slot, centred on
 * the day-row at `y ± STACK/2`. A lone match keeps the base column x at the row.
 */
function placeColumnMatches(
  groupMatches: Match[],
  baseX: number,
  dayIndex: ReadonlyMap<string, number>,
  out: Map<string, XY>,
  tz?: string,
): void {
  const byDay = new Map<string, Match[]>();
  for (const match of groupMatches) {
    const key = dayKey(match.kickoff, tz);
    const cell = byDay.get(key) ?? [];
    cell.push(match);
    byDay.set(key, cell);
  }

  for (const cell of byDay.values()) {
    const ordered = [...cell].sort(bySlotOrder);
    // Group consecutive same-kickoff matches (the list is already kickoff-sorted).
    const kickoffGroups: Match[][] = [];
    for (const match of ordered) {
      const current = kickoffGroups.at(-1);
      if (current && current[0].kickoff === match.kickoff) current.push(match);
      else kickoffGroups.push([match]);
    }

    kickoffGroups.forEach((slotMatches, slotIndex) => {
      const x = baseX + subSlotX(slotIndex, kickoffGroups.length);
      const y0 = rowY(dayIndex, slotMatches[0].kickoff, tz);
      slotMatches.forEach((match, stackIndex) => {
        const dy = (stackIndex - (slotMatches.length - 1) / 2) * STACK;
        out.set(match.id, { x, y: y0 + dy });
      });
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
  tz?: string,
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
    placeColumnMatches(byGroup.get(group.name) ?? [], baseX, dayIndex, matches, tz);
  });

  return { matches, headers };
}
