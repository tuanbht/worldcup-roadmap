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
};

export type GroupNodeData = {
  group: Group;
};

export type MatchFlowNode = Node<MatchNodeData, 'match'>;
export type GroupFlowNode = Node<GroupNodeData, 'group'>;
export type RoadmapNode = MatchFlowNode | GroupFlowNode;

export type AdvanceEdgeState = 'decided' | 'undecided' | 'live';
export type AdvanceEdgeData = { state: AdvanceEdgeState };
export type RoadmapEdge = Edge<AdvanceEdgeData>;

export interface RoadmapGraph {
  readonly nodes: RoadmapNode[];
  readonly edges: RoadmapEdge[];
}
