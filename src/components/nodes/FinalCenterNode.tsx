import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Trophy } from 'lucide-react';
import { refLabel } from '@/domain/types';
import type { FinalCenterFlowNode } from '@/features/roadmap/graph-model';
import { Flag } from '@/components/ui/Flag';

const HANDLE = '!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0';

/** Champion roundel diameter — sized to sit beside the trophy in the 96px center. */
const CHAMPION_PX = 22;

/**
 * Center Final + trophy motif — the visual focal point of the circle. An elevated
 * gold-glow roundel with the lucide `Trophy` glyph and the two Final teams. When
 * the Final is DECIDED (`winner !== null`) it renders the CHAMPION's round
 * `Flag shape="round"` beside the trophy; while it is live/undecided it shows the
 * trophy + teams only (NO champion flag, NO score — the headline TBD case,
 * decision 1). Carries `data-final="true"` (the e2e center selector) and the Final
 * `matchId` so a click opens its panel (via the canvas `onNodeClick`); reflects
 * `focusState` via `data-focus`.
 */
function FinalCenterNodeImpl({ data }: NodeProps<FinalCenterFlowNode>) {
  const { status, home, away, focusState, winner, winnerCode, winnerFlagUrl } = data;
  const champion = winner !== null ? refLabel(winner) : null;

  return (
    <div
      className="radial-center grid place-items-center text-center"
      data-final="true"
      data-status={status}
      data-focus={focusState}
    >
      <Handle id="t" type="target" position={Position.Top} className={HANDLE} />
      <span className="radial-center__glow" aria-hidden="true" />
      <div className="radial-center__crown relative flex items-center justify-center gap-1">
        <Trophy className="radial-center__trophy text-gold" aria-hidden="true" />
        {champion !== null && (
          <span className="radial-center__champion block" title={champion}>
            <Flag code={winnerCode} url={winnerFlagUrl} size={CHAMPION_PX} shape="round" />
          </span>
        )}
      </div>
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
