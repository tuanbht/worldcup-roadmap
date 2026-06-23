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
  // Team-focus modifier (item 3): bright `--focus-on` for an edge on the focused
  // team's path, `--focus-dim` for the rest, absent when no team is focused. It
  // is APPENDED alongside the state class so geometry is unchanged.
  const focusClass = data?.focusState ? ` advance-edge--focus-${data.focusState}` : '';

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      className={`advance-edge advance-edge--${state}${focusClass}`}
    />
  );
}

export const AdvanceEdge = memo(AdvanceEdgeImpl);
