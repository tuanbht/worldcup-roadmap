'use client';

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
  const { home, away, score, status, isFinal, isThirdPlace } = data;
  const showScore = status !== 'scheduled';
  const finished = status === 'finished';
  const homeWin = score.winner === 'home';
  const awayWin = score.winner === 'away';

  return (
    <article
      className={CARD}
      data-status={status}
      data-final={isFinal}
      data-third={isThirdPlace}
      data-selected={selected}
      tabIndex={0}
      aria-label={ariaLabel(data)}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-edge-strong group-data-[status=live]:bg-live group-data-[final=true]:bg-gold"
      />
      <Handle id="tl" type="target" position={Position.Left} className={HANDLE} />
      <Handle id="tr" type="target" position={Position.Right} className={HANDLE} />

      <header className="flex items-center justify-between gap-2">
        <span className="truncate text-[0.72rem] uppercase tracking-[0.08em] text-dim">{data.roundLabel}</span>
        <StatusPill status={status} minute={data.minute} kickoff={data.kickoff} />
      </header>

      <div className="mt-0.5 flex flex-1 flex-col justify-center gap-0.5">
        <TeamRow team={home} goals={score.home} penalty={score.penaltyHome} isWinner={homeWin} dim={finished && awayWin} showScore={showScore} />
        <TeamRow team={away} goals={score.away} penalty={score.penaltyAway} isWinner={awayWin} dim={finished && homeWin} showScore={showScore} />
      </div>

      <footer data-lod-detail className="flex items-center justify-between gap-2 text-[0.72rem] text-muted">
        <span>{formatDateTime(data.kickoff)}</span>
        {data.venue.name && <span className="max-w-[50%] truncate">{data.venue.name}</span>}
      </footer>

      <Handle id="sl" type="source" position={Position.Left} className={HANDLE} />
      <Handle id="sr" type="source" position={Position.Right} className={HANDLE} />
    </article>
  );
}

export const MatchNode = memo(MatchNodeImpl);
