import { describe, expect, it } from 'vitest';
import { computeGroupGridLayout } from './group-layout';
import { computeDayIndex } from './day-axis';
import {
  GROUP_COL_PITCH,
  HEADER_H,
  DAY_ROW_PITCH,
  RAIL_W,
  SLOT,
  STACK,
  NODE_W,
} from './layout-constants';
import {
  deepFreeze,
  fixtureDayKey,
  groupNames,
  groupStageMatches,
  groupTwoMatchCells,
  loadTournament,
  sortedEntries,
} from '../__test-support__/roadmap-fixtures';
import { teamRef, EMPTY_SCORE } from '@/domain/types';
import type { Match, Tournament } from '@/domain/types';

/**
 * Spec for the NEW timeline-grid group zone (`computeGroupGridLayout`):
 * groups A..L are FIXED COLUMNS across the top, each group match sits at
 * (its group column × its kickoff-day row), and any (group, day) cell with two
 * matches renders them side-by-side at `x ± SLOT/2`. Requirement
 * "Coordinate model > Group zone X"; plan Test Strategy 5-10 / Acceptance #2, #4.
 *
 * RED until `computeGroupGridLayout` exists. All counts fixture-derived.
 */

const tournament = loadTournament();
const allGroupMatches: Match[] = groupStageMatches(tournament);
const names = groupNames(tournament); // 'A'..'L' canonical order

// Built lazily inside each test (via `layout()`), so an unimplemented
// `computeDayIndex`/`computeGroupGridLayout` fails each assertion individually
// instead of collapsing the whole file at import.
function dayIndex(): ReadonlyMap<string, number> {
  return computeDayIndex(tournament.matches);
}
function layout() {
  return computeGroupGridLayout(tournament, dayIndex());
}

/** Expected fixed base x of a group's column from its A..L index. */
function baseX(group: string): number {
  return RAIL_W + names.indexOf(group) * GROUP_COL_PITCH;
}

/** Expected day-row y for a match from the shared axis. */
function rowY(match: Match): number {
  return HEADER_H + dayIndex().get(fixtureDayKey(match.kickoff))! * DAY_ROW_PITCH;
}

describe('computeGroupGridLayout — match composition', () => {
  it('emits exactly one position per GROUP_STAGE match (72, derived)', () => {
    expect(allGroupMatches.length).toBe(72); // fixture self-check (12 groups x 6)
    const { matches } = layout();
    expect(matches.size).toBe(allGroupMatches.length);
    for (const m of allGroupMatches) expect(matches.has(m.id)).toBe(true);
  });

  it('emits one header position per group (12), each in the top band y < HEADER_H', () => {
    const { headers } = layout();
    expect(headers.size).toBe(names.length);
    for (const name of names) {
      const h = headers.get(name);
      expect(h, `header for ${name}`).toBeDefined();
      expect(h!.y).toBeLessThan(HEADER_H);
    }
  });

  it('orders header x by column index: distinct + strictly ascending in A..L order', () => {
    const { headers } = layout();
    const xs = names.map((n) => headers.get(n)!.x);
    expect(new Set(xs).size).toBe(xs.length); // distinct
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });
});

describe('computeGroupGridLayout — fixed columns', () => {
  it("maps every group match's x to its group's fixed column (± SLOT/2)", () => {
    const { matches } = layout();
    for (const m of allGroupMatches) {
      const dx = matches.get(m.id)!.x - baseX(m.group!);
      // Either the base column (singleton) or one sub-slot offset (paired cell).
      expect([-SLOT / 2, 0, SLOT / 2]).toContainEqual(dx);
    }
  });

  it('keeps a header aligned to its column (same base x as its matches)', () => {
    const { headers } = layout();
    for (const name of names) {
      // The header sits on the column centerline (the matches' base x).
      expect(headers.get(name)!.x).toBe(baseX(name));
    }
  });
});

describe('computeGroupGridLayout — chronological day rows', () => {
  it('sets y = HEADER_H + dayIndex*DAY_ROW_PITCH for every match', () => {
    const { matches } = layout();
    for (const m of allGroupMatches) {
      expect(matches.get(m.id)!.y).toBe(rowY(m));
    }
  });

  it('is strictly chronological: a later kickoff day -> strictly greater y', () => {
    const { matches } = layout();
    for (const a of allGroupMatches) {
      for (const b of allGroupMatches) {
        const dayA = fixtureDayKey(a.kickoff);
        const dayB = fixtureDayKey(b.kickoff);
        if (dayA < dayB) {
          expect(matches.get(a.id)!.y).toBeLessThan(matches.get(b.id)!.y);
        }
      }
    }
  });
});

