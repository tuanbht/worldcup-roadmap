import type { Edge, Node } from '@xyflow/react';
import type { Group, MatchStatus, Score, Stage, TeamRef, Venue } from '@/domain/types';

/** Camera focus for the continuous canvas — replaces the old 3-layout view. */
export type RoadmapFocus = 'all' | 'groups' | 'knockout';

/**
 * Display-layer team-focus mark, stamped ONLY by `applyTeamFocus` in the canvas
 * (never by `buildRoadmapGraph`): `'on'` for a node/edge on the focused team's
 * path, `'dim'` for everything else, absent when no team is focused.
 */
export type FocusState = 'on' | 'dim';

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
  /**
   * Team-focus mark, set ONLY by the display layer (`applyTeamFocus`) like
   * `isNearest`: `'on'` when this match is on the focused team's path, `'dim'`
   * otherwise, absent when no team is focused. Drives `data-focus` on the card.
   */
  focusState?: FocusState;
  /**
   * Injected by the canvas: clicking/activating a resolved team's flag in this
   * card sets the focused team. Absent in the pure graph.
   */
  onFocusTeam?: (teamId: string) => void;
};

/**
 * Props for the standings table. Rendered in TWO surfaces: the always-on
 * `GroupStandingsNode` (passes `onFocusTeam`, so each row's flag is a focusable
 * button) AND the on-demand `StandingsOverlay` (passes none, so flags stay
 * decorative). `onFocusTeam` is optional — absent in the overlay path.
 */
export type GroupTableProps = {
  group: Group;
  /** Set the focused team when a resolved row's flag is activated. */
  onFocusTeam?: (teamId: string) => void;
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

/**
 * Always-on standings table guide: one per group A..L, anchored directly under
 * its `group-header` in the (grown) header band. Carries the full `Group` so the
 * renderer reuses `GroupTableNode`; no edge endpoints (a guide, not a card).
 */
export type GroupStandingsNodeData = {
  group: Group;
  /** Injected by the canvas: a row's flag click sets the focused team. */
  onFocusTeam?: (teamId: string) => void;
};

export type MatchFlowNode = Node<MatchNodeData, 'match'>;
export type DayMarkerFlowNode = Node<DayMarkerNodeData, 'day-marker'>;
export type GroupHeaderFlowNode = Node<GroupHeaderNodeData, 'group-header'>;
export type GroupStandingsFlowNode = Node<GroupStandingsNodeData, 'group-standings'>;
/**
 * Timeline-grid graph nodes: one `match` card per match, a `day-marker` per
 * distinct day on the left rail, a `group-header` per column, and a
 * `group-standings` table under each header (the always-on Google-style table).
 */
export type RoadmapNode =
  | MatchFlowNode
  | DayMarkerFlowNode
  | GroupHeaderFlowNode
  | GroupStandingsFlowNode;

export type AdvanceEdgeState = 'decided' | 'undecided' | 'live';
export type AdvanceEdgeData = {
  state: AdvanceEdgeState;
  /** Team-focus mark, stamped ONLY by `applyTeamFocus` (display layer). */
  focusState?: FocusState;
};
export type RoadmapEdge = Edge<AdvanceEdgeData>;

export interface RoadmapGraph {
  readonly nodes: RoadmapNode[];
  readonly edges: RoadmapEdge[];
}
