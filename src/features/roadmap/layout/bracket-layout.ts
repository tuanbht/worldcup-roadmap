import { hierarchy, tree } from 'd3-hierarchy';
import type { Bracket, BracketNode } from '@/domain/types';
import { LEAF_PITCH_X, STAGE_PITCH_Y, type XY } from './layout-constants';

/**
 * Vertical top->bottom knockout coordinates keyed by `matchId`, computed with
 * `d3-hierarchy`'s `d3.tree` (library-first per the stack policy).
 *
 *  - root = the FINAL node; a node's children are the bracket nodes its two
 *    `winnerOf` feeders reference, enumerated in `[home, away]` (== structural
 *    `slot*2 / slot*2+1`) order so `d3.tree`'s parent.x lands on the structural
 *    midpoint the spec asserts;
 *  - stage depth -> Y, flipped so R32 leaves (deepest) sit at the top and the
 *    FINAL (depth 0) at the bottom, one `STAGE_PITCH_Y` apart;
 *  - x normalized to start at 0; `THIRD_PLACE` (not in the winner tree) is placed
 *    beside the normalized Final.
 *
 * All nodes offset below the group band by `bandOffsetY`. Pure; O(n).
 */
export function computeBracketLayout(bracket: Bracket, bandOffsetY: number): Map<string, XY> {
  const nodeByMatchId = new Map<string, BracketNode>();
  let finalNode: BracketNode | undefined;
  let thirdNode: BracketNode | undefined;
  for (const round of bracket.rounds) {
    for (const node of round.nodes) {
      nodeByMatchId.set(node.matchId, node);
      if (node.stage === 'FINAL') finalNode = node;
      if (node.stage === 'THIRD_PLACE') thirdNode = node;
    }
  }
  if (!finalNode) throw new Error('bracket invariant: FINAL round missing');

  /** Children = the two `winnerOf` feeders in [home, away] (slot) order. */
  const childrenOf = (node: BracketNode): BracketNode[] =>
    [node.home, node.away]
      .map((slot) => (slot.source.kind === 'winnerOf' ? slot.source.matchId : null))
      .filter((id): id is string => id !== null)
      .map((id) => nodeByMatchId.get(id))
      .filter((n): n is BracketNode => n !== undefined);

  const root = hierarchy<BracketNode>(finalNode, childrenOf);
  tree<BracketNode>().nodeSize([LEAF_PITCH_X, STAGE_PITCH_Y])(root);

  const maxDepth = root.height; // R32 leaves
  const descendants = root.descendants();
  // `d3.tree` assigns numeric x to every node after the layout pass; the typings
  // mark it optional, so read through a 0 fallback to satisfy the compiler.
  const xOf = (n: { x?: number }): number => n.x ?? 0;
  const minX = Math.min(...descendants.map(xOf));

  const layout = new Map<string, XY>();
  for (const n of descendants) {
    layout.set(n.data.matchId, {
      x: xOf(n) - minX,
      y: bandOffsetY + (maxDepth - n.depth) * STAGE_PITCH_Y,
    });
  }

  // THIRD_PLACE is outside the winner tree: place it beside the normalized Final.
  if (thirdNode) {
    const final = layout.get(finalNode.matchId)!;
    layout.set(thirdNode.matchId, { x: final.x + LEAF_PITCH_X, y: final.y });
  }

  return layout;
}