describe('computeGroupGridLayout — paired-cell sub-slots [Rev2:H1]', () => {
  it('places every 2-match (group, day) cell side-by-side at column ± SLOT/2, slot-ordered', () => {
    const { matches } = layout();
    const cells = groupTwoMatchCells(tournament);
    // Fixture self-check: each of the 12 groups pairs all 3 matchdays -> 36 cells.
    expect(cells.length).toBe(36);
    for (const cell of cells) {
      const base = baseX(cell.group);
      const [first, second] = cell.matches; // already kickoff-then-id ordered
      expect(matches.get(first.id)!.x).toBe(base - SLOT / 2); // earlier kickoff -> left
      expect(matches.get(second.id)!.x).toBe(base + SLOT / 2); // later -> right
      // Same row: both sit on that cell's single day.
      expect(matches.get(first.id)!.y).toBe(matches.get(second.id)!.y);
    }
  });

  it('stacks same-kickoff matches vertically in one sub-slot (align vertical)', () => {
    // Synthetic: two group-A matches at the SAME kickoff (FIFA's simultaneous MD3).
    const ko = '2026-06-19T12:00:00.000Z';
    const mk = (id: string): Match => ({
      id,
      providerMatchId: id,
      providerRef: null,
      stage: 'GROUP_STAGE',
      group: 'A',
      matchday: 3,
      home: teamRef({ id: `${id}-h`, name: 'Home', code: 'HOM', flagUrl: null }),
      away: teamRef({ id: `${id}-a`, name: 'Away', code: 'AWY', flagUrl: null }),
      score: EMPTY_SCORE,
      kickoff: ko,
      status: 'scheduled',
      minute: null,
      venue: { name: null, city: null },
    });
    const synth = [mk('same-1'), mk('same-2')];
    const t = {
      meta: {},
      teams: [],
      matches: synth,
      groups: [{ name: 'A', table: [] }],
      bracket: { rounds: [] },
    } as unknown as Tournament;
    const { matches } = computeGroupGridLayout(t, computeDayIndex(synth));
    const a = matches.get('same-1')!;
    const b = matches.get('same-2')!;
    // Vertically aligned: same column x (NO ± SLOT/2 spread), at the column base.
    expect(a.x).toBe(b.x);
    expect(a.x).toBe(RAIL_W);
    // Stacked one STACK pitch apart, centred on the day-row.
    expect(Math.abs(a.y - b.y)).toBe(STACK);
  });

  it('never overlaps an adjacent column on any populated row', () => {
    // Constant relation: the right sub-slot of column c ends before the left
    // sub-slot of column c+1 begins, on every row (independent of the day).
    const rightEdgeOfColC = SLOT / 2 + NODE_W; // relative to a column's base x
    const leftStartOfColNext = GROUP_COL_PITCH - SLOT / 2;
    expect(rightEdgeOfColC).toBeLessThan(leftStartOfColNext);

    // Verified against the actual layout: max x in column c < min x in column c+1
    // for every row that has matches in both columns.
    const { matches } = layout();
    for (let c = 0; c + 1 < names.length; c += 1) {
      const colC = allGroupMatches.filter((m) => m.group === names[c]);
      const colNext = allGroupMatches.filter((m) => m.group === names[c + 1]);
      const maxRightC = Math.max(...colC.map((m) => matches.get(m.id)!.x + NODE_W));
      const minLeftNext = Math.min(...colNext.map((m) => matches.get(m.id)!.x));
      expect(maxRightC).toBeLessThan(minLeftNext);
    }
  });
});

describe('computeGroupGridLayout — purity', () => {
  it('produces structurally-equal output across calls', () => {
    const a = layout();
    const b = layout();
    expect(sortedEntries(a.matches)).toEqual(sortedEntries(b.matches));
    expect(sortedEntries(a.headers)).toEqual(sortedEntries(b.headers));
  });

  it('does not mutate a deeply-frozen tournament', () => {
    const frozen = deepFreeze(loadTournament());
    const frozenIndex = computeDayIndex(frozen.matches);
    expect(() => computeGroupGridLayout(frozen, frozenIndex)).not.toThrow();
  });
});
