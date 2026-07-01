import { memo } from 'react';
import { BaseEdge, Position, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { MATRIX_CORNER_RADIUS } from '@/features/roadmap/layout/matrix-constants';
import type { MatrixLaneEdgeData, RoadmapEdge } from '@/features/roadmap/graph-model';

/**
 * The `matrix-lane` edge of the subway/journey view — one team's orthogonal hop
 * between two consecutive stations. A thin wrapper over React Flow's
 * `getSmoothStepPath` (mirroring `RadialEdge`): the station handles are
 * Right(source) → Left(target), so the path is a corner-rich horizontal weave with
 * slightly rounded corners — the "matrix" look. The per-team `stroke` comes from
 * `data.color` (stamped once, purely, by the builder) via an inline `style` on
 * `<BaseEdge>`; the `.matrix-lane` class carries only width/linecap/linejoin.
 *
 * v1 renders `data.color` stroke ONLY — the reserved `.matrix-lane--focus-dim`
 * class is intentionally left UNWIRED (plan-review M2), so a stray team-focus
 * dim-stamp can never wash out every lane before the deferred focus feature lands.
 */
function MatrixLaneEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  data,
}: EdgeProps<RoadmapEdge>) {
  const lane = (data ?? undefined) as MatrixLaneEdgeData | undefined;
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition: Position.Right,
    targetX,
    targetY,
    targetPosition: Position.Left,
    borderRadius: MATRIX_CORNER_RADIUS,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      className="matrix-lane"
      style={lane?.color ? { stroke: lane.color } : undefined}
    />
  );
}

export const MatrixLaneEdge = memo(MatrixLaneEdgeImpl);
