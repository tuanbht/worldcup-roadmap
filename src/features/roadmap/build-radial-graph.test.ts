// Unit spec for `buildRadialGraph(tournament)` — the circle-mode node/edge SET
// (requirement 2026-06-30-1104; plan Test Strategy 9-14 / Acceptance #1, #3, #5).
//
// The circle graph is KNOCKOUT-ONLY: 32 `team-badge` nodes on an outer ring
// (equiangular at 2π/32), one `match-dot` per non-Final KO match, one
// `final-center`, and `radial` child→parent edges (`radial-<child>-<parent>`)
// carrying `state` from the child match status + `cx,cy` on their data [M1]. NO
// group/standings/day-marker nodes; THIRD_PLACE omitted. A badge is `eliminated`
// exactly when its team is the SHARED `loserTeamId` of its R32 match [M3].
//
// Every count/id is FIXTURE-DERIVED from the validated mock tournament + the real
// built graph, never hardcoded. The graph is rebuilt INSIDE each test so an
// unimplemented builder fails each assertion individually as "not implemented".
import { describe, expect, it } from 'vitest';
import { buildRadialGraph } from './build-radial-graph';
import { loserTeamId } from '@/domain/bracket/resolve-teams';
import { HALF_GAP } from './layout/radial-constants';
import {
  badgeNodeId,
  deepFreeze,
  expectedBadgeCount,
  finalBracketNode,
  loadTournament,
  r32Nodes,
  r32ParticipantRefs,
  radialEdgeId,
  thirdPlaceBracketNode,
  winnerTreeLinks,
  winnerTreeNodes,
} from './__test-support__/roadmap-fixtures';
import type {
  FinalCenterFlowNode,
  MatchDotFlowNode,
  RadialEdgeData,
  RoadmapEdge,
  RoadmapGraph,
  RoadmapNode,
  TeamBadgeFlowNode,
} from './graph-model';
import { teamIdOfRef } from './team-focus';
import type { Match } from '@/domain/types';

const tournament = loadTournament();
const graph = (): RoadmapGraph => buildRadialGraph(tournament);

const treeNodes = winnerTreeNodes(tournament); // 31, THIRD_PLACE excluded
const matchById = new Map<string, Match>(tournament.matches.map((m) => [m.id, m]));
const finalNode = finalBracketNode(tournament);
const thirdNode = thirdPlaceBracketNode(tournament);
const r32 = r32Nodes(tournament);

const TAU = 2 * Math.PI;
const BADGE_STEP = TAU / 32; // the uniform sorted-badge spacing

const isBadge = (n: RoadmapNode): n is TeamBadgeFlowNode => n.type === 'team-badge';
const isDot = (n: RoadmapNode): n is MatchDotFlowNode => n.type === 'match-dot';
const isCenter = (n: RoadmapNode): n is FinalCenterFlowNode => n.type === 'final-center';
const nodesOfType = (type: string) => graph().nodes.filter((n) => n.type === type);

/** Angle of a node about the graph's center, derived from the edge data's cx,cy
 *  (the single center-of-truth the builder stamps) — θ measured as the layout
 *  uses it: x = cx + r·sin θ, y = cy − r·cos θ → θ = atan2(x−cx, cy−y). */
function angleAbout(node: RoadmapNode, cx: number, cy: number): number {
  const a = Math.atan2(node.position.x - cx, cy - node.position.y);
  return a < 0 ? a + TAU : a;
}

/** The (cx,cy) the builder stamps onto radial edges — one source of truth [M1]. */
function center(g: RoadmapGraph): { cx: number; cy: number } {
  const radial = g.edges.find((e) => e.id.startsWith('radial-'));
  expect(radial, 'expected at least one radial edge carrying cx,cy').toBeDefined();
  const data = radial!.data as RadialEdgeData;
  return { cx: data.cx, cy: data.cy };
}

describe('buildRadialGraph — team badges [Test 9 / Acceptance #1]', () => {
  it('emits exactly 32 team-badge nodes with UNIQUE ids badge-<r32MatchId>-<side>', () => {
    const badges = graph().nodes.filter(isBadge);
    expect(expectedBadgeCount(tournament)).toBe(32); // fixture self-check
    expect(badges).toHaveLength(32);
    // Ids are exactly the fixture's badge-<r32>-<side> set, all unique.
    const ids = badges.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    const expectedIds = new Set(
      r32ParticipantRefs(tournament).map((p) => badgeNodeId(p.matchId, p.side)),
    );
    expect(new Set(ids)).toEqual(expectedIds);
    // Each badge's data.matchId is its R32 match (what a click opens), id is NOT.
    for (const b of badges) {
      expect(b.id).toBe(badgeNodeId(b.data.matchId, b.data.side));
      expect(b.id).not.toBe(b.data.matchId);
    }
  });

  it('spaces the 32 sorted badge angles uniformly at 2π/32 (θ_dot ± HALF_GAP)', () => {
    const g = graph();
    const { cx, cy } = center(g);
    const angles = g.nodes
      .filter(isBadge)
      .map((b) => angleAbout(b, cx, cy))
      .sort((a, b) => a - b);
    expect(angles).toHaveLength(32);
    // HALF_GAP is the per-sector quarter offset; the first badge sits at 0.25·sector.
    expect(HALF_GAP).toBeCloseTo(TAU / 16 / 4, 9);
    for (let i = 1; i < angles.length; i += 1) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(BADGE_STEP, 6);
    }
    // No badge on the 0/2π seam (the seam gap is also a full 2π/32 step).
    const wrapGap = TAU - angles[angles.length - 1] + angles[0];
    expect(wrapGap).toBeCloseTo(BADGE_STEP, 6);
  });
});

