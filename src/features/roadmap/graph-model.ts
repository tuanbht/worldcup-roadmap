import type { Edge, Node } from '@xyflow/react';
import type { Group, MatchStatus, Score, Stage, TeamRef, Venue } from '@/domain/types';

export type RoadmapView = 'groups' | 'bracket' | 'full';

/**
 * Flattened view model for a knockout match card. Uses `type` (not `interface`)
 * so it satisfies React Flow's `Record<string, unknown>` node-data constraint.
 */
export type MatchNodeData = {
  matchId: string;
  stage: Stage;
  roundLabel: string;
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
