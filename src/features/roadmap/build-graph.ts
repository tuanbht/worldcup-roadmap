import type { BracketNode, Match, Tournament } from '@/domain/types';
import { EMPTY_SCORE } from '@/domain/types';
import { STAGE_LABELS } from '@/domain/bracket/stage-order';
import { R32_SEEDING } from '@/domain/bracket/seeding';
import { formatDate } from '@/lib/datetime';
import { computeGroupGridLayout } from './layout/group-layout';
import { computeKnockoutFunnelLayout } from './layout/bracket-layout';
import { computeDayIndex, dayKey, orderedDays } from './layout/day-axis';
import {
  CX,
  DAY_MARKER_INSET,
  DAY_ROW_PITCH,
  HEADER_H,
  RAIL_W,
  type XY,
} from './layout/layout-constants';
import type {
  AdvanceEdgeState,
  DayMarkerFlowNode,
  GroupHeaderFlowNode,
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

function dayMarkerNode(day: string, index: number, label: string): DayMarkerFlowNode {
  return {
    id: `day-marker-${day}`,
    type: 'day-marker',
    position: { x: RAIL_W - DAY_MARKER_INSET, y: HEADER_H + index * DAY_ROW_PITCH },
    data: { dayKey: day, dayLabel: label, dayIndex: index },
  };
}

function groupHeaderNode(name: string, position: XY): GroupHeaderFlowNode {
  return {
    id: `group-header-${name}`,
    type: 'group-header',
    position,
    data: { group: name },
  };
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
 * A group's "exit" match — its latest-kickoff game, which sits at the bottom of
 * the group's column (closest to the knockout). Feeder edges originate here so
 * each line is a short "final group match -> R32" connector instead of a
 * full-canvas diagonal that starts at the group-header far up top.
 */
function groupExitMatchId(matches: readonly Match[], groupName: string): string | null {
  let exit: Match | null = null;
  for (const m of matches) {
    if (m.stage !== 'GROUP_STAGE' || m.group !== groupName) continue;
    if (exit === null || m.kickoff > exit.kickoff || (m.kickoff === exit.kickoff && m.id > exit.id)) {
      exit = m;
    }
  }
  return exit?.id ?? null;
}

function feederEdge(groupName: string, sourceMatchId: string, r32MatchId: string): RoadmapEdge {
  return {
    id: `feed-${groupName}-${r32MatchId}`,
    source: sourceMatchId,
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

/** One feeder edge per (group, seeded-R32-slot) pair, sourced from its header. */
function feederEdges(tournament: Tournament): RoadmapEdge[] {
  const r32 = tournament.bracket.rounds.find((r) => r.stage === 'ROUND_OF_32');
  if (!r32) return [];
  const edges: RoadmapEdge[] = [];
  for (const group of tournament.groups) {
    const sourceId = groupExitMatchId(tournament.matches, group.name);
    if (!sourceId) continue;
    r32.nodes.forEach((node, slot) => {
      const pair = R32_SEEDING[slot];
      if (seedFeedsGroup(pair.home, group.name) || seedFeedsGroup(pair.away, group.name)) {
        edges.push(feederEdge(group.name, sourceId, node.matchId));
      }
    });
  }
  return edges;
}

/** One downward advance edge per non-group bracket slot (child -> parent). */
function advanceEdges(tournament: Tournament): RoadmapEdge[] {
  const statusById = new Map(tournament.matches.map((m) => [m.id, m.status]));
  const edges: RoadmapEdge[] = [];
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
  return edges;
}

/**
 * Immutable transform: `Tournament` -> one timeline-grid React Flow graph.
 *  - one `match` node per match (group grid column×day + centered knockout funnel),
 *  - one `day-marker` rail guide per distinct match-day,
 *  - one `group-header` column guide per group A..L,
 *  - feeder edges (group-header -> seeded R32) + downward advance edges,
 *    all flowing downward with `sourceHandle:'b'` / `targetHandle:'t'`.
 *
 * Composes the pure day-axis + group + knockout passes; never mutates the input.
 */
export function buildRoadmapGraph(tournament: Tournament): RoadmapGraph {
  const dayIndex = computeDayIndex(tournament.matches);
  const groupGrid = computeGroupGridLayout(tournament, dayIndex);
  const knockout = computeKnockoutFunnelLayout(tournament, dayIndex, CX);

  const nodes: RoadmapNode[] = [];

  // --- Guide nodes: left date rail + top group-header columns. ----------------
  const isoByDay = new Map<string, string>();
  for (const match of tournament.matches) {
    const key = dayKey(match.kickoff);
    if (!isoByDay.has(key)) isoByDay.set(key, match.kickoff);
  }
  orderedDays(tournament.matches).forEach((day, index) => {
    nodes.push(dayMarkerNode(day, index, formatDate(isoByDay.get(day) ?? null)));
  });
  for (const [name, position] of groupGrid.headers) {
    nodes.push(groupHeaderNode(name, position));
  }

  // --- Group cards: one per GROUP_STAGE match at its column×day cell. ---------
  for (const match of tournament.matches) {
    if (match.stage !== 'GROUP_STAGE') continue;
    const position = groupGrid.matches.get(match.id);
    if (!position) continue;
    nodes.push(matchNode(groupMatchData(match), position));
  }

  // --- Knockout cards: one per bracket node in the centered funnel. ----------
  for (const round of tournament.bracket.rounds) {
    for (const node of round.nodes) {
      const position = knockout.get(node.matchId) ?? { x: CX, y: HEADER_H };
      nodes.push(matchNode(knockoutMatchData(node), position));
    }
  }

  const edges: RoadmapEdge[] = [...feederEdges(tournament), ...advanceEdges(tournament)];

  return { nodes, edges };
}
