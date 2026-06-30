// Unit spec for the SHARED winner/loser resolution
// (requirement 2026-06-30-1416; plan Test Strategy 1-4 / Acceptance #1, #4, #6).
//
// The radial inner nodes render the WINNING team's round flag, resolved by the ONE
// shared rule in `resolve-teams.ts` — NOT a forked re-derivation. The GREEN stage
// refactors `winnerTeamId`/`loserTeamId`/the new `winnerTeamRef` onto a single
// private guarded core `decidedTeamRef(node, matchById, which)` that applies the
// SAME `isResolved` guard as `build-bracket.ts:decidedTeam`. These tests pin that
// ONE-rule contract:
//   - `winnerTeamRef` returns the resolved winner ref, and `winnerTeamId` agrees
//     with it BY CONSTRUCTION (`winnerTeamRef.team.id === winnerTeamId`) — for a
//     home win AND an away win, so neither side is special-cased,
//   - live / scheduled / drawn → all three null,
//   - **the M1 fallback the mock never hits**: a finished match whose winning side
//     is still a `placeholderRef(...)` → `winnerTeamRef` null AND `winnerTeamId`
//     null (the guard the requirement demands; agreement preserved),
//   - purity on a deeply-frozen node/match map.
//
// RED reason: `winnerTeamRef` is an unimplemented stub that THROWS, so the new
// assertions fail on MISSING LOGIC (the winner-ref resolution), not an absent
// export — `winnerTeamId`/`loserTeamId` already exist and stay green elsewhere.
import { describe, expect, it } from 'vitest';
import { winnerTeamRef, winnerTeamId, loserTeamId } from './resolve-teams';
import {
  ARG,
  FRA,
  REGULAR_WIN,
  koMatch,
  koNode,
  makeScore,
  mapOf,
} from './__test-support__/match-fixtures';
import { deepFreeze } from '@/features/roadmap/__test-support__/roadmap-fixtures';
import { isResolved, placeholderRef, teamRef } from '@/domain/types';
import type { TeamRef } from '@/domain/types';

describe('resolve-teams — winnerTeamRef / winnerTeamId agree [Test 1 / Acceptance #1, #6]', () => {
  it('home win: winnerTeamRef is the resolved ARG ref, winnerTeamId === ref.team.id, loser is FRA', () => {
    // home wins 2–1 (winner: 'home') with both sides RESOLVED.
    const node = koNode(teamRef(ARG), teamRef(FRA));
    const byId = mapOf(koMatch({ score: REGULAR_WIN }));

    const ref = winnerTeamRef(node, byId);
    expect(ref, 'a finished resolved win must yield a winner ref').not.toBeNull();
    expect(isResolved(ref!), 'the winner ref must be a resolved team, not a placeholder').toBe(
      true,
    );
    // The ONE shared rule: ref and id are the SAME resolved side, and the ref
    // carries the FULL resolved team (the builder reads code/flagUrl off it).
    expect(ref!).toEqual(teamRef(ARG));
    expect(isResolved(ref!) && ref!.team.id).toBe(ARG.id);
    expect(winnerTeamId(node, byId)).toBe(ARG.id);
    expect(isResolved(ref!) && ref!.team.id).toBe(winnerTeamId(node, byId));
    // The loser is the OTHER resolved side (unchanged behaviour).
    expect(loserTeamId(node, byId)).toBe(FRA.id);
  });

  it('away win: the rule tracks winner "away" too (not hard-coded to home)', () => {
    const node = koNode(teamRef(ARG), teamRef(FRA));
    const byId = mapOf(koMatch({ score: makeScore({ home: 1, away: 2, winner: 'away' }) }));

    const ref = winnerTeamRef(node, byId);
    expect(ref!).toEqual(teamRef(FRA));
    expect(winnerTeamId(node, byId)).toBe(FRA.id);
    // ref and id agree on the away side; the loser is now the home side.
    expect(isResolved(ref!) && ref!.team.id).toBe(winnerTeamId(node, byId));
    expect(loserTeamId(node, byId)).toBe(ARG.id);
  });
});