describe('buildRadialGraph — dots + center, knockout only [Test 10 / Acceptance #5]', () => {
  it('emits one match-dot per non-Final KO match (30) and exactly one final-center', () => {
    const dots = graph().nodes.filter(isDot);
    const centers = graph().nodes.filter(isCenter);
    // 31 winner-tree nodes minus the FINAL == 30 inner-ring dots.
    expect(treeNodes.length - 1).toBe(30); // fixture self-check
    expect(dots).toHaveLength(30);
    expect(centers).toHaveLength(1);
    // The dots are exactly the non-Final winner-tree matches; node id === matchId.
    const dotIds = new Set(dots.map((d) => d.id));
    const expectedDotIds = new Set(
      treeNodes.filter((n) => n.matchId !== finalNode.matchId).map((n) => n.matchId),
    );
    expect(dotIds).toEqual(expectedDotIds);
    // The center carries the Final matchId so a click opens the Final's panel.
    expect(centers[0].id).toBe(finalNode.matchId);
    expect(centers[0].data.matchId).toBe(finalNode.matchId);
  });

  it('emits ZERO grid node types (no group cards, standings, or day markers)', () => {
    expect(nodesOfType('match')).toHaveLength(0);
    expect(nodesOfType('group-standings')).toHaveLength(0);
    expect(nodesOfType('day-marker')).toHaveLength(0);
  });
});

describe('buildRadialGraph — radial edges [Test 11 / Acceptance #3]', () => {
  /** Independent oracle: every child→parent winner link (30) in the tree. */
  const childParentLinks = winnerTreeLinks(tournament);

  it('emits one radial edge per child→parent winner link (30), id radial-<child>-<parent>', () => {
    const radial = graph().edges.filter((e) => e.id.startsWith('radial-'));
    expect(childParentLinks).toHaveLength(30); // fixture self-check
    expect(radial).toHaveLength(30);
    const expectedIds = new Set(
      childParentLinks.map(({ child, parent }) => radialEdgeId(child.matchId, parent.matchId)),
    );
    expect(new Set(radial.map((e) => e.id))).toEqual(expectedIds);
  });

  it('colors each radial edge by the CHILD match status (mirrors edgeState) + carries cx,cy [M1]', () => {
    const g = graph();
    const { cx, cy } = center(g);
    const nodeIds = new Set(g.nodes.map((n) => n.id));
    const radial = g.edges.filter((e: RoadmapEdge) => e.id.startsWith('radial-'));
    expect(radial.length).toBeGreaterThan(0); // guard: not vacuous
    const expectState = (status: Match['status'] | undefined): RadialEdgeData['state'] =>
      status === 'live' ? 'live' : status === 'finished' ? 'decided' : 'undecided';
    for (const edge of radial) {
      const m = edge.id.match(/^radial-(.+)-([^-]+)$/);
      expect(m, `radial id grammar for ${edge.id}`).not.toBeNull();
      // source = child, target = parent (child advances inward to its parent).
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
      const data = edge.data as RadialEdgeData;
      expect(data.state).toBe(expectState(matchById.get(edge.source)?.status));
      // The center is stamped identically on every radial edge (one source of truth).
      expect(data.cx).toBe(cx);
      expect(data.cy).toBe(cy);
    }
  });
});

describe('buildRadialGraph — THIRD_PLACE omitted [Test 12 / Q1]', () => {
  it('produces no node and no edge for the third-place match', () => {
    const g = graph();
    expect(g.nodes.some((n) => n.id === thirdNode.matchId)).toBe(false);
    expect(g.edges.some((e) => e.id.includes(thirdNode.matchId))).toBe(false);
  });
});

describe('buildRadialGraph — eliminated via shared loserTeamId [Test 13 / M3]', () => {
  it('marks a badge eliminated exactly when its team is the loserTeamId of its R32 match', () => {
    const badges = graph().nodes.filter(isBadge);
    const byBadgeId = new Map(badges.map((b) => [b.id, b]));
    // Independent oracle: the resolved loser of each finished R32 match (the mock
    // finishes every R32). Asserted via the SHARED helper, not re-derived here.
    let eliminatedSeen = 0;
    let survivorSeen = 0;
    for (const node of r32) {
      const lost = loserTeamId(node, matchById);
      for (const side of ['home', 'away'] as const) {
        const badge = byBadgeId.get(badgeNodeId(node.matchId, side));
        expect(badge, `badge for ${node.matchId}-${side}`).toBeDefined();
        const ref = side === 'home' ? node.home.team : node.away.team;
        const teamId = teamIdOfRef(ref);
        const shouldBeEliminated = lost !== null && teamId === lost;
        expect(badge!.data.eliminated, `eliminated for ${badge!.id}`).toBe(shouldBeEliminated);
        if (shouldBeEliminated) eliminatedSeen += 1;
        else survivorSeen += 1;
      }
    }
    // Guard against a vacuous all-false / all-true result: both branches occur.
    expect(eliminatedSeen, 'at least one eliminated badge').toBeGreaterThan(0);
    expect(survivorSeen, 'at least one surviving badge').toBeGreaterThan(0);
  });
});

describe('buildRadialGraph — immutability [Test 14]', () => {
  it('builds against a deeply-frozen tournament without throwing and is structurally stable', () => {
    const frozen = deepFreeze(loadTournament());
    let a: RoadmapGraph | undefined;
    expect(() => {
      a = buildRadialGraph(frozen);
    }).not.toThrow();
    const b = buildRadialGraph(frozen);
    // Same node + edge id sets across calls (deterministic).
    expect(new Set(a!.nodes.map((n) => n.id))).toEqual(new Set(b.nodes.map((n) => n.id)));
    expect(new Set(a!.edges.map((e) => e.id))).toEqual(new Set(b.edges.map((e) => e.id)));
  });
});
