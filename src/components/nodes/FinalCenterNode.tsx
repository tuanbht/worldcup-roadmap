import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Trophy } from 'lucide-react';
import { refLabel } from '@/domain/types';
import type { FinalCenterFlowNode } from '@/features/roadmap/graph-model';
import { formatDateTime, localTimeZone } from '@/lib/datetime';
import { Flag } from '@/components/ui/Flag';

const HANDLE = '!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0';
/** Pin the handle to the center so the two inward SF connectors converge exactly
 *  at the trophy, not at the top edge of the 96px center node. */
const HANDLE_CENTER = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' } as const;

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
  const { status, home, away, focusState, winner, winnerCode, winnerFlagUrl, kickoff } = data;
  const champion = winner !== null ? refLabel(winner) : null;
  // Kick-off caption in the viewer's LOCAL browser zone (single date façade),
  // resolved explicitly at the view boundary; "Date TBD" when null.
  const when = formatDateTime(kickoff, localTimeZone());
  // The center had no aria-label; add one naming the Final matchup + folding in the
  // kickoff so SR users reach the date/time (the visible <time> is aria-hidden).
  const matchup = `Final: ${refLabel(home)} versus ${refLabel(away)}`;
  const label =
    champion !== null ? `${matchup} — champion ${champion} — ${when}` : `${matchup} — ${when}`;

  return (
    <div
      className="radial-center grid place-items-center text-center"
      data-final="true"
      data-status={status}
      data-focus={focusState}
      aria-label={label}
      role="img"
    >
      <Handle
        id="t"
        type="target"
        position={Position.Top}
        className={HANDLE}
        style={HANDLE_CENTER}
      />
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
      {/* Kick-off caption: a real <time> carrying the raw ISO instant on `dateTime`
          (omitted for a TBD kickoff); value also folded into the aria-label above. */}
      <time className="radial-dot__when" dateTime={kickoff ?? undefined} aria-hidden="true">
        {when}
      </time>
    </div>
  );
}

export const FinalCenterNode = memo(FinalCenterNodeImpl);
