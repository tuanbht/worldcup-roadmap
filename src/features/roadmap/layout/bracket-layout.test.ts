import { describe, expect, it } from 'vitest';
import { computeBracketLayout } from './bracket-layout';
import { LEAF_PITCH_X, STAGE_PITCH_Y, type XY } from './layout-constants';
import { allBracketNodes, deepFreeze, loadBracket } from '../__test-support__/roadmap-fixtures';
import type { BracketNode, BracketSlot } from '@/domain/types';

/**
 * Spec for the NEW vertical, top->bottom knockout layout (Acceptance #4).
 *
 * Rewritten from the old mirrored/horizontal characterization. Stage depth -> Y
 * (R32 minimal/top, FINAL maximal/bottom); each parent X = midpoint of its two
 * STRUCTURAL children (resolved via `source.kind==='winnerOf'` in slotIndex
 * order). THIRD_PLACE sits beside the Final and is excluded from the midpoint
 * assertion. All nodes offset below the group band by `bandOffsetY`.
 *
 * RED until the d3-hierarchy vertical layout is implemented.
 */

const BAND_OFFSET = 1234; // arbitrary, distinct from any pitch constant

const bracket = loadBracket();
const allNodes = allBracketNodes(bracket);
const totalNodes = allNodes.length; // 32 (incl. THIRD_PLACE)

const STAGE_DEPTH: Record<string, number> = {
  ROUND_OF_32: 0,
  ROUND_OF_16: 1,
  QUARTER_FINALS: 2,
  SEMI_FINALS: 3,
  FINAL: 4,
};
/** Stages, deepest (top of the bracket) to shallowest (the Final), by depth. */
const stagesByDepth = Object.keys(STAGE_DEPTH).sort((a, b) => STAGE_DEPTH[a] - STAGE_DEPTH[b]);

const nodeByMatchId = new Map(allNodes.map((n) => [n.matchId, n]));
const finalNode = bracket.rounds.find((r) => r.stage === 'FINAL')!.nodes[0];
const thirdNode = bracket.rounds.find((r) => r.stage === 'THIRD_PLACE')!.nodes[0];

/** A bracket layout is required to position every node it is given. */
function pos(layout: Map<string, XY>, matchId: string): XY {
  const p = layout.get(matchId);
  expect(p, `expected a position for ${matchId}`).toBeDefined();
  return p!;
}

/** Children of a node = its two `winnerOf` feeders in [home, away] (slot) order. */
function winnerChildren(node: BracketNode): BracketNode[] {
  const matchIdOf = (slot: BracketSlot): string | null =>
    slot.source.kind === 'winnerOf' ? slot.source.matchId : null;
  return [node.home, node.away]
    .map(matchIdOf)
    .filter((id): id is string => id !== null)
    .map((id) => nodeByMatchId.get(id))
    .filter((n): n is BracketNode => n !== undefined);
}

/** Internal (winner-tree) nodes the midpoint rule applies to — fixture-derived. */
const internalNodes = allNodes.filter(
  (n) => n.stage !== 'THIRD_PLACE' && winnerChildren(n).length === 2,
);

/** One representative y per stage (a stage shares one y row); excludes THIRD_PLACE. */
function yByStage(layout: Map<string, XY>): Map<string, number> {
  const map = new Map<string, number>();
  for (const round of bracket.rounds) {
    if (round.stage === 'THIRD_PLACE') continue;
    map.set(round.stage, pos(layout, round.nodes[0].matchId).y);
  }
  return map;
}

