import type { NodeTypes } from '@xyflow/react';
import { MatchNode } from './MatchNode';
import { DayMarkerNode } from './DayMarkerNode';
import { GroupHeaderNode } from './GroupHeaderNode';
import { GroupStandingsNode } from './GroupStandingsNode';

/** Module-level so the reference is stable across renders (React Flow perf). */
export const nodeTypes: NodeTypes = {
  match: MatchNode,
  'day-marker': DayMarkerNode,
  'group-header': GroupHeaderNode,
  'group-standings': GroupStandingsNode,
};
