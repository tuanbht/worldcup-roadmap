import type { BracketNode, Match, Tournament } from '@/domain/types';
import { EMPTY_SCORE } from '@/domain/types';
import { R32_SEEDING } from '@/domain/bracket/seeding';
import { STAGE_LABELS } from '@/domain/bracket/stage-order';
import { computeBracketLayout } from './layout/bracket-layout';
import { computeGroupGrid, groupGridWidth } from './layout/group-layout';
import { GROUP_H, GROUP_W, NODE_H, NODE_W } from './layout/layout-constants';
import type {
  AdvanceEdgeState,
  MatchNodeData,
  RoadmapEdge,
  RoadmapGraph,
  RoadmapNode,
  RoadmapView,
} from './graph-model';

const FULL_GROUP_COLUMNS = 2;
const GROUPS_VIEW_COLUMNS = 4;
const FULL_BRACKET_OFFSET = groupGridWidth(FULL_GROUP_COLUMNS) + 180;

function matchData(node: BracketNode, match: Match | undefined): MatchNodeData {
  const base = {
    matchId: node.matchId,
    stage: node.stage,
    roundLabel: STAGE_LABELS[node.stage],
    isFinal: node.stage === 'FINAL',
    isThirdPlace: node.stage === 'THIRD_PLACE',
  };
  if (match) {
    return {
      ...base,
      home: match.home,
      away: match.away,
      score: match.score,
      status: match.status,
      kickoff: match.kickoff,
      minute: match.minute,
      venue: match.venue,
    };
  }
  return {
    ...base,
    home: node.home.team,
    away: node.away.team,
    score: EMPTY_SCORE,
    status: 'scheduled',
    kickoff: null,
    minute: null,
    venue: { name: null, city: null },
  };
}

function edgeState(child: Match | undefined, parent: Match | undefined): AdvanceEdgeState {
  if (child?.status === 'live' || parent?.status === 'live') return 'live';
  if (child?.status === 'finished' && child.score.winner && child.score.winner !== 'draw') {
    return 'decided';
  }
  return 'undecided';
}

/** Source/target handle ids so edges always flow toward the centre Final. */
function handlesFor(
  childX: number,
  parentX: number,
): { sourceHandle: string; targetHandle: string } {
  return childX <= parentX
    ? { sourceHandle: 'sr', targetHandle: 'tl' }
    : { sourceHandle: 'sl', targetHandle: 'tr' };
}

function groupsOnlyGraph(tournament: Tournament): RoadmapGraph {
  const positions = computeGroupGrid(tournament.groups.length, GROUPS_VIEW_COLUMNS);
  const nodes: RoadmapNode[] = tournament.groups.map((group, i) => ({
    id: `group-${group.name}`,
    type: 'group',
    position: positions[i],
    data: { group },
    width: GROUP_W,
    height: GROUP_H,
  }));
  return { nodes, edges: [] };
}

/**
 * Immutable transform: `Tournament` + active view → React Flow nodes/edges.
 *  - groups: the 12 standings tables in a grid.
 *  - bracket: knockout match cards + advance edges.
 *  - full: group tables (left) feeding the bracket (right) + feeder edges.
 */
export function buildRoadmapGraph(tournament: Tournament, view: RoadmapView): RoadmapGraph {
  if (view === 'groups') return groupsOnlyGraph(tournament);

  const showGroups = view === 'full';
  const xOffset = showGroups ? FULL_BRACKET_OFFSET : 0;
  const matchById = new Map(tournament.matches.map((m) => [m.id, m]));
  const layout = computeBracketLayout(tournament.bracket);

  const nodes: RoadmapNode[] = [];
  const edges: RoadmapEdge[] = [];

  for (const round of tournament.bracket.rounds) {
    for (const node of round.nodes) {
      const xy = layout.get(node.matchId)!;
      nodes.push({
        id: node.matchId,
        type: 'match',
        position: { x: xy.x + xOffset, y: xy.y },
        data: matchData(node, matchById.get(node.matchId)),
        width: NODE_W,
        height: NODE_H,
      });
    }
  }

  for (const round of tournament.bracket.rounds) {
    for (const node of round.nodes) {
      const parentXY = layout.get(node.matchId)!;
      const parentMatch = matchById.get(node.matchId);
      for (const slot of [node.home, node.away]) {
        if (slot.source.kind === 'group') continue;
        const childId = slot.source.matchId;
        const childXY = layout.get(childId);
        if (!childXY) continue;
        const { sourceHandle, targetHandle } = handlesFor(childXY.x, parentXY.x);
        edges.push({
          id: `${childId}__${node.matchId}__${slot.side}`,
          source: childId,
          target: node.matchId,
          sourceHandle,
          targetHandle,
          type: 'advance',
          data: { state: edgeState(matchById.get(childId), parentMatch) },
        });
      }
    }
  }

  if (showGroups) {
    const positions = computeGroupGrid(tournament.groups.length, FULL_GROUP_COLUMNS);
    const r32 = tournament.bracket.rounds.find((r) => r.stage === 'ROUND_OF_32');
    tournament.groups.forEach((group, i) => {
      const id = `group-${group.name}`;
      nodes.push({
        id,
        type: 'group',
        position: positions[i],
        data: { group },
        width: GROUP_W,
        height: GROUP_H,
      });
      r32?.nodes.forEach((kn, slot) => {
        const pair = R32_SEEDING[slot];
        const feeds =
          pair.home === `1${group.name}` ||
          pair.home === `2${group.name}` ||
          pair.away === `1${group.name}` ||
          pair.away === `2${group.name}`;
        if (feeds) {
          edges.push({
            id: `feed-${id}-${kn.matchId}`,
            source: id,
            target: kn.matchId,
            sourceHandle: 'sr',
            targetHandle: 'tl',
            type: 'advance',
            data: { state: 'undecided' },
          });
        }
      });
    });
  }

  return { nodes, edges };
}