describe('computeBracketLayout (vertical) — coverage & depth', () => {
  it('positions every bracket node (32 incl. THIRD_PLACE)', () => {
    const layout = computeBracketLayout(bracket, BAND_OFFSET);
    expect(layout.size).toBe(totalNodes);
    for (const n of allNodes) expect(layout.has(n.matchId)).toBe(true);
  });

  it('increases y monotonically with stage depth (R32 top -> FINAL bottom)', () => {
    const ys = yByStage(computeBracketLayout(bracket, BAND_OFFSET));
    const rowYs = stagesByDepth.map((s) => ys.get(s)!);
    for (let i = 1; i < rowYs.length; i += 1) {
      expect(rowYs[i]).toBeGreaterThan(rowYs[i - 1]);
    }
    expect(Math.min(...rowYs)).toBe(ys.get('ROUND_OF_32'));
    expect(Math.max(...rowYs)).toBe(ys.get('FINAL'));
  });

  it('keeps each stage on a single shared y row, one STAGE_PITCH_Y apart', () => {
    const layout = computeBracketLayout(bracket, BAND_OFFSET);
    for (const round of bracket.rounds) {
      if (round.stage === 'THIRD_PLACE') continue;
      const ys = round.nodes.map((n) => pos(layout, n.matchId).y);
      expect(new Set(ys).size).toBe(1);
    }
    const ys = yByStage(layout);
    for (let i = 1; i < stagesByDepth.length; i += 1) {
      expect(ys.get(stagesByDepth[i])! - ys.get(stagesByDepth[i - 1])!).toBe(STAGE_PITCH_Y);
    }
  });
});

describe('computeBracketLayout (vertical) — midpoint fan-in', () => {
  it('spreads the R32 leaves across distinct, strictly increasing x', () => {
    const layout = computeBracketLayout(bracket, BAND_OFFSET);
    const r32 = bracket.rounds.find((r) => r.stage === 'ROUND_OF_32')!;
    const leafXs = r32.nodes.map((n) => pos(layout, n.matchId).x);
    expect(new Set(leafXs).size).toBe(leafXs.length); // distinct, so midpoints are meaningful
    const ascending = [...leafXs].sort((a, b) => a - b);
    expect(leafXs).toEqual(ascending); // structural slot order == left->right
  });

  it("sets each internal parent x to the midpoint of its two children's x", () => {
    const layout = computeBracketLayout(bracket, BAND_OFFSET);
    // Fixture-derived: R16(8) + QF(4) + SF(2) + FINAL(1) = 15 winner-tree parents.
    expect(internalNodes.length).toBe(15);
    for (const node of internalNodes) {
      const [a, b] = winnerChildren(node);
      const mid = (pos(layout, a.matchId).x + pos(layout, b.matchId).x) / 2;
      expect(pos(layout, node.matchId).x).toBeCloseTo(mid, 6);
    }
  });
});

describe('computeBracketLayout (vertical) — third place & normalization', () => {
  it('places THIRD_PLACE beside the Final: same y, one LEAF_PITCH_X to the right', () => {
    const layout = computeBracketLayout(bracket, BAND_OFFSET);
    const finalXY = pos(layout, finalNode.matchId);
    const thirdXY = pos(layout, thirdNode.matchId);
    expect(thirdXY.y).toBe(finalXY.y);
    expect(thirdXY.x).toBeCloseTo(finalXY.x + LEAF_PITCH_X, 6);
  });

  it('normalizes x>=0 and keeps every y at or below bandOffsetY', () => {
    const layout = computeBracketLayout(bracket, BAND_OFFSET);
    for (const n of allNodes) {
      const p = pos(layout, n.matchId);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(BAND_OFFSET);
    }
    // the shallowest node actually sits exactly on the band offset row (no slack above).
    const minY = Math.min(...allNodes.map((n) => pos(layout, n.matchId).y));
    expect(minY).toBe(BAND_OFFSET);
  });

  it('honors bandOffsetY: a different offset shifts every y by exactly the delta, x unchanged', () => {
    const delta = 500;
    const a = computeBracketLayout(bracket, BAND_OFFSET);
    const b = computeBracketLayout(bracket, BAND_OFFSET + delta);
    for (const n of allNodes) {
      expect(pos(b, n.matchId).y - pos(a, n.matchId).y).toBe(delta);
      expect(pos(b, n.matchId).x).toBe(pos(a, n.matchId).x);
    }
  });
});

describe('computeBracketLayout (vertical) — purity', () => {
  it('produces structurally-equal output across calls and does not mutate a frozen bracket', () => {
    const frozen = deepFreeze(loadBracket());
    const a = computeBracketLayout(frozen, BAND_OFFSET);
    const b = computeBracketLayout(frozen, BAND_OFFSET);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });
});
