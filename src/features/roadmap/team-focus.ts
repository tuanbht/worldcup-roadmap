// Pure team-focus selector + immutable display-copy stamper for the "click a team
// flag -> highlight its path" feature (requirement item 3).
//
//   - selectTeamFocus(tournament, teamId): the set of match-node ids the team
//     plays in (group home/away + KNOCKOUT matches whose RESOLVED home/away is
//     that team) and the edge ids on its path — the team's group feeders plus the
//     advance edges whose BOTH endpoints are focused matches — reconstructed from
//     the edge-id grammar in build-graph.ts (`feed-<G>-<r32>`, `adv-<src>-<tgt>`).
//   - applyTeamFocus(nodes, edges, focus): immutable display copies stamping
//     `focusState:'on'` on focused nodes/edges and `'dim'` on the rest; the input
//     is returned unchanged when focus is null; never mutates the input graph.
import type { Match, TeamRef, Tournament } from '@/domain/types';
import { R32_SEEDING } from '@/domain/bracket/seeding';
import type { RoadmapEdge, RoadmapNode } from './graph-model';

export interface TeamFocus {
  readonly teamId: string;
  /** Match-node ids the team plays in (== Match.id / BracketNode.matchId). */
  readonly matchNodeIds: ReadonlySet<string>;
  /** Feeder + advance edge ids on the team's path. */
  readonly edgeIds: ReadonlySet<string>;
}

/** Resolve a TeamRef -> its team id, or null for an unresolved placeholder slot. */
export function teamIdOfRef(ref: TeamRef): string | null {
  return ref.kind === 'team' ? ref.team.id : null;
}

/** True iff the team (by id) is the resolved home OR away of this match. */
export function matchInvolvesTeam(match: Match, teamId: string): boolean {
  return teamIdOfRef(match.home) === teamId || teamIdOfRef(match.away) === teamId;
}

/** "1A" / "2A" both feed group A's R32 slots — mirrors build-graph's seedFeedsGroup. */
function seedFeedsGroup(label: string, group: string): boolean {
  return label === `1${group}` || label === `2${group}`;
}

/** The group letters the focused team belongs to (resolved group-stage matches). */
function focusedGroups(tournament: Tournament, teamId: string): Set<string> {
  const groups = new Set<string>();
  for (const match of tournament.matches) {
    if (match.stage !== 'GROUP_STAGE' || match.group === null) continue;
    if (matchInvolvesTeam(match, teamId)) groups.add(match.group);
  }
  return groups;
}

/**
 * Every `feed-<group>-<r32MatchId>` id the builder emits for the team's group(s)
 * — the FULL group feeder set, reconstructed from `R32_SEEDING` exactly as
 * build-graph.feederEdges wires it.
 */
function feederEdgeIds(tournament: Tournament, groups: ReadonlySet<string>): Set<string> {
  const ids = new Set<string>();
  if (groups.size === 0) return ids;
  const r32 = tournament.bracket.rounds.find((r) => r.stage === 'ROUND_OF_32');
  if (!r32) return ids;
  r32.nodes.forEach((node, slot) => {
    const pair = R32_SEEDING[slot];
    for (const group of groups) {
      if (seedFeedsGroup(pair.home, group) || seedFeedsGroup(pair.away, group)) {
        ids.add(`feed-${group}-${node.matchId}`);
      }
    }
  });
  return ids;
}

/**
 * Every `adv-<source>-<target>` id (one per non-group bracket slot, child ->
 * parent) whose BOTH endpoints are in the focused match set — reconstructed from
 * the bracket exactly as build-graph.advanceEdges wires it.
 */
function advanceEdgeIds(tournament: Tournament, matchNodeIds: ReadonlySet<string>): Set<string> {
  const ids = new Set<string>();
  for (const round of tournament.bracket.rounds) {
    for (const parent of round.nodes) {
      for (const slot of [parent.home, parent.away]) {
        if (slot.source.kind === 'group') continue;
        const source = slot.source.matchId;
        const target = parent.matchId;
        if (matchNodeIds.has(source) && matchNodeIds.has(target)) {
          ids.add(`adv-${source}-${target}`);
        }
      }
    }
  }
  return ids;
}

export function selectTeamFocus(tournament: Tournament, teamId: string): TeamFocus {
  const matchNodeIds = new Set<string>();
  for (const match of tournament.matches) {
    if (matchInvolvesTeam(match, teamId)) matchNodeIds.add(match.id);
  }
  const groups = focusedGroups(tournament, teamId);
  const edgeIds = new Set<string>([
    ...feederEdgeIds(tournament, groups),
    ...advanceEdgeIds(tournament, matchNodeIds),
  ]);
  return { teamId, matchNodeIds, edgeIds };
}

/** Immutable display copy of a node, stamping `focusState` into its data. */
function stampNode(node: RoadmapNode, focusState: 'on' | 'dim'): RoadmapNode {
  return { ...node, data: { ...node.data, focusState } } as RoadmapNode;
}

/** Immutable display copy of an edge, stamping `focusState` into its data. */
function stampEdge(edge: RoadmapEdge, focusState: 'on' | 'dim'): RoadmapEdge {
  const data = { ...(edge.data ?? { state: 'undecided' as const }), focusState };
  return { ...edge, data };
}

export function applyTeamFocus(
  nodes: readonly RoadmapNode[],
  edges: readonly RoadmapEdge[],
  focus: TeamFocus | null,
): { nodes: RoadmapNode[]; edges: RoadmapEdge[] } {
  if (!focus) return { nodes: [...nodes], edges: [...edges] };
  const stampedNodes = nodes.map((node) =>
    node.type === 'match' ? stampNode(node, focus.matchNodeIds.has(node.id) ? 'on' : 'dim') : node,
  );
  const stampedEdges = edges.map((edge) =>
    stampEdge(edge, focus.edgeIds.has(edge.id) ? 'on' : 'dim'),
  );
  return { nodes: stampedNodes, edges: stampedEdges };
}
