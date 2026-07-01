import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { refLabel } from '@/domain/types';
import type { MatchDotFlowNode } from '@/features/roadmap/graph-model';
import { formatDateTime, localTimeZone } from '@/lib/datetime';
import { Flag } from '@/components/ui/Flag';

const HANDLE = '!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0';
/** Pin both handles to the dot's CENTER so the straight radial connectors attach
 *  at the node center (the polar point) — not the top/bottom edge — keeping the
 *  lines aligned with the roundel instead of meeting it off-center. */
const HANDLE_CENTER = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' } as const;

/** Winner-roundel diameter by ring [M3]: R32/R16/QF ≤18px (fits DOT_SIZE), SF
 *  ≤16px (a hard cap so a roundel can't overflow into the dense neighbour band). */
const ROUNDEL_PX: Record<MatchDotFlowNode['data']['stage'], number> = {
  ROUND_OF_32: 18,
  ROUND_OF_16: 18,
  QUARTER_FINALS: 18,
  SEMI_FINALS: 16,
  THIRD_PLACE: 16,
  FINAL: 18,
};

/** Inline score caption shows only on the outer rings; the tight SF ring keeps the
 *  score reachable via title/aria instead (decision 3) — no always-on center cluster. */
const INLINE_SCORE_STAGES: ReadonlySet<MatchDotFlowNode['data']['stage']> = new Set([
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER_FINALS',
]);

/**
 * Inner-ring KO match dot (R32..SF) — the WINNER of its match. A DECIDED dot
 * renders the winning team's round `Flag shape="round"` roundel inside the
 * `data-status` ring plus a compact `.radial-dot__score` caption (suppressed to
 * `title`/`aria` on the tight SF ring per M3); an UNDECIDED dot keeps the neutral
 * `.radial-dot__core` (TBD) and shows no score. `data-status` (live/finished/
 * scheduled → the live/decided/undecided color) and `data-focus` are retained; a
 * source (inward) + target (outward) `Handle` carry the radial edges, and an
 * accessible label names the matchup (and "won by …" for a decided node) so SR
 * users can reach the match. A click opens the panel via the canvas `onNodeClick`.
 */
function MatchDotNodeImpl({ data }: NodeProps<MatchDotFlowNode>) {
  const { status, stage, roundLabel, home, away, winner, winnerCode, winnerFlagUrl, score } = data;
  const { focusState, kickoff } = data;
  const decided = winner !== null;
  const matchup = `${roundLabel}: ${refLabel(home)} versus ${refLabel(away)}`;
  const winnerName = decided ? refLabel(winner) : null;
  // Kick-off caption in the viewer's LOCAL browser zone (single date façade),
  // resolved explicitly so the zone is read once at the view boundary; "Date TBD"
  // when null.
  const when = formatDateTime(kickoff, localTimeZone());
  const outcome =
    decided && score !== null
      ? `${matchup} — won by ${winnerName} ${score}`
      : decided
        ? `${matchup} — won by ${winnerName}`
        : matchup;
  // Fold the date/time into the SR label so the kickoff reaches assistive tech too.
  const label = `${outcome} — ${when}`;
  const showInlineScore = decided && score !== null && INLINE_SCORE_STAGES.has(stage);
  // The SF score is kept reachable on the wrapper's title even when the inline
  // caption is suppressed (it is also in the aria-label above).
  const dotTitle = decided && score !== null ? `${winnerName ?? ''} ${score}`.trim() : undefined;

  return (
    <div
      className="radial-dot grid place-items-center"
      data-status={status}
      data-focus={focusState}
      aria-label={label}
      title={dotTitle}
      role="img"
    >
      <Handle
        id="t"
        type="target"
        position={Position.Top}
        className={HANDLE}
        style={HANDLE_CENTER}
      />
      {decided ? (
        <span className="radial-dot__flag block" aria-hidden="true">
          <Flag code={winnerCode} url={winnerFlagUrl} size={ROUNDEL_PX[stage]} shape="round" />
        </span>
      ) : (
        <span className="radial-dot__core block rounded-full" aria-hidden="true" />
      )}
      {showInlineScore && (
        <span className="radial-dot__score block" aria-hidden="true">
          {score}
        </span>
      )}
      {/* Kick-off caption: a real <time> carrying the raw ISO instant on its
          `dateTime` (omitted for a TBD kickoff so the attribute is never invalid);
          value also folded into the aria-label above, so hide it from SR here. */}
      <time className="radial-dot__when" dateTime={kickoff ?? undefined} aria-hidden="true">
        {when}
      </time>
      <Handle
        id="b"
        type="source"
        position={Position.Bottom}
        className={HANDLE}
        style={HANDLE_CENTER}
      />
    </div>
  );
}

export const MatchDotNode = memo(MatchDotNodeImpl);
