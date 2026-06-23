import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { refLabel } from '@/domain/types';
import type { MatchFlowNode } from '@/features/roadmap/graph-model';
import { formatDateTime } from '@/features/roadmap/format';
import { NearestBadge } from './NearestBadge';
import { StatusPill } from './StatusPill';
import { TeamRow } from './TeamRow';

// Base card classes WITHOUT the `contain` token — the nearest card relaxes paint
// clipping so its pennant can overflow above the box (see `containClass`).
const CARD = [
  'group relative flex h-[108px] w-[260px] flex-col rounded-[14px] border px-3 py-2',
  'border-edge bg-gradient-to-b from-surf-2 to-surf-1 shadow-[var(--elevation-card)]',
  'transition-[transform,border-color,box-shadow] duration-150',
  'ease-[cubic-bezier(0.16,1,0.3,1)]',
  'hover:-translate-y-0.5 hover:border-edge-strong hover:shadow-[var(--elevation-hover)]',
  'focus-visible:border-accent focus-visible:shadow-[var(--glow-accent)] focus-visible:outline-none',
  'data-[selected=true]:border-accent data-[selected=true]:shadow-[var(--glow-accent)]',
  'data-[status=live]:border-live/50',
  'data-[final=true]:border-gold/50 data-[final=true]:from-surf-3',
  // Nearest emphasis — cue 1: a distinct-hue ring/glow keyed on `data-nearest`,
  // visually distinct from the green `--glow-accent` selected state. Live nearest
  // upgrades to the warm `--glow-nearest-live` ring to match the live affordance.
  'data-[nearest=true]:border-edge-strong data-[nearest=true]:shadow-[var(--glow-nearest)]',
  'data-[nearest=true]:data-[status=live]:border-live/60 data-[nearest=true]:data-[status=live]:shadow-[var(--glow-nearest-live)]',
].join(' ');

/**
 * The nearest card relaxes containment to `[contain:layout]` (keeps layout
 * isolation, drops paint clipping) so the pennant overflows above un-clipped;
 * every other card keeps `[contain:layout_paint]` for paint isolation/perf.
 */
function containClass(isNearest: boolean): string {
  return isNearest ? '[contain:layout]' : '[contain:layout_paint]';
}

const HANDLE = '!h-1.5 !w-1.5 !border-0 !bg-edge-strong !opacity-0';

/**
 * Header label: a group card reads "Group A · MD1" (or just "Group A" when the
 * provider omitted the matchday); a knockout card uses the round name.
 */
function displayLabel(data: MatchFlowNode['data']): string {
  const { group, matchday, roundLabel } = data;
  if (group === null) return roundLabel;
  return matchday !== null ? `Group ${group} · MD${matchday}` : `Group ${group}`;
}

function baseAriaLabel(data: MatchFlowNode['data']): string {
  const { home, away, score, status } = data;
  const label = displayLabel(data);
  if (status === 'scheduled') {
    return `${label}: ${refLabel(home)} versus ${refLabel(away)}, ${formatDateTime(data.kickoff)}`;
  }
  const tail = status === 'live' ? 'in play' : 'full time';
  return `${label}: ${refLabel(home)} ${score.home ?? 0}, ${refLabel(away)} ${score.away ?? 0}, ${tail}`;
}

/**
 * Card accessible name. When the card is the nearest match (the focus-button
 * target), append a concise suffix so AT announces it — "— live match" for a live
 * nearest, "— current match" otherwise. The base label is preserved verbatim, so
 * non-nearest cards are unaffected (Acceptance #6).
 */
function ariaLabel(data: MatchFlowNode['data']): string {
  const base = baseAriaLabel(data);
  if (!data.isNearest) return base;
  return data.status === 'live' ? `${base} — live match` : `${base} — current match`;
}

function MatchNodeImpl({ data, selected }: NodeProps<MatchFlowNode>) {
  const { home, away, score, status, isFinal, isThirdPlace, group, isNearest } = data;
  const showScore = status !== 'scheduled';
  const finished = status === 'finished';
  const homeWin = score.winner === 'home';
  const awayWin = score.winner === 'away';
  const isGroup = group !== null;
  const isLiveNearest = isNearest === true && status === 'live';
  const groupLabel = displayLabel(data);

  return (
    <article
      className={`${CARD} ${containClass(isNearest === true)}`}
      data-status={status}
      data-final={isFinal}
      data-third={isThirdPlace}
      data-group={isGroup}
      data-selected={selected}
      data-nearest={isNearest ? 'true' : undefined}
      tabIndex={0}
      aria-label={ariaLabel(data)}
    >
      {isNearest && <NearestBadge live={status === 'live'} />}
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
