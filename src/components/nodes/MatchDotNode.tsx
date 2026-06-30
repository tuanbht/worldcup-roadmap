import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { refLabel } from '@/domain/types';
import type { MatchDotFlowNode } from '@/features/roadmap/graph-model';

const HANDLE = '!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0';

/**
 * Inner-ring KO match dot (R32..SF). A small status-ringed junction: `data-status`
 * (live/finished/scheduled → the live/decided/undecided color), `data-focus` from
 * `focusState`, a source (inward, to the parent) + target (outward, from children)
 * `Handle` for the radial edges, and an accessible label naming the matchup so SR
 * users can reach the match; a click opens the panel via the canvas `onNodeClick`.
 */
function MatchDotNodeImpl({ data }: NodeProps<MatchDotFlowNode>) {
  const { status, roundLabel, home, away, focusState } = data;
  const label = `${roundLabel}: ${refLabel(home)} versus ${refLabel(away)}`;

  return (
    <div
      className="radial-dot grid place-items-center"
      data-status={status}
      data-focus={focusState}
      aria-label={label}
      role="img"
    >
      <Handle id="t" type="target" position={Position.Top} className={HANDLE} />
      <span className="radial-dot__core block rounded-full" aria-hidden="true" />
      <Handle id="b" type="source" position={Position.Bottom} className={HANDLE} />
    </div>
  );
}

export const MatchDotNode = memo(MatchDotNodeImpl);
