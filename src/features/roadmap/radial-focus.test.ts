// Unit spec for the PURE radial team-focus selector `selectRadialTeamFocus`
// (requirement 2026-06-30-1104; plan Test Strategy 15-16 / Acceptance #7) [C2].
//
// In the circle view, focusing a team lights its INWARD path to the center:
//   - its R32 badge node id(s)  (`badge-<r32MatchId>-<side>`),
//   - the R32 dot it plays in   (node id === the R32 matchId),
//   - every ancestor dot up to the Final (the winner-tree parents of that R32
//     node, ending at the Final/center),
//   - the `radial-<child>-<parent>` edge ids on that path,
// and NOTHING off that path. An unknown/unresolved team yields empty sets.
//
// The expected path is RECONSTRUCTED from the fixture's winner tree (not
// hardcoded): from the R32 nodes the team plays, walk parent links to the Final.
// RED until radial-focus.ts is implemented (today the stub throws "not
// implemented"), so each assertion fails for the right reason.
import { describe, expect, it } from 'vitest';
import { selectRadialTeamFocus } from './radial-focus';
import {
  badgeNodeId,
  finalBracketNode,
  loadTournament,
  r32Nodes,
  radialEdgeId,
  winnerTreeLinks,
  winnerTreeNodes,
  winnerTreeParentByChild,
} from './__test-support__/roadmap-fixtures';
import { teamIdOfRef } from './team-focus';
import type { BracketNode } from '@/domain/types';

const tournament = loadTournament();
const treeNodes = winnerTreeNodes(tournament);
const finalNode = finalBracketNode(tournament);

// team-ARG resolves into R32 #1 -> R16 #1 in the mock (per team-focus.test.ts).
const ARG = 'team-ARG';

/** Parent of a winner-tree node, or undefined at the Final root. */
const parentOf = winnerTreeParentByChild(tournament);

/** Independent oracle: the inward path NODE ids + EDGE ids for a resolved team.
 *  Walk every R32 node whose RESOLVED home/away is the team, then climb parents
 *  to the Final, collecting badge ids, dot/center ids, and radial edge ids. */
function oraclePath(teamId: string): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  for (const r32 of r32Nodes(tournament)) {
    const sides = (['home', 'away'] as const).filter(
      (s) => teamIdOfRef(s === 'home' ? r32.home.team : r32.away.team) === teamId,
    );
    if (sides.length === 0) continue;
    // Its badge(s) on the outer ring.
    for (const side of sides) nodeIds.add(badgeNodeId(r32.matchId, side));
    // Climb child -> parent up to the Final, adding each dot + radial edge.
    let node: BracketNode | undefined = r32;
    nodeIds.add(node.matchId); // the R32 dot itself
    while (node) {
      const parent = parentOf.get(node.matchId);
      if (!parent) break;
      nodeIds.add(parent.matchId);
      edgeIds.add(radialEdgeId(node.matchId, parent.matchId));
      node = parent;
    }
  }
  return { nodeIds, edgeIds };
}

describe('selectRadialTeamFocus — inward path for a known team [Test 15 / Acceptance #7]', () => {
  it("returns the team's badge(s), R32 dot, ancestor dots up to the Final, and the radial edges on the path", () => {
    const oracle = oraclePath(ARG);
    // Fixture self-checks: the path is non-trivial and reaches the center.
    expect(oracle.nodeIds.size, 'ARG must have a non-empty inward path').toBeGreaterThan(0);
    expect(oracle.nodeIds.has(finalNode.matchId), 'the path reaches the Final').toBe(true);
    expect(oracle.edgeIds.size, 'the path has radial edges').toBeGreaterThan(0);

    const focus = selectRadialTeamFocus(tournament, ARG);
    expect(new Set(focus.nodeIds)).toEqual(oracle.nodeIds);
    expect(new Set(focus.edgeIds)).toEqual(oracle.edgeIds);
  });

  it('includes the R32 badge id with the correct side and excludes nodes off the path', () => {
    const focus = selectRadialTeamFocus(tournament, ARG);
    // ARG enters the R32 it actually plays (fixture-derived, NOT a hardcoded
    // index): the deterministic mock seeds ARG into `wc2026-r32-7` (see
    // team-focus.test.ts). At least one of its two badge ids is on the path.
    const r32Arg = r32Nodes(tournament).find(
      (n) => teamIdOfRef(n.home.team) === ARG || teamIdOfRef(n.away.team) === ARG,
    );
    expect(r32Arg, 'ARG plays an R32 match in the fixture').toBeDefined();
    const argSide = (['home', 'away'] as const).find(
      (s) => teamIdOfRef(s === 'home' ? r32Arg!.home.team : r32Arg!.away.team) === ARG,
    );
    expect(argSide, 'ARG plays a side of its R32 match in the fixture').toBeDefined();
    expect(focus.nodeIds.has(badgeNodeId(r32Arg!.matchId, argSide!))).toBe(true);
    // A KO match in the OTHER half of the bracket is NOT on ARG's inward path —
    // neither its dot node NOR its inward radial edge are lit.
    const offPath = treeNodes.find(
      (n) => !focus.nodeIds.has(n.matchId) && n.stage === 'ROUND_OF_32',
    );
    expect(offPath, 'an off-path R32 node exists').toBeDefined();
    expect(focus.nodeIds.has(offPath!.matchId)).toBe(false);
    const offParent = parentOf.get(offPath!.matchId);
    expect(offParent, 'the off-path R32 node has a parent').toBeDefined();
    expect(focus.edgeIds.has(radialEdgeId(offPath!.matchId, offParent!.matchId))).toBe(false);
  });

  it('lights every dot on the inward path and nothing else, edges 1:1 with the path', () => {
    const oracle = oraclePath(ARG);
    const focus = selectRadialTeamFocus(tournament, ARG);
    // Each radial edge on the path connects two focused dots/center (path is a
    // simple chain): #edges === #ancestor hops === #dots-on-path − #badges.
    expect(focus.edgeIds).toEqual(oracle.edgeIds);
    expect(focus.edgeIds.size).toBeGreaterThan(0);
    // Reconstruct each lit edge's (child, parent) match ids from the winner tree
    // — NOT a hyphen split of the id, since match ids themselves contain hyphens
    // (`wc2026-r32-7`), so `radial-<child>-<parent>` is not regex-splittable. The
    // intent is preserved: every lit edge's BOTH endpoints are lit nodes.
    for (const id of focus.edgeIds) {
      expect(id.startsWith('radial-'), `edge id grammar for ${id}`).toBe(true);
      const link = winnerTreeLinks(tournament).find(
        ({ child, parent }) => radialEdgeId(child.matchId, parent.matchId) === id,
      );
      expect(link, `a winner-tree link for ${id}`).toBeDefined();
      // The CHILD + PARENT endpoint of every lit edge is itself a lit node (no dangling edge).
      expect(focus.nodeIds.has(link!.child.matchId)).toBe(true);
      expect(focus.nodeIds.has(link!.parent.matchId)).toBe(true);
    }
  });
});

describe('selectRadialTeamFocus — unknown/unresolved team [Test 16]', () => {
  it('returns empty node + edge sets for an unknown team id (no throw)', () => {
    const focus = selectRadialTeamFocus(tournament, 'no-such-team');
    expect(focus.nodeIds.size).toBe(0);
    expect(focus.edgeIds.size).toBe(0);
  });

  it('returns empty sets for an empty team id', () => {
    const focus = selectRadialTeamFocus(tournament, '');
    expect(focus.nodeIds.size).toBe(0);
    expect(focus.edgeIds.size).toBe(0);
  });
});
