import type { EdgeTypes } from '@xyflow/react';
import { AdvanceEdge } from './AdvanceEdge';
import { MemberEdge } from './MemberEdge';
import { RadialEdge } from './RadialEdge';
import { MatrixLaneEdge } from './MatrixLaneEdge';

/** Module-level for a stable reference across renders. The grid `advance`/`member`
 *  edges, the radial circle `radial` edge, plus the matrix `matrix-lane` edge; only
 *  the active layout mounts. */
export const edgeTypes: EdgeTypes = {
  advance: AdvanceEdge,
  member: MemberEdge,
  radial: RadialEdge,
  'matrix-lane': MatrixLaneEdge,
};
