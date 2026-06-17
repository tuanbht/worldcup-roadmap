import { describe, expect, it } from 'vitest';
import { computeGroupMatchLanes } from './group-layout';
import { GROUP_GAP, GROUP_MATCH_STEP_X, LANE_PITCH_Y, TABLE_W } from './layout-constants';
import {
  deepFreeze,
  groupNames,
  groupStageMatches,
  loadTournament,
  sortedEntries,
} from '../__test-support__/roadmap-fixtures';
import type { Match } from '@/domain/types';

/**
 * Spec for the NEW horizontal group band (`computeGroupMatchLanes`).
 *
 * RED until implemented. Every count is DERIVED from the validated mock fixture
 * (12 groups x 6 = 72 group-stage matches), never hardcoded. Acceptance #1-#3.
 */

const tournament = loadTournament();
const allGroupMatches: Match[] = groupStageMatches(tournament);
const names = groupNames(tournament); // already A..L order

/** Group-stage matches in canonical lane order: kickoff asc, id tiebreak. */
function laneMatches(group: string): Match[] {
  return allGroupMatches
    .filter((m) => m.group === group)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
}

describe('computeGroupMatchLanes — node composition', () => {
  it('emits exactly one position for every GROUP_STAGE match (72, derived)', () => {
    expect(allGroupMatches.length).toBe(72); // fixture self-check (12 x 6)
    const { matches } = computeGroupMatchLanes(tournament);
    expect(matches.size).toBe(allGroupMatches.length);
    for (const m of allGroupMatches) {
      expect(matches.has(m.id)).toBe(true);
    }
  });

  it('emits one table position per group, each anchored at x=0', () => {
    const { table } = computeGroupMatchLanes(tournament);
    expect(table.size).toBe(names.length);
    for (const name of names) {
      expect(table.get(name)).toEqual(expect.objectContaining({ x: 0 }));
    }
  });

  it('spans one lane per group in bandHeight (groupBandHeight)', () => {
    const { bandHeight } = computeGroupMatchLanes(tournament);
    expect(bandHeight).toBe(names.length * LANE_PITCH_Y);
  });
});

describe('computeGroupMatchLanes — lane ordering', () => {
  it('lays each lane out left->right strictly increasing in x by kickoff', () => {
    const { matches } = computeGroupMatchLanes(tournament);
    for (const name of names) {
      const sorted = laneMatches(name);
      expect(sorted.length).toBe(6); // fixture self-check: 3 matchdays x 2 matches
      const xs = sorted.map((m) => matches.get(m.id)!.x);
      // every adjacent pair increases — no inversions anywhere in the lane.
      for (let i = 1; i < xs.length; i += 1) {
        expect(xs[i]).toBeGreaterThan(xs[i - 1]);
      }
    }
  });

  it('shares the table y across every match in a lane', () => {
    const { table, matches } = computeGroupMatchLanes(tournament);
    for (const name of names) {
      const laneY = table.get(name)!.y;
      for (const m of laneMatches(name)) {
        expect(matches.get(m.id)!.y).toBe(laneY);
      }
    }
  });

  it('gives each group a distinct, strictly increasing lane y in A..L order', () => {
    const { table } = computeGroupMatchLanes(tournament);
    const ys = names.map((name) => table.get(name)!.y);
    expect(new Set(ys).size).toBe(ys.length); // distinct
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1]); // monotone with lane index
    }
  });

  it('anchors the first match at TABLE_W + GROUP_GAP and steps by GROUP_MATCH_STEP_X', () => {
    const { matches } = computeGroupMatchLanes(tournament);
    for (const name of names) {
      const sorted = laneMatches(name);
      const xs = sorted.map((m) => matches.get(m.id)!.x);
      expect(xs[0]).toBe(TABLE_W + GROUP_GAP);
      // a uniform GROUP_MATCH_STEP_X gap holds for every adjacent pair, not just the first.
      for (let i = 1; i < xs.length; i += 1) {
        expect(xs[i] - xs[i - 1]).toBe(GROUP_MATCH_STEP_X);
      }
    }
  });
});

describe('computeGroupMatchLanes — purity', () => {
  it('produces structurally-equal output across calls', () => {
    const a = computeGroupMatchLanes(tournament);
    const b = computeGroupMatchLanes(tournament);
    expect(a.bandHeight).toBe(b.bandHeight);
    expect(sortedEntries(a.matches)).toEqual(sortedEntries(b.matches));
    expect(sortedEntries(a.table)).toEqual(sortedEntries(b.table));
  });

  it('does not mutate a deeply-frozen tournament', () => {
    const frozen = deepFreeze(loadTournament());
    expect(() => computeGroupMatchLanes(frozen)).not.toThrow();
  });
});
