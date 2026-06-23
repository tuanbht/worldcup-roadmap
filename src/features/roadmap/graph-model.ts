import type { Edge, Node } from '@xyflow/react';
import type { Group, MatchStatus, Score, Stage, TeamRef, Venue } from '@/domain/types';

/** Camera focus for the continuous canvas — replaces the old 3-layout view. */
export type RoadmapFocus = 'all' | 'groups' | 'knockout';

/**
 * Flattened view model for a match card (group OR knockout). Uses `type` (not
 * `interface`) so it satisfies React Flow's `Record<string, unknown>` node-data
 * constraint.
 */
export type MatchNodeData = {
  matchId: string;
  stage: Stage;
  roundLabel: string;
  /** Group letter "A".."L" for group-stage cards; null in the knockout. */
  group: string | null;
  /** Matchday 1..3 in the group stage; null otherwise. */
  matchday: number | null;
  home: TeamRef;
  away: TeamRef;
  score: Score;
  status: MatchStatus;
  kickoff: string | null;
  minute: number | null;
  venue: Venue;
  isFinal: boolean;
  isThirdPlace: boolean;
  /**
   * Display-layer flag set ONLY by the canvas (`applyNearestFlag`) to mark the
   * single "nearest" match — the focus-button target. `buildRoadmapGraph` never
   * sets this, so the graph stays pure / time-independent. Absent/false elsewhere.
   */
  isNearest?: boolean;
};

/**
 * Props for the standings table — now an on-demand overlay panel, NOT a
 * positioned graph node. Kept as a plain type so `GroupTableNode`/`StandingsOverlay`
 * still type-check.
 */
export type GroupTableProps = {
  group: Group;
};

/** Left date-rail guide: one per distinct match-day. No edge endpoint. */
export type DayMarkerNodeData = {
  dayKey: string;
  dayLabel: string;
  dayIndex: number;
};

/**
 * Top column guide: one per group A..L. Originates feeder edges (bottom source
 * handle) and opens the standings overlay when clicked.
 */
export type GroupHeaderNodeData = {
  group: string;
  /** Open the standings overlay for this group (wired by the canvas). */
  onOpenStandings?: (group: string) => void;
};

export type MatchFlowNode = Node<MatchNodeData, 'match'>;
export type DayMarkerFlowNode = Node<DayMarkerNodeData, 'day-marker'>;
export type GroupHeaderFlowNode = Node<GroupHeaderNodeData, 'group-header'>;
/**
 * Timeline-grid graph nodes: one `match` card per match, a `day-marker` per
 * distinct day on the left rail, and a `group-header` per column. The positioned
 * `group` table node is gone — standings moved to an on-demand overlay.
 */
export type RoadmapNode = MatchFlowNode | DayMarkerFlowNode | GroupHeaderFlowNode;

export type AdvanceEdgeState = 'decided' | 'undecided' | 'live';
export type AdvanceEdgeData = { state: AdvanceEdgeState };
export type RoadmapEdge = Edge<AdvanceEdgeData>;

export interface RoadmapGraph {
  readonly nodes: RoadmapNode[];
  readonly edges: RoadmapEdge[];
}
