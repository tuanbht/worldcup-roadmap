import { describe, expect, it } from 'vitest';
import { computeKnockoutFunnelLayout } from './bracket-layout';
import { computeDayIndex } from './day-axis';
import { CX, centerline, HEADER_H, DAY_ROW_PITCH, LEAF_X_PITCH, type XY } from './layout-constants';
import {
  allBracketNodes,
  deepFreeze,
  fixtureDayKey,
  koMatchById,
  loadTournament,
  winnerChildren,
} from '../__test-support__/roadmap-fixtures';
import type { BracketNode } from '@/domain/types';

/**
 * Spec for the NEW center-converging knockout funnel (`computeKnockoutFunnelLayout`):
 * every KO node's `y` is its REAL day-row on the shared axis, `x` is a fan-in
 * centered on the grid centerline `CX`, each parent `x` = midpoint of its two
 * winner-children, the Final lands at center-bottom and THIRD_PLACE sits x-adjacent.
 * Requirement "Coordinate model > Knockout zone X"; plan Test Strategy 11-16 /
 * Acceptance #7, #8.
 *
 * RED until `computeKnockoutFunnelLayout` exists. Loads the FULL tournament so
 * the real KO kickoffs (not synthetic) drive the day-rows.
 */

const tournament = loadTournament();
const bracket = tournament.bracket;
const allNodes = allBracketNodes(bracket);
const totalNodes = allNodes.length; // 32 (incl. THIRD_PLACE)
const koMatch = koMatchById(tournament);

// Built lazily inside each test (via `layout()`), so an unimplemented
// `computeDayIndex`/`computeKnockoutFunnelLayout` fails each assertion
// individually instead of collapsing the whole file at import.
function dayIndex(): ReadonlyMap<string, number> {
  return computeDayIndex(tournament.matches);
}

const nodeByMatchId = new Map(allNodes.map((n) => [n.matchId, n]));
const finalNode = bracket.rounds.find((r) => r.stage === 'FINAL')!.nodes[0];
const thirdNode = bracket.rounds.find((r) => r.stage === 'THIRD_PLACE')!.nodes[0];

/** Internal (winner-tree) nodes the midpoint rule applies to — fixture-derived. */
const internalNodes = allNodes.filter(
  (n) => n.stage !== 'THIRD_PLACE' && winnerChildren(n, nodeByMatchId).length === 2,
);

const KO_STAGES = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'] as const;

function layout(): ReadonlyMap<string, XY> {
  return computeKnockoutFunnelLayout(tournament, dayIndex(), CX);
}

function pos(map: ReadonlyMap<string, XY>, matchId: string): XY {
  const p = map.get(matchId);
  expect(p, `expected a position for ${matchId}`).toBeDefined();
  return p!;
}

/** Expected real day-row y for a KO node, looked up via its match kickoff. */
function rowY(matchId: string): number {
  const m = koMatch.get(matchId)!;
  return HEADER_H + dayIndex().get(fixtureDayKey(m.kickoff))! * DAY_ROW_PITCH;
}

/** Min/max x spread of a stage's nodes (the round's leaf-span). */
function spanOfStage(map: ReadonlyMap<string, XY>, stage: string): number {
  const round = bracket.rounds.find((r) => r.stage === stage)!;
  const xs = round.nodes.map((n) => pos(map, n.matchId).x);
  return Math.max(...xs) - Math.min(...xs);
}

describe('computeKnockoutFunnelLayout — coverage', () => {
  it('positions every bracket node (32 incl. THIRD_PLACE)', () => {
    const map = layout();
    expect(map.size).toBe(totalNodes);
    for (const n of allNodes) expect(map.has(n.matchId)).toBe(true);
  });
});

describe('computeKnockoutFunnelLayout — real day-row y [Acceptance #7/#8]', () => {
  it('sets every KO node y to its REAL day-row on the shared axis', () => {
    const map = layout();
    for (const n of allNodes) {
      expect(pos(map, n.matchId).y).toBe(rowY(n.matchId));
    }
  });

  it('gives the Final the max y among KO nodes (center-bottom)', () => {
    const map = layout();
    const finalY = pos(map, finalNode.matchId).y;
    const maxY = Math.max(...allNodes.map((n) => pos(map, n.matchId).y));
    expect(finalY).toBe(maxY);
  });

  it('keeps every advance pair flowing downward: parent.y > child.y', () => {
    const map = layout();
    for (const parent of internalNodes) {
      for (const child of winnerChildren(parent, nodeByMatchId)) {
        expect(pos(map, parent.matchId).y).toBeGreaterThan(pos(map, child.matchId).y);
      }
    }
  });
});

