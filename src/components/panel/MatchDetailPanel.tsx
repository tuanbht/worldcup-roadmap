'use client';

import { useEffect } from 'react';
import type { Match, TeamRef, Tournament } from '@/domain/types';
import { refLabel } from '@/domain/types';
import { STAGE_LABELS } from '@/domain/bracket/stage-order';
import { formatDateTime } from '@/features/roadmap/format';
import { Flag } from '@/components/ui/Flag';

interface Detail {
  roundLabel: string;
  home: TeamRef;
  away: TeamRef;
  match: Match | null;
}

function resolveDetail(tournament: Tournament, matchId: string): Detail | null {
  const match = tournament.matches.find((m) => m.id === matchId);
  if (match) {
    return { roundLabel: STAGE_LABELS[match.stage], home: match.home, away: match.away, match };
  }
  for (const round of tournament.bracket.rounds) {
    const node = round.nodes.find((n) => n.matchId === matchId);
    if (node) return { roundLabel: round.label, home: node.home.team, away: node.away.team, match: null };
  }
  return null;
}

function TeamSide({ team, goals, pens }: { team: TeamRef; goals: number | null; pens: number | null }) {
  const resolved = team.kind === 'team';
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <Flag code={resolved ? team.team.code : null} url={resolved ? team.team.flagUrl : null} size={34} />
      <span className="text-[0.82rem] font-semibold text-ink">{refLabel(team)}</span>
      <span className="font-display text-[2rem] font-extrabold tabular-nums text-ink">
        {goals ?? '–'}
        {pens != null && <small className="text-[0.9rem] text-muted"> ({pens})</small>}
      </span>
    </div>
  );
}

interface MatchDetailPanelProps {
  tournament: Tournament | null;
  matchId: string | null;
  onClose: () => void;
}

function MetaRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-edge pb-3">
      <dt className="text-[0.72rem] uppercase tracking-[0.08em] text-dim">{term}</dt>
      <dd className="m-0 text-right text-[0.82rem] text-ink">{children}</dd>
    </div>
  );
}

export function MatchDetailPanel({ tournament, matchId, onClose }: MatchDetailPanelProps) {
  useEffect(() => {
    if (!matchId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [matchId, onClose]);

  const detail = tournament && matchId ? resolveDetail(tournament, matchId) : null;
  const open = Boolean(matchId);
  const match = detail?.match ?? null;

  return (
    <aside
      aria-label="Match details"
      aria-hidden={!open}
      // When closed the panel is aria-hidden; `inert` removes its (still-rendered)
      // close button and controls from the tab order so focus can never land
      // inside a hidden region (WCAG 4.1.2 / axe aria-hidden-focus).
      inert={!open}
      className={[
        'absolute right-0 top-0 z-10 flex h-full w-[min(360px,92vw)] flex-col gap-4 p-6',
        'border-l border-edge bg-glass shadow-[var(--elevation-panel)] backdrop-blur-[18px]',
        'transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'max-[640px]:bottom-0 max-[640px]:top-auto max-[640px]:h-auto max-[640px]:max-h-[70%]',
        'max-[640px]:w-full max-[640px]:border-l-0 max-[640px]:border-t',
        open ? 'translate-x-0 max-[640px]:translate-y-0' : 'pointer-events-none translate-x-full max-[640px]:translate-y-full',
      ].join(' ')}
    >
      <header className="flex items-center justify-between">
        <span className="font-display text-[0.72rem] uppercase tracking-[0.08em] text-accent">
          {detail?.roundLabel ?? 'Match'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close match details"
          className="h-8 w-8 rounded-full border border-edge bg-surf-2 text-[0.8rem] text-muted transition-colors hover:border-edge-strong hover:text-ink"
        >
          ✕
        </button>
      </header>

      {detail ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[20px] border border-edge bg-surf-1 px-4 py-6">
            <TeamSide team={detail.home} goals={match?.score.home ?? null} pens={match?.score.penaltyHome ?? null} />
            <span className="text-[0.72rem] uppercase tracking-[0.08em] text-dim">
              {match && match.status !== 'scheduled' ? '' : 'vs'}
            </span>
            <TeamSide team={detail.away} goals={match?.score.away ?? null} pens={match?.score.penaltyAway ?? null} />
          </div>

          <dl className="m-0 flex flex-col gap-3">
            <MetaRow term="Status">
              {match?.status === 'live'
                ? `Live${match.minute != null ? ` · ${match.minute}'` : ''}`
                : match?.status === 'finished'
                  ? 'Full time'
                  : 'Upcoming'}
            </MetaRow>
            <MetaRow term="Kick-off">{formatDateTime(match?.kickoff ?? null)}</MetaRow>
            {match?.venue.name && (
              <MetaRow term="Venue">{[match.venue.name, match.venue.city].filter(Boolean).join(', ')}</MetaRow>
            )}
            {match?.score.resolution === 'penalties' && <MetaRow term="Decided">After penalties</MetaRow>}
          </dl>
        </div>
      ) : (
        open && <p className="text-[0.82rem] text-muted">Fixture to be confirmed.</p>
      )}
    </aside>
  );
}
