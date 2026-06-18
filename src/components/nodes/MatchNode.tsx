import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { refLabel } from '@/domain/types';
import type { MatchFlowNode } from '@/features/roadmap/graph-model';
import { formatDateTime } from '@/features/roadmap/format';
import { StatusPill } from './StatusPill';
import { TeamRow } from './TeamRow';

const CARD = [
  'group relative flex h-[96px] w-[260px] flex-col rounded-[14px] border px-3 py-2',
  'border-edge bg-gradient-to-b from-surf-2 to-surf-1 shadow-[var(--elevation-card)]',
  '[contain:layout_paint] transition-[transform,border-color,box-shadow] duration-150',
  'ease-[cubic-bezier(0.16,1,0.3,1)]',
  'hover:-translate-y-0.5 hover:border-edge-strong hover:shadow-[var(--elevation-hover)]',
  'focus-visible:border-accent focus-visible:shadow-[var(--glow-accent)] focus-visible:outline-none',
  'data-[selected=true]:border-accent data-[selected=true]:shadow-[var(--glow-accent)]',
  'data-[status=live]:border-live/50',
  'data-[final=true]:border-gold/50 data-[final=true]:from-surf-3',
].join(' ');

const HANDLE = '!h-1.5 !w-1.5 !border-0 !bg-edge-strong !opacity-0';

function ariaLabel(data: MatchFlowNode['data']): string {
  const { home, away, score, status, roundLabel } = data;
  if (status === 'scheduled') {
    return `${roundLabel}: ${refLabel(home)} versus ${refLabel(away)}, ${formatDateTime(data.kickoff)}`;
  }
  const tail = status === 'live' ? 'in play' : 'full time';
  return `${roundLabel}: ${refLabel(home)} ${score.home ?? 0}, ${refLabel(away)} ${score.away ?? 0}, ${tail}`;
}

function MatchNodeImpl({ data, selected }: NodeProps<MatchFlowNode>) {
  const { home, away, score, status, isFinal, isThirdPlace, group, matchday } = data;
  const showScore = status !== 'scheduled';
  const finished = status === 'finished';
  const homeWin = score.winner === 'home';
  const awayWin = score.winner === 'away';
  // A group match is labelled by its group whenever the group is known; the
  // matchday is appended only when available (FIFA omits MatchDay for WC-2026,
  // so it can be null even though GroupName is present).
  const isGroup = group !== null;
  const groupLabel = !isGroup
    ? data.roundLabel
    : matchday !== null
      ? `Group ${group} · MD${matchday}`
      : `Group ${group}`;

  return (
    <article
      className={CARD}
      data-status={status}
      data-final={isFinal}
      data-third={isThirdPlace}
      data-group={isGroup}
      data-selected={selected}
      tabIndex={0}
      aria-label={ariaLabel(data)}
    >
      <span
        aria-hidden="true"
        className="bg-edge-strong group-data-[status=live]:bg-live group-data-[final=true]:bg-gold group-data-[group=true]:bg-accent absolute inset-y-2.5 left-0 w-[3px] rounded-full"
      />
      <Handle id="t" type="target" position={Position.Top} className={HANDLE} />

      <header className="flex items-center justify-between gap-2">
        <span className="text-dim truncate text-[0.72rem] tracking-[0.08em] uppercase">
          {groupLabel}
        </span>
        <StatusPill status={status} minute={data.minute} kickoff={data.kickoff} />
      </header>

      <div className="mt-0.5 flex flex-1 flex-col justify-center gap-0.5">
        <TeamRow
          team={home}
          goals={score.home}
          penalty={score.penaltyHome}
          isWinner={homeWin}
          dim={finished && awayWin}
          showScore={showScore}
        />
        <TeamRow
          team={away}
          goals={score.away}
          penalty={score.penaltyAway}
          isWinner={awayWin}
          dim={finished && homeWin}
          showScore={showScore}
        />
      </div>

      <footer
        data-lod-detail
        className="text-muted flex items-center justify-between gap-2 text-[0.72rem]"
      >
        <span>{formatDateTime(data.kickoff)}</span>
        {data.venue.name && <span className="max-w-[50%] truncate">{data.venue.name}</span>}
      </footer>

      <Handle id="b" type="source" position={Position.Bottom} className={HANDLE} />
    </article>
  );
}

export const MatchNode = memo(MatchNodeImpl);
