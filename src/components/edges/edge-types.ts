import type { EdgeTypes } from '@xyflow/react';
import { AdvanceEdge } from './AdvanceEdge';
import { MemberEdge } from './MemberEdge';
import { RadialEdge } from './RadialEdge';

/** Module-level for a stable reference across renders. The grid `advance`/`member`
 *  edges plus the radial circle `radial` edge; only the active layout mounts. */
export const edgeTypes: EdgeTypes = {
  advance: AdvanceEdge,
  member: MemberEdge,
  radial: RadialEdge,
};
