import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Trophy } from 'lucide-react';
import { refLabel } from '@/domain/types';
import type { FinalCenterFlowNode } from '@/features/roadmap/graph-model';

const HANDLE = '!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0';

/**
 * Center Final + trophy motif — the visual focal point of the circle. An elevated
 * gold-glow roundel with the lucide `Trophy` glyph and the two Final teams.
 * Carries `data-final="true"` (string, the e2e center selector) [L1] and the Final
 * `matchId` so a click opens its panel (via the canvas `onNodeClick`); reflects
 * `focusState` via `data-focus`.
 */
function FinalCenterNodeImpl({ data }: NodeProps<FinalCenterFlowNode>) {
  const { status, home, away, focusState } = data;

  return (
    <div
      className="radial-center grid place-items-center text-center"
      data-final="true"
      data-status={status}
      data-focus={focusState}
    >
      <Handle id="t" type="target" position={Position.Top} className={HANDLE} />
      <span className="radial-center__glow" aria-hidden="true" />
      <Trophy className="radial-center__trophy text-gold relative" aria-hidden="true" />
      <div className="radial-center__teams text-ink relative mt-1 flex flex-col gap-0.5 text-[0.6rem] font-semibold">
        <span className="truncate" title={refLabel(home)}>
          {refLabel(home)}
        </span>
        <span className="text-dim text-[0.5rem] font-medium">v</span>
        <span className="truncate" title={refLabel(away)}>
          {refLabel(away)}
        </span>
      </div>
    </div>
  );
}

export const FinalCenterNode = memo(FinalCenterNodeImpl);
