import type { EdgeTypes } from '@xyflow/react';
import { AdvanceEdge } from './AdvanceEdge';

/** Module-level for a stable reference across renders. */
export const edgeTypes: EdgeTypes = {
  advance: AdvanceEdge,
};
