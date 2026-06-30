import type { Edge, Node } from '@xyflow/react';
import type {
  Group,
  KnockoutStage,
  MatchStatus,
  Score,
  Stage,
  TeamRef,
  Venue,
} from '@/domain/types';

/** Camera focus for the continuous canvas — replaces the old 3-layout view. */
export type RoadmapFocus = 'all' | 'groups' | 'knockout';

/**
 * Selectable graph layout (2026-06-30-1104): `grid` is the default timeline grid;
 * `circle` is the radial knockout bracket (Final at center). Persisted to
 * `?layout=` by `useLayoutMode`, mirroring `useStageView`'s `?focus=`.
 */
export type LayoutMode = 'grid' | 'circle';

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
  /**
   * When supplied, the table header renders as a button that opens the standings
   * overlay for this group (re-homed from the deleted column-title pill).
   */
  onOpenStandings?: (group: string) => void;
  /**
   * Compact column set for the ≤640px overlay: the variable middle stat columns
   * collapse to MP + GD only (`# / Team / MP / GD / Pts`). Default `false` — the
   * always-on canvas node keeps the full 7-stat matrix.
   */
  compact?: boolean;
};

/** Left date-rail guide: one per distinct match-day. No edge endpoint. */
export type DayMarkerNodeData = {
  dayKey: string;
  dayLabel: string;
  dayIndex: number;
};

/**
 * Always-on standings table guide: one per group A..L, sitting at the top of its
 * column as the single per-column header (the old column-title pill is gone).
 * Carries the full `Group` so the renderer reuses `GroupTableNode`, and exposes a
 * bottom source handle so the dashed membership edges fan out of it.
 */
export type GroupStandingsNodeData = {
  group: Group;
  /** Injected by the canvas: a row's flag click sets the focused team. */
  onFocusTeam?: (teamId: string) => void;
  /**
   * Re-homed overlay opener (test-writer type surface): the table header button
   * opens the StandingsOverlay for this group. Injected by the canvas, absent in
   * the pure graph. Implemented by the GREEN stage.
   */
  onOpenStandings?: (group: string) => void;
};

export type MatchFlowNode = Node<MatchNodeData, 'match'>;
export type DayMarkerFlowNode = Node<DayMarkerNodeData, 'day-marker'>;
export type GroupStandingsFlowNode = Node<GroupStandingsNodeData, 'group-standings'>;

// --- Radial "circle" layout node datas (2026-06-30-1104) --------------------

/**
 * Outer-ring team badge (one of the 32 R32 participants — home/away of each R32
 * match). React Flow node id is `badge-<r32MatchId>-<side>` (UNIQUE, since two
 * badges share one R32 matchId) [H4]; `matchId` is the R32 match the panel
 * resolves on click; `teamId` drives team focus.
 */
export type TeamBadgeNodeData = {
  /** The R32 match this participant plays in (what a click opens). */
  matchId: string;
  /** Resolved team id, or null for a TBD placeholder slot. */
  teamId: string | null;
  team: TeamRef;
  code: string | null;
  flagUrl: string | null;
  side: 'home' | 'away';
  /** Resolved-and-lost → dimmed. */
  eliminated: boolean;
  focusState?: FocusState;
  /** Injected by the canvas: activating the flag sets the focused team. */
  onFocusTeam?: (teamId: string) => void;
};

/** Inner-ring KO match dot (R32..SF). Node id === matchId. Status drives color. */
export type MatchDotNodeData = {
  matchId: string;
  stage: KnockoutStage;
  roundLabel: string;
  status: MatchStatus;
  home: TeamRef;
  away: TeamRef;
  /**
   * --- NEW (2026-06-30-1416): DERIVED in `build-radial-graph` (pure); null when
   * the match is undecided OR the winning side is still a placeholder. ---
   * The winning side's RESOLVED `TeamRef` (guarded by the shared `isResolved`
   * rule via `winnerTeamRef`), or null for an undecided / unresolved match.
   */
  winner: TeamRef | null;
  /** `winner.team.code` when resolved, else null — the view reads this primitive [L1]. */
  winnerCode: string | null;
  /** `winner.team.flagUrl` when resolved, else null — the view reads this primitive [L1]. */
  winnerFlagUrl: string | null;
  /** `formatMatchScore(match.score)`, null when the match is undecided. */
  score: string | null;
  focusState?: FocusState;
};

