import type { BracketNode, Group, Match, Tournament } from '@/domain/types';
import { EMPTY_SCORE } from '@/domain/types';
import { STAGE_LABELS } from '@/domain/bracket/stage-order';
import { R32_SEEDING } from '@/domain/bracket/seeding';
import { formatDate, resolveTimeZone } from '@/lib/datetime';
import { computeGroupGridLayout } from './layout/group-layout';
import { computeKnockoutFunnelLayout } from './layout/bracket-layout';
import { computeDayIndex, dayKey, orderedDays } from './layout/day-axis';
import { CX, DAY_ROW_PITCH, HEADER_H, STANDINGS_Y, type XY } from './layout/layout-constants';
import type {
  AdvanceEdgeState,
  DayMarkerFlowNode,
  GroupStandingsFlowNode,
  MatchFlowNode,
  MatchNodeData,
  RoadmapEdge,
  RoadmapGraph,
  RoadmapNode,
} from './graph-model';

/** All edges flow downward: bottom of the child into the top of the parent. */
const HANDLES = { sourceHandle: 'b', targetHandle: 't' } as const;

/**
 * The live fields of a knockout card, resolved from the real `Match` when one
 * backs the bracket slot, else the safe "unscheduled slot" fallback. Read off
 * the `Match` (never mutated) so the merge below stays immutable.
 */
function knockoutLiveFields(
  match: Match | undefined,
): Pick<MatchNodeData, 'score' | 'status' | 'kickoff' | 'minute' | 'venue'> {
  if (!match) {
    return {
      score: EMPTY_SCORE,
      status: 'scheduled',
      kickoff: null,
      minute: null,
      venue: { name: null, city: null },
    };
  }
  return {
    score: match.score,
    status: match.status,
    kickoff: match.kickoff,
    minute: match.minute,
    venue: match.venue,
  };
}

/**
 * Flatten a knockout bracket node into the shared match-card view model.
 *
 * Structural fields (stage / round label / placeholder teams / Final & 3rd-place
 * flags) come from the `BracketNode`; the live fields (score / status / kickoff /
 * minute / venue) are merged in from the resolved `Match` in `tournament.matches`
 * when one exists, so the card reflects REAL state instead of a hardcoded
 * "scheduled" pill. Falls back to the safe defaults for an unscheduled slot.
 * Immutable: returns a new object; never mutates `node` or `match`.
 */
function knockoutMatchData(node: BracketNode, match?: Match): MatchNodeData {
  return {
    matchId: node.matchId,
    stage: node.stage,
    roundLabel: STAGE_LABELS[node.stage],
    group: null,
    matchday: null,
    home: node.home.team,
    away: node.away.team,
    ...knockoutLiveFields(match),
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
    position: { x: 0, y: HEADER_H + index * DAY_ROW_PITCH },
    data: { dayKey: day, dayLabel: label, dayIndex: index },
  };
}

/**
 * Always-on standings table node — the SINGLE per-column header (the redundant
 * column-title pill is removed). Shares its group column `x` and sits flush at
 * the band's standings anchor `STANDINGS_Y`, so its `GROUP_TABLE_H`-tall box
 * clears day-row 0 at `HEADER_H` (the relation locked in layout-constants).
 * Carries the live `Group` (with `table`) so the renderer reuses `GroupTableNode`.
 */
