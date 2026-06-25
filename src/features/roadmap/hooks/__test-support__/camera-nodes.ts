/**
 * Shared minimal `RoadmapNode` factories for the camera-hook specs
 * (`useFitOnChange`, `useFocusCamera`, and the `RoadmapCanvas` refetch
 * integration). These build the smallest node shapes the framing math reads
 * (`type`, `position`, `data.stage`) so the specs assert camera behaviour
 * WITHOUT a live React Flow engine or a full validated tournament.
 *
 * Each factory returns a FRESH object identity on every call, so a "refetch"
 * (a new array from a rebuilt graph) genuinely changes node identity — the
 * isolation-by-construction property the bug-under-test depends on. Kept under
 * `__test-support__/` so it is excluded from coverage (it is not production
 * geometry; see `vitest.config.ts` exclude glob).
 */
import { EMPTY_SCORE, teamRef } from '@/domain/types';
import type { Stage } from '@/domain/types';
import type { GroupStandingsFlowNode, MatchFlowNode, RoadmapNode } from '../../graph-model';

const HOME = teamRef({ id: 't-h', name: 'Home', code: 'HOM', flagUrl: null });
const AWAY = teamRef({ id: 't-a', name: 'Away', code: 'AWY', flagUrl: null });

export type MatchStatus = 'scheduled' | 'live' | 'finished';

/** A minimal `match` node — only the fields the framing math + zone predicates read. */
export function matchNode(p: {
  id: string;
  x?: number;
  y?: number;
  stage?: Stage;
  status?: MatchStatus;
}): MatchFlowNode {
  const stage = p.stage ?? 'GROUP_STAGE';
  return {
    id: p.id,
    type: 'match',
    position: { x: p.x ?? 0, y: p.y ?? 0 },
    data: {
      matchId: p.id,
      stage,
      roundLabel: 'R',
      group: stage === 'GROUP_STAGE' ? 'A' : null,
      matchday: null,
      home: HOME,
      away: AWAY,
      score: EMPTY_SCORE,
      status: p.status ?? 'scheduled',
      kickoff: null,
      minute: null,
      venue: { name: null, city: null },
      isFinal: stage === 'FINAL',
      isThirdPlace: stage === 'THIRD_PLACE',
    },
  };
}

/** A minimal always-on group-standings table node (a group-zone guide). */
export function standingsNode(p: { id: string; x?: number; y?: number }): GroupStandingsFlowNode {
  return {
    id: p.id,
    type: 'group-standings',
    position: { x: p.x ?? 0, y: p.y ?? 0 },
    data: { group: { name: 'A', table: [] } },
  };
}

/**
 * A fresh-identity array of distinct group-stage match nodes, one per id. Models
 * a rebuilt graph: the array AND every node inside it are new objects.
 */
export function nodeSet(ids: readonly string[]): RoadmapNode[] {
  return ids.map((id, i) => matchNode({ id, x: i * 320, y: i * 40 }));
}

/**
 * A mixed graph spanning both zones: a group standings table + a group match
 * (the group zone) AND a knockout match (the knockout zone). The optional
 * `suffix` makes every node id — and the whole array — a fresh identity, so a
 * refetch can be modelled by calling `mixedGraph('-v2')`.
 */
export function mixedGraph(suffix = ''): RoadmapNode[] {
  return [
    standingsNode({ id: `g${suffix}`, x: 0, y: 0 }),
    matchNode({ id: `gm${suffix}`, x: 0, y: 200, stage: 'GROUP_STAGE' }),
    matchNode({ id: `ko${suffix}`, x: 600, y: 800, stage: 'QUARTER_FINALS' }),
  ];
}

/** A group-only graph (no knockout node) — focusing "knockout" yields an empty subset. */
export function groupOnlyGraph(suffix = ''): RoadmapNode[] {
  return [
    standingsNode({ id: `g${suffix}`, x: 0, y: 0 }),
    matchNode({ id: `gm${suffix}`, x: 0, y: 200, stage: 'GROUP_STAGE' }),
  ];
}

/** The named members of a {@link distinctZoneGraph}, plus its full node array. */
export interface DistinctZoneGraph {
  /** Group-zone standings header at the graph origin. */
  readonly standings: GroupStandingsFlowNode;
  /** Group-zone match card, near the origin (still inside the group envelope). */
  readonly groupMatch: MatchFlowNode;
  /** Knockout-zone match card, placed FAR to the south-east. */
  readonly knockoutMatch: MatchFlowNode;
  /** All three nodes, in [standings, groupMatch, knockoutMatch] order. */
  readonly nodes: RoadmapNode[];
}

/**
 * A mixed graph whose four cold-load `?focus=` envelopes are GENUINELY DISTINCT,
 * so an `all` / `groups` / `knockout` / match-id frame can never pass by
 * coinciding with the whole-graph box:
 *   - `standings`     at (0, 0)         — group zone (header column)
 *   - `groupMatch`    at (300, 200)     — group zone (a GROUP_STAGE card)
 *   - `knockoutMatch` at (1200, 1600)   — knockout zone, far south-east
 *
 * `boundsOf([standings, groupMatch])` (the `groups` envelope) is a strict sub-box
 * of `boundsOf(nodes)` (the `all` envelope), and `boundsOf([knockoutMatch])` (both
 * the `knockout` envelope AND the `knockoutMatch.id` single-card box) sits ENTIRELY
 * outside the group envelope — so every assertion of "distinct from whole-graph"
 * is non-vacuous. The optional `suffix` mints fresh node ids (and a fresh array),
 * so a refetch is modelled by calling `distinctZoneGraph('-v2')`.
 */
export function distinctZoneGraph(suffix = ''): DistinctZoneGraph {
  const standings = standingsNode({ id: `s1${suffix}`, x: 0, y: 0 });
  const groupMatch = matchNode({ id: `gm1${suffix}`, x: 300, y: 200, stage: 'GROUP_STAGE' });
  const knockoutMatch = matchNode({
    id: `ko1${suffix}`,
    x: 1200,
    y: 1600,
    stage: 'QUARTER_FINALS',
  });
  return { standings, groupMatch, knockoutMatch, nodes: [standings, groupMatch, knockoutMatch] };
}
