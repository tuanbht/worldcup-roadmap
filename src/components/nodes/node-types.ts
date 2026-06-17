import type { NodeTypes } from '@xyflow/react';
import { MatchNode } from './MatchNode';
import { GroupTableNode } from './GroupTableNode';

/** Module-level so the reference is stable across renders (React Flow perf). */
export const nodeTypes: NodeTypes = {
  match: MatchNode,
  group: GroupTableNode,
};
