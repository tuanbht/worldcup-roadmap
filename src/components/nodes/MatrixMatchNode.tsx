import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { isResolved, refLabel } from '@/domain/types';
import type { MatrixMatchNodeData, MatrixMatchFlowNode } from '@/features/roadmap/graph-model';
import type { TeamRef } from '@/domain/types';
import { Flag } from '@/components/ui/Flag';

// Handles are pinned to the station's vertical CENTER (left/right edges) so the
// horizontal lane edges attach center-to-center along the subway line. Kept
// invisible + zero-footprint like the radial dot's handles.
const HANDLE = '!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0';
const HANDLE_MID = { top: '50%', transform: 'translateY(-50%)' } as const;

/** The `code`/`flagUrl` primitives for a side (null for a placeholder). */
function sideFlag(ref: TeamRef): { code: string | null; flagUrl: string | null } {
  return isResolved(ref)
    ? { code: ref.team.code, flagUrl: ref.team.flagUrl }
    : { code: null, flagUrl: null };
}

/** One team row of the station: its flag roundel + label. */
function StationTeam({ team }: { team: TeamRef }) {
  const { code, flagUrl } = sideFlag(team);
  return (
    <span className="matrix-station__team flex min-w-0 items-center gap-1.5">
      <Flag code={code} url={flagUrl} size={16} shape="round" />
      <span className="matrix-station__name truncate">{refLabel(team)}</span>
    </span>
  );
}

/** The accessible name: the round, the matchup, and the score when decided. */
function stationAria(data: MatrixMatchNodeData): string {
  const matchup = `${data.roundLabel}: ${refLabel(data.home)} versus ${refLabel(data.away)}`;
  return data.score !== null ? `${matchup} — ${data.score}` : matchup;
}

/**
 * The `matrix-match` STATION node of the subway/journey view — where two team
 * lanes meet. Renders its header (group/round), both teams (`Flag`/`refLabel`), and
 * a score/status caption (the score only for a decided match; a scheduled match
 * shows its status pill instead). A placeholder side shows its label via `refLabel`
 * with no flag/score. `data-status` (live/finished/scheduled) drives the status
 * color; `data-final`/`data-third` accent the final band. Left `target` + Right
 * `source` `Handle`s carry the horizontal lane edges. `role="img"` + an aria-label
 * naming the matchup keeps the station reachable for SR users; a click opens the
 * detail panel via the canvas `onNodeClick`.
 */
function MatrixMatchNodeImpl({ data }: NodeProps<MatrixMatchFlowNode>) {
  const { roundLabel, home, away, score, status, isFinal, isThirdPlace } = data;
  const decided = score !== null;

  return (
    <div
      className="matrix-station"
      data-status={status}
      data-final={isFinal ? 'true' : undefined}
      data-third={isThirdPlace ? 'true' : undefined}
      role="img"
      aria-label={stationAria(data)}
    >
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className={HANDLE}
        style={HANDLE_MID}
      />

      <header className="matrix-station__head flex items-center justify-between gap-2">
        <span className="matrix-station__round truncate">{roundLabel}</span>
        <span className="matrix-station__status" data-status={status} aria-hidden="true">
          {decided ? score : status === 'live' ? 'LIVE' : 'TBD'}
        </span>
      </header>

      <div className="matrix-station__teams mt-1 flex flex-col gap-1">
        <StationTeam team={home} />
        <StationTeam team={away} />
      </div>

      <Handle
        id="out"
        type="source"
        position={Position.Right}
        className={HANDLE}
        style={HANDLE_MID}
      />
    </div>
  );
}

export const MatrixMatchNode = memo(MatrixMatchNodeImpl);
