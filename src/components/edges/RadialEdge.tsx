import { memo } from 'react';
import { BaseEdge, type EdgeProps } from '@xyflow/react';
import type { RadialEdgeData, RoadmapEdge } from '@/features/roadmap/graph-model';

/**
 * Custom radial connector: an SVG path from the child (source) inward to its
 * parent (target), curving toward the geometric center `(cx,cy)` carried on
 * `RadialEdgeData` [M1]. The control point of a quadratic Bézier is the midpoint
 * of the two endpoints pulled toward the center, so every edge bows inward and the
 * whole set converges at the trophy. Class `radial-edge radial-edge--{state}` plus
 * `radial-edge--focus-{on|dim}` mirroring `AdvanceEdge`.
 */

/** How far (0..1) the control point is pulled from the chord midpoint to center. */
const CENTER_PULL = 0.35;

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
  const cx = radial?.cx ?? (sourceX + targetX) / 2;
  const cy = radial?.cy ?? (sourceY + targetY) / 2;

  // Quadratic control point: the chord midpoint pulled toward the center, so the
  // path bows inward (a curve command — never the bare straight endpoint line).
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const ctrlX = midX + (cx - midX) * CENTER_PULL;
  const ctrlY = midY + (cy - midY) * CENTER_PULL;
  const path = `M${sourceX},${sourceY} Q${ctrlX},${ctrlY} ${targetX},${targetY}`;

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
