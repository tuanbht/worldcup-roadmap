import { hierarchy, tree } from 'd3-hierarchy';
import type { BracketNode, Match, Tournament } from '@/domain/types';
import { dayKey } from './day-axis';
import { DAY_ROW_PITCH, HEADER_H, LEAF_X_PITCH, type XY } from './layout-constants';

/** All edges flow downward, so a parent always sits below both its children. */
function rowY(dayIndex: ReadonlyMap<string, number>, kickoff: string): number {
  return HEADER_H + (dayIndex.get(dayKey(kickoff)) ?? 0) * DAY_ROW_PITCH;
}

/** Children = the two `winnerOf` feeders in [home, away] (slot) order. */
function winnerChildrenOf(node: BracketNode, byMatchId: Map<string, BracketNode>): BracketNode[] {
  return [node.home, node.away]
    .map((slot) => (slot.source.kind === 'winnerOf' ? slot.source.matchId : null))
    .filter((id): id is string => id !== null)
    .map((id) => byMatchId.get(id))
    .filter((n): n is BracketNode => n !== undefined);
}

/**
 * Center-converging knockout funnel keyed by `matchId`.
 *
 *  - X: a d3-hierarchy fan-in rooted at the FINAL (children = its `winnerOf`
 *    feeders in slot order), so each parent's x is the midpoint of its two
 *    children. The R32 leaves are spaced `LEAF_X_PITCH` apart, then re-centered so
 *    they are symmetric about `cx` (mean = cx) and the Final lands at `cx`.
 *  - Y: every node's REAL day-row on the shared axis, looked up via its kickoff in
 *    `tournament.matches`. Because a parent is played after both feeders,
 *    `parent.y > child.y`, so edges always flow downward.
 *  - THIRD_PLACE (outside the winner tree) sits x-adjacent to the Final
 *    (`x = Final.x + LEAF_X_PITCH`) at its own real day-row.
 *
 * Pure; O(n).
 */
export function computeKnockoutFunnelLayout(
  tournament: Tournament,
  dayIndex: ReadonlyMap<string, number>,
  cx: number,
): ReadonlyMap<string, XY> {
  const byMatchId = new Map<string, BracketNode>();
  let finalNode: BracketNode | undefined;
  let thirdNode: BracketNode | undefined;
  for (const round of tournament.bracket.rounds) {
    for (const node of round.nodes) {
      byMatchId.set(node.matchId, node);
      if (node.stage === 'FINAL') finalNode = node;
      if (node.stage === 'THIRD_PLACE') thirdNode = node;
    }
  }
  if (!finalNode) throw new Error('bracket invariant: FINAL round missing');

  const koKickoff = new Map<string, string>(
    tournament.matches.filter((m) => m.stage !== 'GROUP_STAGE').map((m) => [m.id, m.kickoff]),
  );

  const root = hierarchy<BracketNode>(finalNode, (n) => winnerChildrenOf(n, byMatchId));
  // nodeSize x = LEAF_X_PITCH gives the leaves that spacing; y unused (Y is the
  // real day-row), so any positive value works. A flat separation of 1 keeps ALL
  // leaves evenly LEAF_X_PITCH apart (d3's default doubles the gap across cousins).
  tree<BracketNode>()
    .nodeSize([LEAF_X_PITCH, 1])
    .separation(() => 1)(root);

  const descendants = root.descendants();
  const xOf = (n: { x?: number }): number => n.x ?? 0;
  const leaves = root.leaves();
  const leafMean = leaves.reduce((sum, n) => sum + xOf(n), 0) / leaves.length;
  // Shift so the leaf mean (== the balanced tree's root x) sits on cx.
  const shift = cx - leafMean;

  const layout = new Map<string, XY>();
  for (const n of descendants) {
    const kickoff = koKickoff.get(n.data.matchId);
    layout.set(n.data.matchId, {
      x: xOf(n) + shift,
      y: kickoff ? rowY(dayIndex, kickoff) : HEADER_H,
    });
  }

  if (thirdNode) {
    const final = layout.get(finalNode.matchId)!;
    const kickoff = koKickoff.get(thirdNode.matchId);
    layout.set(thirdNode.matchId, {
      x: final.x + LEAF_X_PITCH,
      y: kickoff ? rowY(dayIndex, kickoff) : final.y,
    });
  }

  return layout;
}
