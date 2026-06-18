import type { NodeTypes } from '@xyflow/react';
import { MatchNode } from './MatchNode';
import { DayMarkerNode } from './DayMarkerNode';
import { GroupHeaderNode } from './GroupHeaderNode';

/** Module-level so the reference is stable across renders (React Flow perf). */
export const nodeTypes: NodeTypes = {
  match: MatchNode,
  'day-marker': DayMarkerNode,
  'group-header': GroupHeaderNode,
};
