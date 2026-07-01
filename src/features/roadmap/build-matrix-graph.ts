/**
 * `buildMatrixGraph(tournament)` → the matrix "journey-lanes" React Flow graph
 * (2026-07-01-1030-matrix-journey-lanes-view): the WHOLE tournament group stage →
 * Final as a subway/journey map.
 *
 *   - One `matrix-match` STATION node per match across GROUP_STAGE + every KO round
 *     (group 72 + R32 16 + R16 8 + QF 4 + SF 2 + THIRD_PLACE 1 + FINAL 1 = 104),
 *     positioned by `computeMatrixLayout` in its chronological stage column. Node
 *     id === matchId. Score/label reuse the SHARED `formatMatchScore`/`refLabel`
 *     helpers so winner/loser is never re-derived.
 *   - One `matrix-lane` edge per team per CONSECUTIVE-match hop (from `teamLanes`),
 *     colored by the stable per-team `teamHue`; a loser's lane terminates (no edge
 *     leaving its last match), the champion's lane reaches the FINAL.
 *
 * Pure / immutable: returns new objects; never mutates the input tournament
 * (tolerates a frozen input); deterministic across builds.
 */
import type { Match, Tournament } from '@/domain/types';
import { STAGE_LABELS } from '@/domain/bracket/stage-order';
import { formatMatchScore } from './format-score';
import { computeMatrixLayout } from './layout/matrix-layout';
import { laneEdgeId, teamHue, teamLanes } from './matrix-lane';
import type {
  MatrixLaneEdgeData,
  MatrixMatchFlowNode,
  RoadmapEdge,
  RoadmapGraph,
  RoadmapNode,
} from './graph-model';

/**
 * A station's header label: a group station reads "Group A · MD1" (or "Group A"
 * when the matchday is absent); a KO station uses the round name — mirroring the
 * grid card's `displayLabel`.
 */
function stationLabel(match: Match): string {
  if (match.stage === 'GROUP_STAGE' && match.group !== null) {
    return match.matchday !== null
      ? `Group ${match.group} · MD${match.matchday}`
      : `Group ${match.group}`;
  }
  return STAGE_LABELS[match.stage];
}

/** The station node for one match (id === matchId), positioned by the layout. */
function stationNode(match: Match, pos: { x: number; y: number }): MatrixMatchFlowNode {
  return {
    id: match.id,
    type: 'matrix-match',
    position: { x: pos.x, y: pos.y },
    data: {
      matchId: match.id,
      stage: match.stage,
      roundLabel: stationLabel(match),
      group: match.group,
      matchday: match.matchday,
      home: match.home,
      away: match.away,
      // DERIVED (pure) via the SINGLE shared formatter; null when undecided.
      score: formatMatchScore(match.score),
      status: match.status,
      isFinal: match.stage === 'FINAL',
      isThirdPlace: match.stage === 'THIRD_PLACE',
      kickoff: match.kickoff,
    },
  };
}

/** A single lane hop `src → dst` for a team, carrying its stable hue. */
function laneEdge(teamId: string, color: string, src: string, dst: string): RoadmapEdge {
  const data: MatrixLaneEdgeData = { teamId, color };
  return {
    id: laneEdgeId(teamId, src, dst),
    source: src,
    target: dst,
    type: 'matrix-lane',
    data,
  };
}

export function buildMatrixGraph(tournament: Tournament): RoadmapGraph {
  const layout = computeMatrixLayout(tournament);
  const matchById = new Map<string, Match>(tournament.matches.map((m) => [m.id, m]));

  // One station per match that has a layout position (== every real match in a
  // known stage band). Read the match from the layout key so stations and lanes
  // share the same `tournament.matches` source of truth.
  const nodes: RoadmapNode[] = [];
  for (const pos of layout.values()) {
    const match = matchById.get(pos.matchId);
    if (!match) continue;
    nodes.push(stationNode(match, pos));
  }

  // Per-team lanes: one edge per consecutive-match hop; the stable hue colors the
  // whole lane. No edge after a team's last match → the loser's lane terminates.
  const edges: RoadmapEdge[] = [];
  for (const [teamId, matches] of teamLanes(tournament)) {
    const color = teamHue(teamId);
    for (let i = 0; i < matches.length - 1; i += 1) {
      edges.push(laneEdge(teamId, color, matches[i].id, matches[i + 1].id));
    }
  }

  return { nodes, edges };
}