function groupStandingsNode(group: Group, headerXY: XY): GroupStandingsFlowNode {
  return {
    id: `group-standings-${group.name}`,
    type: 'group-standings',
    position: { x: headerXY.x, y: STANDINGS_Y },
    data: { group },
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
 * full-canvas diagonal that starts at the top of the column.
 */
function groupExitMatchId(matches: readonly Match[], groupName: string): string | null {
  let exit: Match | null = null;
  for (const m of matches) {
    if (m.stage !== 'GROUP_STAGE' || m.group !== groupName) continue;
    if (
      exit === null ||
      m.kickoff > exit.kickoff ||
      (m.kickoff === exit.kickoff && m.id > exit.id)
    ) {
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

/** Dashed membership edge: a group's standings table -> one of its matches. */
function memberEdge(groupName: string, matchId: string): RoadmapEdge {
  return {
    id: `member-${groupName}-${matchId}`,
    source: `group-standings-${groupName}`,
    target: matchId,
    type: 'member',
    data: { group: groupName },
    ...HANDLES,
  };
}

/**
 * One dashed membership edge per (group, in-group match): from
 * `group-standings-<group>` down to each group-stage match of that group. These
 * read as grouping links (a fan from the table to its matches), visually distinct
 * from the solid advance/feeder edges. Total == the group-stage match count.
 */
function memberEdges(tournament: Tournament): RoadmapEdge[] {
  const edges: RoadmapEdge[] = [];
  for (const match of tournament.matches) {
    if (match.stage !== 'GROUP_STAGE' || match.group === null) continue;
    edges.push(memberEdge(match.group, match.id));
  }
  return edges;
}

/**
 * Immutable transform: `Tournament` -> one timeline-grid React Flow graph.
 *  - one `match` node per match (group grid column×day + centered knockout funnel),
 *  - one `day-marker` rail guide per distinct match-day,
 *  - one `group-standings` table per group A..L at the top of its column,
 *  - feeder edges (group exit match -> seeded R32) + downward advance edges +
 *    dashed `member` edges (standings table -> each in-group match), all flowing
 *    downward with `sourceHandle:'b'` / `targetHandle:'t'`.
 *
 * Composes the pure day-axis + group + knockout passes; never mutates the input.
 */
export function buildRoadmapGraph(tournament: Tournament, tz?: string): RoadmapGraph {
  // ONE zone for the whole graph (req:day-axis-local-timezone, Acceptance #3):
  // resolve it ONCE here via the `lib/datetime` façade (explicit `tz` wins,
  // else the viewer's local zone) and thread that concrete string through the
  // day axis, both layout passes, and the marker label. This guarantees
  // grouping == ordering == group rows == knockout rows == the `formatDate(...)`
  // pill label, with no second ambient read drifting between passes.
  const zone = resolveTimeZone(tz);
  // The live `Match` for each KO bracket slot — the same data that already
  // colors the advance edges — keyed once so each knockout card can merge in its
  // real score/status/kickoff/minute/venue instead of a hardcoded "scheduled".
  const matchById = new Map(tournament.matches.map((m) => [m.id, m]));
  const dayIndex = computeDayIndex(tournament.matches, zone);
  const groupGrid = computeGroupGridLayout(tournament, dayIndex, zone);
  const knockout = computeKnockoutFunnelLayout(tournament, dayIndex, CX, zone);

  const nodes: RoadmapNode[] = [];

  // --- Guide nodes: left date rail + top group-standings header columns. ------
  const isoByDay = new Map<string, string>();
  for (const match of tournament.matches) {
    const key = dayKey(match.kickoff, zone);
    if (!isoByDay.has(key)) isoByDay.set(key, match.kickoff);
  }
  orderedDays(tournament.matches, zone).forEach((day, index) => {
    nodes.push(dayMarkerNode(day, index, formatDate(isoByDay.get(day) ?? null, zone)));
  });
  const groupByName = new Map(tournament.groups.map((g) => [g.name, g]));
  for (const [name, position] of groupGrid.headers) {
    const group = groupByName.get(name);
    if (group) nodes.push(groupStandingsNode(group, position));
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
      nodes.push(matchNode(knockoutMatchData(node, matchById.get(node.matchId)), position));
    }
  }

  const edges: RoadmapEdge[] = [
    ...feederEdges(tournament),
    ...advanceEdges(tournament),
    ...memberEdges(tournament),
  ];

  return { nodes, edges };
}
