import { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { RoadmapEdge } from '@/features/roadmap/graph-model';

/**
 * Dashed "membership" connector: a group's standings table -> each of its
 * group-stage matches (requirement item 2). A low-emphasis grouping line, NOT an
 * advancement arrow, so it carries NO `markerEnd`. The team-focus modifier
 * (item 3) appends `member-edge--focus-on` for a link on the focused team's path
 * and `member-edge--focus-dim` for the rest — APPENDED alongside the base class so
 * geometry is unchanged and the highlight/dim is pure compositor opacity.
 */
function MemberEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
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
  const focusState = data && 'focusState' in data ? data.focusState : undefined;
  const focusClass = focusState ? ` member-edge--focus-${focusState}` : '';

  return <BaseEdge id={id} path={path} className={`member-edge${focusClass}`} />;
}

export const MemberEdge = memo(MemberEdgeImpl);
