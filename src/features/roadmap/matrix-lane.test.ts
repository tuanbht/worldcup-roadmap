// Unit spec for the pure lane derivation `matrix-lane.ts` — the ONE source of
// truth for the matrix view's per-team journey, edge-id grammar, and per-team hue
// (requirement 2026-07-01-1030; plan Test Strategy 9 + plan-review M3).
//
//   - `teamLanes(tournament)`: each team → its matches (RESOLVED home/away
//     membership ONLY) sorted by kickoff ascending (tiebreak id).
//   - `laneEdgeId(teamId, src, dst)`: the `lane-<teamId>-<src>-<dst>` grammar.
//   - `teamHue(teamId)`: a stable, total per-team hue string.
//
// Oracles are FIXTURE-DERIVED from the validated mock. The RESOLVED-ONLY guard
// (plan-review M3) is exercised with a small SYNTHETIC tournament because the mock
// has ZERO placeholder sides — so the guard would otherwise never be tested. RED
// on MISSING LOGIC (the stub returns an empty map / a fixed hue), not on an import
// error.
import { describe, expect, it } from 'vitest';
import { laneEdgeId, teamHue, teamLanes } from './matrix-lane';
import {
  SYNTHETIC_TEAM,
  teamIdsWithMatches,
  teamMatchesInOrder,
  tournamentWithBothSidesPlaceholder,
  tournamentWithPlaceholderSide,
  twoDistinctTeamIds,
} from './__test-support__/matrix-fixtures';
import { deepFreeze, loadTournament } from './__test-support__/roadmap-fixtures';
import type { Match } from '@/domain/types';

const tournament = loadTournament();

describe('teamLanes — chronological resolved journeys [Test 9]', () => {
  it('maps every playing team to its matches in kickoff-then-id order', () => {
    const lanes = teamLanes(tournament);
    const owners = teamIdsWithMatches(tournament);
    expect(owners.length, 'the fixture has playing teams').toBeGreaterThan(0);
    for (const teamId of owners) {
      const got = lanes.get(teamId);
      expect(got, `teamLanes has an entry for ${teamId}`).toBeDefined();
      // Fixture-derived expected sequence (resolved membership, kickoff order).
      const expected = teamMatchesInOrder(tournament, teamId).map((m) => m.id);
      expect(got!.map((m) => m.id)).toEqual(expected);
    }
  });

  it('produces a strictly ascending kickoff order within each lane', () => {
    const lanes = teamLanes(tournament);
    for (const [, matches] of lanes) {
      for (let i = 1; i < matches.length; i += 1) {
        // Non-decreasing kickoff, tie-broken by id — never a regression.
        const prev = matches[i - 1];
        const cur = matches[i];
        const ordered =
          prev.kickoff < cur.kickoff ||
          (prev.kickoff === cur.kickoff && prev.id.localeCompare(cur.id) <= 0);
        expect(ordered, `lane ordered at index ${i}`).toBe(true);
      }
    }
  });

  it('does not mutate a deep-frozen input tournament (pure)', () => {
    expect(() => teamLanes(deepFreeze(loadTournament()))).not.toThrow();
  });
});

describe('teamLanes — resolved-only membership guard [plan-review M3]', () => {
  // Synthetic tournaments (ONE resolved+placeholder match; ONE both-placeholder
  // match) come from the shared `matrix-fixtures` factory so the placeholder-side
  // Match shape lives in one place, not copy-pasted per spec.

  it('attributes a lane to the RESOLVED side and NONE to the placeholder side', () => {
    const synthetic = tournamentWithPlaceholderSide(tournament);
    const lanes = teamLanes(synthetic);
    // The resolved team gets its single station.
    expect(lanes.get(SYNTHETIC_TEAM.id)?.map((m) => m.id)).toEqual(['syn-ko-1']);
    // The placeholder side attributes NO lane: no map key derives from a label.
    for (const key of lanes.keys()) {
      expect(key.startsWith('team-'), `lane key ${key} is a resolved team id`).toBe(true);
    }
    // And the only lane owner is the resolved team (no phantom placeholder owner).
    expect([...lanes.keys()]).toEqual([SYNTHETIC_TEAM.id]);
  });

  it('does not crash on a match whose BOTH sides are placeholders (empty lane set)', () => {
    const synthetic = tournamentWithBothSidesPlaceholder(tournament);
    let lanes!: Map<string, Match[]>;
    expect(() => {
      lanes = teamLanes(synthetic);
    }).not.toThrow();
    // No resolved side → no lanes at all.
    expect(lanes.size).toBe(0);
  });
});

describe('laneEdgeId — canonical grammar', () => {
  it('composes lane-<teamId>-<src>-<dst>', () => {
    expect(laneEdgeId('team-arg', 'm1', 'm2')).toBe('lane-team-arg-m1-m2');
  });
});

describe('teamHue — stable + total [Test 9]', () => {
  it('is stable: the same team id maps to the same hue across calls', () => {
    const [teamId] = twoDistinctTeamIds(tournament);
    const a = teamHue(teamId);
    const b = teamHue(teamId);
    expect(a).toBe(b);
    expect(a, 'hue is a non-empty string').toBeTruthy();
  });

  it('gives two DISTINCT teams distinct hues (traceability, not one shared color)', () => {
    // Two different lane owners must not collapse to the same color, or their
    // lanes would be indistinguishable. RED: the stub returns ONE fixed hue.
    const [a, b] = twoDistinctTeamIds(tournament);
    expect(teamHue(a), 'both teams get a hue').toBeTruthy();
    expect(teamHue(b), 'both teams get a hue').toBeTruthy();
    expect(teamHue(a)).not.toBe(teamHue(b));
  });

  it('is total: every playing team gets a non-empty hue and they are not all one color', () => {
    // A total function returns SOMETHING for any id; across the roster the hues
    // must not all collapse to a single shared color (traceability).
    const owners = teamIdsWithMatches(tournament).slice(0, 12);
    const hues = owners.map((id) => teamHue(id));
    for (const h of hues) expect(h, 'every team gets a hue').toBeTruthy();
    expect(new Set(hues).size, 'distinct teams do not all share one hue').toBeGreaterThan(1);
  });
});