/** Center Final. Node id === Final matchId. */
export type FinalCenterNodeData = {
  matchId: string;
  status: MatchStatus;
  home: TeamRef;
  away: TeamRef;
  /**
   * --- NEW (2026-06-30-1416): the CHAMPION; null until the Final is decided. ---
   * (No `score` field — decision 1: the center shows champion + trophy, not a score.)
   */
  winner: TeamRef | null;
  /** `winner.team.code` when resolved, else null — the view reads this primitive [L1]. */
  winnerCode: string | null;
  /** `winner.team.flagUrl` when resolved, else null — the view reads this primitive [L1]. */
  winnerFlagUrl: string | null;
  focusState?: FocusState;
};

export type TeamBadgeFlowNode = Node<TeamBadgeNodeData, 'team-badge'>;
export type MatchDotFlowNode = Node<MatchDotNodeData, 'match-dot'>;
export type FinalCenterFlowNode = Node<FinalCenterNodeData, 'final-center'>;

/**
 * Timeline-grid graph nodes: one `match` card per match, a `day-marker` per
 * distinct day on the left rail, and a `group-standings` table at the top of each
 * column (the always-on Google-style table — the single per-column header).
 * WIDENED (additively) with the radial `team-badge`/`match-dot`/`final-center`
 * nodes; the grid set is unchanged.
 */
export type RoadmapNode =
  | MatchFlowNode
  | DayMarkerFlowNode
  | GroupStandingsFlowNode
  | TeamBadgeFlowNode
  | MatchDotFlowNode
  | FinalCenterFlowNode;

export type AdvanceEdgeState = 'decided' | 'undecided' | 'live';
export type AdvanceEdgeData = {
  state: AdvanceEdgeState;
  /** Team-focus mark, stamped ONLY by `applyTeamFocus` (display layer). */
  focusState?: FocusState;
};
/**
 * Dashed "membership" link from a group's standings table to each of its
 * group-stage matches (`member-<group>-<matchId>`). Carries the group letter
 * (always populated — mirrors the id grammar) and the optional display-layer
 * `focusState` so the single `applyTeamFocus` stamper handles it like an advance
 * edge. Type surface only here; the GREEN stage emits the edges.
 */
export type MemberEdgeData = {
  /** Group letter this membership link belongs to. */
  group: string;
  /** Team-focus mark, stamped ONLY by `applyTeamFocus` (display layer). */
  focusState?: FocusState;
};
/**
 * Radial connector edge (2026-06-30-1104): a child match → its parent, curving
 * inward toward the geometric center. `cx,cy` are carried on the data so
 * `RadialEdge` can converge to center — React Flow hands the edge only endpoint
 * coords, not the layout center [M1].
 */
export type RadialEdgeData = {
  /** Reuse the advance-edge state vocabulary (decided | undecided | live). */
  state: AdvanceEdgeState;
  cx: number;
  cy: number;
  /** Team-focus mark, stamped ONLY by the display layer. */
  focusState?: FocusState;
};

/** Either an advance/feeder edge, a dashed membership edge, or a radial edge. */
export type RoadmapEdgeData = AdvanceEdgeData | MemberEdgeData | RadialEdgeData;
export type RoadmapEdge = Edge<RoadmapEdgeData>;

export interface RoadmapGraph {
  readonly nodes: RoadmapNode[];
  readonly edges: RoadmapEdge[];
}