describe('resolve-teams — undecided → all null [Test 2 / Acceptance #4]', () => {
  const node = koNode(teamRef(ARG), teamRef(FRA));

  it('live match (winner null, goals present) → winnerTeamRef / winnerTeamId / loserTeamId all null', () => {
    const byId = mapOf(koMatch({ status: 'live', score: makeScore({ winner: null }) }));
    expect(winnerTeamRef(node, byId)).toBeNull();
    expect(winnerTeamId(node, byId)).toBeNull();
    expect(loserTeamId(node, byId)).toBeNull();
  });

  it('scheduled match (no goals) → all null', () => {
    const byId = mapOf(
      koMatch({
        status: 'scheduled',
        score: makeScore({ home: null, away: null, resolution: null, winner: null }),
      }),
    );
    expect(winnerTeamRef(node, byId)).toBeNull();
    expect(winnerTeamId(node, byId)).toBeNull();
    expect(loserTeamId(node, byId)).toBeNull();
  });

  it('drawn (finished, winner "draw") → all null', () => {
    const byId = mapOf(koMatch({ score: makeScore({ home: 1, away: 1, winner: 'draw' }) }));
    expect(winnerTeamRef(node, byId)).toBeNull();
    expect(winnerTeamId(node, byId)).toBeNull();
    expect(loserTeamId(node, byId)).toBeNull();
  });

  it('no Match for the node (missing id) → all null', () => {
    const node = koNode(teamRef(ARG), teamRef(FRA), 'wc2026-orphan');
    const byId = mapOf(koMatch()); // keyed under a DIFFERENT id → lookup miss
    expect(winnerTeamRef(node, byId)).toBeNull();
    expect(winnerTeamId(node, byId)).toBeNull();
    expect(loserTeamId(node, byId)).toBeNull();
  });
});

describe('resolve-teams — unresolved winner fallback [Test 3 / M1 / Acceptance #4]', () => {
  it('finished match whose WINNING side is a placeholderRef → winnerTeamRef null AND winnerTeamId null (agree)', () => {
    // winner: 'home', but the home side is still a placeholder (real FIFA data the
    // mock never produces). The shared `isResolved` guard must drop it to null —
    // a regression that returns the placeholder as the "winner" is caught here.
    const node = koNode(placeholderRef('Winner M49'), teamRef(FRA));
    const byId = mapOf(koMatch({ home: placeholderRef('Winner M49'), score: REGULAR_WIN }));

    expect(winnerTeamRef(node, byId)).toBeNull();
    expect(winnerTeamId(node, byId)).toBeNull();
    // Agreement preserved: both winner exports are null on the same input.
    expect(winnerTeamRef(node, byId) === null).toBe(winnerTeamId(node, byId) === null);
    // The losing side IS resolved → loserTeamId still returns it (only the winner
    // side is unresolved here), proving the guard is winner-side-specific.
    expect(loserTeamId(node, byId)).toBe(FRA.id);
  });
});

describe('resolve-teams — purity [Test 4]', () => {
  it('on a deeply-frozen node + match map: stable result, no throw, no mutation', () => {
    const node = deepFreeze(koNode(teamRef(ARG), teamRef(FRA)));
    const byId = deepFreeze(mapOf(koMatch({ score: REGULAR_WIN })));

    let first: TeamRef | null = null;
    expect(() => {
      first = winnerTeamRef(node, byId);
    }).not.toThrow();
    // `second` has the inferred TeamRef|null type (the closure-assigned `first` is
    // narrowed to null by TS) — assert the resolved id off it, equality off both.
    const second = winnerTeamRef(node, byId);
    expect(isResolved(second!) && second!.team.id, 'resolves the ARG winner').toBe(ARG.id);
    // Deterministic + immutable: identical resolved ref across calls.
    expect(second).toEqual(first);
  });
});