describe('computeKnockoutFunnelLayout — midpoint fan-in [Acceptance #7]', () => {
  it("sets each internal parent x to the midpoint of its two children's x", () => {
    const map = layout();
    expect(internalNodes.length).toBe(15); // R16(8)+QF(4)+SF(2)+FINAL(1), fixture-derived
    for (const node of internalNodes) {
      const [a, b] = winnerChildren(node, nodeByMatchId);
      const mid = (pos(map, a.matchId).x + pos(map, b.matchId).x) / 2;
      expect(pos(map, node.matchId).x).toBeCloseTo(mid, 6);
    }
  });

  it('spreads the R32 leaves over distinct x with LEAF_X_PITCH spacing', () => {
    const map = layout();
    const r32 = bracket.rounds.find((r) => r.stage === 'ROUND_OF_32')!;
    const leafXs = r32.nodes.map((n) => pos(map, n.matchId).x);
    expect(new Set(leafXs).size).toBe(leafXs.length); // distinct
    const ascending = [...leafXs].sort((a, b) => a - b);
    for (let i = 1; i < ascending.length; i += 1) {
      expect(ascending[i] - ascending[i - 1]).toBeCloseTo(LEAF_X_PITCH, 6);
    }
  });

  it('centers the funnel on the exported CX: Final x ≈ CX, and centerline(12) === CX', () => {
    const map = layout();
    expect(centerline(12)).toBe(CX); // single source of truth [Rev2:M1]
    expect(pos(map, finalNode.matchId).x).toBeCloseTo(CX, 6);
    // R32 leaves are symmetric about CX -> their mean is CX too.
    const r32 = bracket.rounds.find((r) => r.stage === 'ROUND_OF_32')!;
    const xs = r32.nodes.map((n) => pos(map, n.matchId).x);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeCloseTo(CX, 6);
  });

  it('narrows monotonically per round: span(R32) > R16 > QF > SF >= FINAL [Rev2:M2]', () => {
    const map = layout();
    const spans = KO_STAGES.map((s) => spanOfStage(map, s));
    // R32 is the widest round (the fan-in's mouth) -> a positive span.
    expect(spans[0]).toBeGreaterThan(0);
    // Each successive round's x-spread is strictly narrower than the round above
    // it, so "the funnel reads" is a test, not prose. Names the failing pair.
    for (let i = 1; i < spans.length - 1; i += 1) {
      expect(spans[i], `${KO_STAGES[i]} span must be < ${KO_STAGES[i - 1]}`).toBeLessThan(
        spans[i - 1],
      );
    }
    // FINAL is a single node -> span 0 -> SF span >= FINAL span.
    expect(spans[KO_STAGES.length - 2]).toBeGreaterThanOrEqual(spans[KO_STAGES.length - 1]);
    expect(spans[KO_STAGES.length - 1]).toBe(0); // FINAL: one node, zero spread.
  });
});

describe('computeKnockoutFunnelLayout — THIRD_PLACE [Q1]', () => {
  it('sits x-adjacent to the Final (x = Final.x + LEAF_X_PITCH) at its OWN real day-row', () => {
    const map = layout();
    const finalXY = pos(map, finalNode.matchId);
    const thirdXY = pos(map, thirdNode.matchId);
    expect(thirdXY.x).toBeCloseTo(finalXY.x + LEAF_X_PITCH, 6);
    // Real kickoff Jul 18 vs Final Jul 19 -> THIRD_PLACE sits on its OWN, earlier
    // day-row (x-adjacent to the Final, NOT forced onto the Final's row).
    expect(thirdXY.y).toBe(rowY(thirdNode.matchId));
    expect(thirdXY.y).toBeLessThan(finalXY.y);
  });
});

describe('computeKnockoutFunnelLayout — purity', () => {
  it('produces structurally-equal output across calls and tolerates a frozen tournament', () => {
    const frozen = deepFreeze(loadTournament());
    const frozenIndex = computeDayIndex(frozen.matches);
    const a = computeKnockoutFunnelLayout(frozen, frozenIndex, CX);
    const b = computeKnockoutFunnelLayout(frozen, frozenIndex, CX);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });
});
