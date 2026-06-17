import type { BracketNode, Group, Match, Tournament } from '@/domain/types';
import { EMPTY_SCORE } from '@/domain/types';
import { STAGE_LABELS } from '@/domain/bracket/stage-order';
import { R32_SEEDING } from '@/domain/bracket/seeding';
import { computeGroupMatchLanes } from './layout/group-layout';
import { computeBracketLayout } from './layout/bracket-layout';
import { SECTION_GAP, groupBandHeight, type XY } from './layout/layout-constants';
import type {
  AdvanceEdgeState,
  MatchFlowNode,
  MatchNodeData,
  RoadmapEdge,
  RoadmapGraph,
  RoadmapNode,
} from './graph-model';

/** All edges flow downward: bottom of the child into the top of the parent. */
const HANDLES = { sourceHandle: 'b', targetHandle: 't' } as const;

/** Flatten a knockout bracket node into the shared match-card view model. */
function knockoutMatchData(node: BracketNode): MatchNodeData {
  return {
    matchId: node.matchId,
    stage: node.stage,
    roundLabel: STAGE_LABELS[node.stage],
    group: null,
    matchday: null,
    home: node.home.team,
    away: node.away.team,
    score: EMPTY_SCORE,
    status: 'scheduled',
    kickoff: null,
    minute: null,
    venue: { name: null, city: null },
    isFinal: node.stage === 'FINAL',
    isThirdPlace: node.stage === 'THIRD_PLACE',
  };
}

/** Flatten a concrete group-stage match into the shared match-card view model. */
function groupMatchData(match: Match): MatchNodeData {
  return {
    matchId: match.id,
    stage: 'GROUP_STAGE',
    roundLabel: STAGE_LABELS.GROUP_STAGE,
    group: match.group,
    matchday: match.matchday,
    home: match.home,
    away: match.away,
    score: match.score,
    status: match.status,
    kickoff: match.kickoff,
    minute: match.minute,
    venue: match.venue,
    isFinal: false,
    isThirdPlace: false,
  };
}

function matchNode(data: MatchNodeData, position: XY): MatchFlowNode {
  return { id: data.matchId, type: 'match', position, data };
}

/** "1A" / "2A" both feed group A's R32 slots. */
function seedFeedsGroup(label: string, group: string): boolean {
  return label === `1${group}` || label === `2${group}`;
}

function edgeState(status: Match['status']): AdvanceEdgeState {
  if (status === 'live') return 'live';
  if (status === 'finished') return 'decided';
  return 'undecided';
}

/**
 * Immutable transform: `Tournament` -> one continuous React Flow graph.
 *  - one `match` node per GROUP_STAGE match (horizontal lanes, by kickoff),
 *  - one `group` table node per group at its lane start (x=0),
 *  - one `match` node per knockout bracket node (vertical, top->bottom),
 *  - feeder edges (group -> seeded R32) + advance edges (child -> parent),
 *    all flowing downward with `sourceHandle:'b'` / `targetHandle:'t'`.
 *
 * Composes three pure passes into one coordinate space; never mutates the input.
 */
export function buildRoadmapGraph(tournament: Tournament): RoadmapGraph {
  const lanes = computeGroupMatchLanes(tournament);
  const bandOffsetY = groupBandHeight(tournament.groups.length) + SECTION_GAP;
  const bracketLayout = computeBracketLayout(tournament.bracket, bandOffsetY);
  const statusById = new Map(tournament.matches.map((m) => [m.id, m.status]));

  const nodes: RoadmapNode[] = [];
  const edges: RoadmapEdge[] = [];

  // --- Group band: standings tables + per-match cards. -----------------------
  for (const group of tournament.groups) {
    const position = lanes.table.get(group.name) ?? { x: 0, y: 0 };
    nodes.push(groupTableNode(group, position));
  }
  for (const match of tournament.matches) {
    if (match.stage !== 'GROUP_STAGE') continue;
    const position = lanes.matches.get(match.id);
    if (!position) continue;
    nodes.push(matchNode(groupMatchData(match), position));
  }

  // --- Knockout: one card per bracket node. ----------------------------------
  for (const round of tournament.bracket.rounds) {
    for (const node of round.nodes) {
      const position = bracketLayout.get(node.matchId) ?? { x: 0, y: bandOffsetY };
      nodes.push(matchNode(knockoutMatchData(node), position));
    }
  }

  // --- Feeder edges: each group -> the R32 matches it seeds. ------------------
  const r32 = tournament.bracket.rounds.find((r) => r.stage === 'ROUND_OF_32');
  if (r32) {
    for (const group of tournament.groups) {
      r32.nodes.forEach((node, slot) => {
        const pair = R32_SEEDING[slot];
        if (seedFeedsGroup(pair.home, group.name) || seedFeedsGroup(pair.away, group.name)) {
          edges.push(feederEdge(group.name, node.matchId));
        }
      });
    }
  }

  // --- Advance edges: each non-group bracket slot -> its parent. -------------
  for (const round of tournament.bracket.rounds) {
    for (const parent of round.nodes) {
      for (const slot of [parent.home, parent.away]) {
        if (slot.source.kind === 'group') continue;
        const childId = slot.source.matchId;
        const status = statusById.get(childId) ?? 'scheduled';
        edges.push(advanceEdge(childId, parent.matchId, edgeState(status)));
      }
    }
  }

  return { nodes, edges };
}

function groupTableNode(group: Group, position: XY): RoadmapNode {
  return { id: `group-${group.name}`, type: 'group', position, data: { group } };
}

function feederEdge(groupName: string, r32MatchId: string): RoadmapEdge {
  return {
    id: `feed-${groupName}-${r32MatchId}`,
    source: `group-${groupName}`,
    target: r32MatchId,
    type: 'advance',
    data: { state: 'undecided' },
    ...HANDLES,
  };
}

function advanceEdge(source: string, target: string, state: AdvanceEdgeState): RoadmapEdge {
  return {
    id: `adv-${source}-${target}`,
    source,
    target,
    type: 'advance',
    data: { state },
    ...HANDLES,
  };
}
