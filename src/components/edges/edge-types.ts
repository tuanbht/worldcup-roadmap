import type { EdgeTypes } from '@xyflow/react';
import { AdvanceEdge } from './AdvanceEdge';
import { MemberEdge } from './MemberEdge';

/** Module-level for a stable reference across renders. */
export const edgeTypes: EdgeTypes = {
  advance: AdvanceEdge,
  member: MemberEdge,
};
