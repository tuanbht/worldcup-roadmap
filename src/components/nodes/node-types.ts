import type { NodeTypes } from '@xyflow/react';
import { MatchNode } from './MatchNode';
import { DayMarkerNode } from './DayMarkerNode';
import { GroupStandingsNode } from './GroupStandingsNode';
import { TeamBadgeNode } from './TeamBadgeNode';
import { MatchDotNode } from './MatchDotNode';
import { FinalCenterNode } from './FinalCenterNode';

/** Module-level so the reference is stable across renders (React Flow perf). The
 *  grid three (`match`/`day-marker`/`group-standings`) plus the radial circle
 *  three (`team-badge`/`match-dot`/`final-center`); only the active layout mounts. */
export const nodeTypes: NodeTypes = {
  match: MatchNode,
  'day-marker': DayMarkerNode,
  'group-standings': GroupStandingsNode,
  'team-badge': TeamBadgeNode,
  'match-dot': MatchDotNode,
  'final-center': FinalCenterNode,
};
