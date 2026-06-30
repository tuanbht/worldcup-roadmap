/**
 * `buildRadialGraph(tournament)` → the circle-mode React Flow graph (knockout
 * ONLY):
 *   - 32 `team-badge` nodes (outer ring) with unique ids `badge-<r32MatchId>-<side>`,
 *     equiangular at 2π/32 (θ_dot ± HALF_GAP) on BADGE_RING_RADIUS,
 *   - one `match-dot` per non-Final KO match (R32 16 + R16 8 + QF 4 + SF 2 = 30),
 *   - one `final-center` node at (cx,cy),
 *   - `radial` edges child→parent (`radial-<child>-<parent>`), each carrying
 *     `state` from the child match status + `cx,cy` on its data [M1],
 *   - NO group/standings/day-marker nodes; THIRD_PLACE omitted (it is a `loserOf`
 *     node, unreachable from the FINAL winner tree).
 *
 * The `eliminated` flag of a badge comes from the SHARED `loserTeamId`
 * (`resolve-teams.ts`) — no re-derived winner→loser logic [M3].
 *
 * Immutable: returns new objects; never mutates the input tournament.
 */
import type { BracketNode, Match, TeamRef, Tournament } from '@/domain/types';
import { isResolved } from '@/domain/types';
import { loserTeamId, winnerTeamRef } from '@/domain/bracket/resolve-teams';
import { STAGE_LABELS } from '@/domain/bracket/stage-order';
import { formatMatchScore } from './format-score';
import { computeRadialBracketLayout, type RadialNodePos } from './layout/radial-bracket-layout';
import { BADGE_RING_RADIUS, HALF_GAP } from './layout/radial-constants';
import { teamIdOfRef } from './team-focus';
import type {
  AdvanceEdgeState,
  FinalCenterFlowNode,
  MatchDotFlowNode,
  RoadmapEdge,
  RoadmapGraph,
  RoadmapNode,
  TeamBadgeFlowNode,
} from './graph-model';

/** Map a knockout match status to the shared advance-edge state vocabulary. */
function edgeState(status: Match['status'] | undefined): AdvanceEdgeState {
  if (status === 'live') return 'live';
  if (status === 'finished') return 'decided';
  return 'undecided';
}

/** Polar→Cartesian about a center, matching the layout: x=cx+r·sinθ, y=cy−r·cosθ. */
function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return { x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) };
}

/** The two outer-ring badge nodes for one R32 match (home at θ−gap, away at θ+gap). */
function badgeNodes(
  node: BracketNode,
  dotAngle: number,
  matchById: Map<string, Match>,
  center: { cx: number; cy: number },
): TeamBadgeFlowNode[] {
  const lost = loserTeamId(node, matchById);
  return (['home', 'away'] as const).map((side) => {
    const slot = side === 'home' ? node.home : node.away;
    const teamId = teamIdOfRef(slot.team);
    const angle = side === 'home' ? dotAngle - HALF_GAP : dotAngle + HALF_GAP;
    return {
      id: `badge-${node.matchId}-${side}`,
      type: 'team-badge',
      position: polar(center.cx, center.cy, BADGE_RING_RADIUS, angle),
      data: {
        matchId: node.matchId,
        teamId,
        team: slot.team,
        code: slot.team.kind === 'team' ? slot.team.team.code : null,
        flagUrl: slot.team.kind === 'team' ? slot.team.team.flagUrl : null,
        side,
        eliminated: lost !== null && teamId === lost,
      },
    };
  });
}

/**
 * Derive the winner roundel primitives from the SHARED guarded rule
 * (`winnerTeamRef`, `isResolved`-guarded): the resolved winning `TeamRef` plus the
 * view-facing `code`/`flagUrl` read off it (like `TeamBadgeNode`) [L1]. Null when
 * the match is undecided OR the winning side is still a placeholder.
 */
function winnerOf(
  node: BracketNode,
  matchById: Map<string, Match>,
): { winner: TeamRef | null; winnerCode: string | null; winnerFlagUrl: string | null } {
  const winner = winnerTeamRef(node, matchById);
  const team = winner !== null && isResolved(winner) ? winner.team : null;
  return { winner, winnerCode: team?.code ?? null, winnerFlagUrl: team?.flagUrl ?? null };
}

/** Inner-ring dot for a non-Final KO match (node id === matchId). */
function matchDotNode(
  node: BracketNode,
  pos: RadialNodePos,
  matchById: Map<string, Match>,
  match?: Match,
): MatchDotFlowNode {
  return {
    id: node.matchId,
    type: 'match-dot',
    position: { x: pos.x, y: pos.y },
    data: {
      matchId: node.matchId,
      stage: node.stage,
      roundLabel: STAGE_LABELS[node.stage],
      status: match?.status ?? 'scheduled',
      home: node.home.team,
      away: node.away.team,
      // DERIVED (pure) from the SHARED winner rule + the single score formatter;
      // null when the match is undecided OR the winning side is unresolved.
      ...winnerOf(node, matchById),
      score: match ? formatMatchScore(match.score) : null,
    },
  };
}

/** The center Final node (node id === Final matchId). */
function finalCenterNode(
  node: BracketNode,
  pos: RadialNodePos,
  matchById: Map<string, Match>,
  match?: Match,
): FinalCenterFlowNode {
  return {
    id: node.matchId,
    type: 'final-center',
    position: { x: pos.x, y: pos.y },
    data: {
      matchId: node.matchId,
      status: match?.status ?? 'scheduled',
      home: node.home.team,
      away: node.away.team,
      // DERIVED (pure): the CHAMPION via the SHARED winner rule; null until the
      // Final is decided + the winning side resolved. (No score — decision 1.)
      ...winnerOf(node, matchById),
    },
  };
}

/** A radial connector edge from a child match inward to its parent. */
function radialEdge(
  child: RadialNodePos,
  parentMatchId: string,
  state: AdvanceEdgeState,
  center: { cx: number; cy: number },
): RoadmapEdge {
  return {
    id: `radial-${child.matchId}-${parentMatchId}`,
    source: child.matchId,
    target: parentMatchId,
    type: 'radial',
    data: { state, cx: center.cx, cy: center.cy },
  };
}

export function buildRadialGraph(tournament: Tournament): RoadmapGraph {
  const layout = computeRadialBracketLayout(tournament);
  const center = { cx: layout.center.x, cy: layout.center.y };
  const byMatchId = new Map<string, BracketNode>();
  for (const round of tournament.bracket.rounds) {
    for (const node of round.nodes) byMatchId.set(node.matchId, node);
  }
  const matchById = new Map<string, Match>(tournament.matches.map((m) => [m.id, m]));

  const nodes: RoadmapNode[] = [];
  const edges: RoadmapEdge[] = [];

  for (const pos of layout.nodes.values()) {
    const node = byMatchId.get(pos.matchId);
    if (!node) continue;
    const match = matchById.get(pos.matchId);

    if (node.stage === 'FINAL') {
      nodes.push(finalCenterNode(node, pos, matchById, match));
    } else {
      nodes.push(matchDotNode(node, pos, matchById, match));
    }

    // R32 leaves carry the 32 outer-ring badges at θ_dot ± HALF_GAP.
    if (pos.leafIndex !== null) {
      nodes.push(...badgeNodes(node, pos.angle, matchById, center));
    }

    // Inward connector from each child to its parent (child → parent).
    if (pos.parentMatchId !== null) {
      const childStatus = matchById.get(pos.matchId)?.status;
      edges.push(radialEdge(pos, pos.parentMatchId, edgeState(childStatus), center));
    }
  }

  return { nodes, edges };
}
