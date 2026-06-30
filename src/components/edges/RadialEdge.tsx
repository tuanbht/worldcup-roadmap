import { memo } from 'react';
import { BaseEdge, type EdgeProps } from '@xyflow/react';
import type { RadialEdgeData, RoadmapEdge } from '@/features/roadmap/graph-model';

/**
 * Custom radial connector: a STRAIGHT SVG line from the child (source) inward to
 * its parent (target). Because every child sits on an outer ring and its parent on
 * the next ring in toward the center, the straight child→parent segments form a
 * geometric "matrix" web of spokes converging at the trophy — the bracket read as
 * a road-to-the-final lattice rather than curved petals. Class
 * `radial-edge radial-edge--{state}` plus `radial-edge--focus-{on|dim}` mirroring
 * `AdvanceEdge`.
 */

function RadialEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  data,
}: EdgeProps<RoadmapEdge>) {
  const radial = (data ?? undefined) as RadialEdgeData | undefined;
  const state = radial?.state ?? 'undecided';

  // A straight line command from child to parent — the match-to-match "matrix"
  // edge. The center `(cx,cy)` on RadialEdgeData is no longer used for a curve;
  // the inward direction comes for free from the ring geometry of the endpoints.
  const path = `M${sourceX},${sourceY} L${targetX},${targetY}`;

  const focusClass = radial?.focusState ? ` radial-edge--focus-${radial.focusState}` : '';

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      className={`radial-edge radial-edge--${state}${focusClass}`}
    />
  );
}

export const RadialEdge = memo(RadialEdgeImpl);
