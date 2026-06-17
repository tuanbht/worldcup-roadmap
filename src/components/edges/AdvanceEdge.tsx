import { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { RoadmapEdge } from '@/features/roadmap/graph-model';

function AdvanceEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<RoadmapEdge>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.35,
  });
  const state = data?.state ?? 'undecided';

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      className={`advance-edge advance-edge--${state}`}
    />
  );
}

export const AdvanceEdge = memo(AdvanceEdgeImpl);
