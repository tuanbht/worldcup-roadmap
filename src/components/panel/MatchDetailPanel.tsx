import { useEffect, type ReactElement } from 'react';
import { X } from 'lucide-react';
import type { Match, TeamRef, Tournament } from '@/domain/types';
import { refLabel } from '@/domain/types';
import { useMatchDetailQuery } from '@/features/roadmap/hooks/useMatchDetailQuery';
import { Flag } from '@/components/ui/Flag';
import { MatchDetailHeader } from './match-detail/MatchDetailHeader';
import { MatchDetailTabs } from './match-detail/MatchDetailTabs';
import { PanelEmpty, PanelError, PanelSkeleton } from './match-detail/PanelStates';

interface MatchDetailPanelProps {
  tournament: Tournament | null;
  matchId: string | null;
  onClose: () => void;
}

/** An unscheduled knockout bracket node (no real `Match` yet). */
interface BracketPlaceholder {
  readonly roundLabel: string;
  readonly home: TeamRef;
  readonly away: TeamRef;
}

function findMatch(tournament: Tournament | null, matchId: string | null): Match | null {
  if (!tournament || !matchId) return null;
  return tournament.matches.find((m) => m.id === matchId) ?? null;
}

/**
 * Resolve a selected id that is NOT a real `Match` to its knockout bracket node,
 * so an unscheduled slot still shows the round label + the home/away placeholder
 * labels ("Winner R16-1", "1A", …) instead of a content-free card.
 */
function findBracketPlaceholder(
  tournament: Tournament | null,
  matchId: string | null,
): BracketPlaceholder | null {
  if (!tournament || !matchId) return null;
  for (const round of tournament.bracket.rounds) {
    const node = round.nodes.find((n) => n.matchId === matchId);
    if (node) {
      return { roundLabel: round.label, home: node.home.team, away: node.away.team };
    }
  }
  return null;
}

function PlaceholderTeam({ team }: { team: TeamRef }): ReactElement {
  const resolved = team.kind === 'team';
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <Flag
        code={resolved ? team.team.code : null}
        url={resolved ? team.team.flagUrl : null}
        size={34}
      />
      <span className="text-ink truncate text-[0.82rem] font-semibold">{refLabel(team)}</span>
    </div>
  );
}

/** Header for an unscheduled knockout node: round label + both placeholder teams. */
function BracketPlaceholderHeader({
  placeholder,
}: {
  placeholder: BracketPlaceholder;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <span className="font-display text-accent text-[0.72rem] tracking-[0.08em] uppercase">
        {placeholder.roundLabel}
      </span>
      <div className="border-edge bg-surf-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[20px] border px-4 py-5">
        <PlaceholderTeam team={placeholder.home} />
        <span className="text-dim self-center text-[0.72rem] tracking-[0.08em] uppercase">vs</span>
        <PlaceholderTeam team={placeholder.away} />
      </div>
    </div>
  );
}

export function MatchDetailPanel({
  tournament,
  matchId,
  onClose,
}: MatchDetailPanelProps): ReactElement {
  useEffect(() => {
    if (!matchId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [matchId, onClose]);

  const match = findMatch(tournament, matchId);
  const placeholder = match ? null : findBracketPlaceholder(tournament, matchId);
  const isLive = match?.status === 'live';
  // Detail is only fetchable for a real match; an unresolved/placeholder node
  // passes a null id so the hook stays disabled.
  const { detail, status } = useMatchDetailQuery(match ? matchId : null, isLive);
  const open = Boolean(matchId);
  const groups = tournament?.groups ?? [];

  return (
    <aside
      aria-label="Match details"
      aria-hidden={!open}
      // When closed the panel is aria-hidden; `inert` removes its (still-rendered)
      // controls from the tab order so focus can never land inside a hidden
      // region (WCAG 4.1.2 / axe aria-hidden-focus).
      inert={!open}
      className={[
        'absolute top-0 right-0 z-10 flex h-full w-[min(560px,96vw)] flex-col gap-4 p-6',
        'border-edge bg-glass border-l shadow-[var(--elevation-panel)] backdrop-blur-[18px]',
        'transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'max-[640px]:top-auto max-[640px]:bottom-0 max-[640px]:h-auto max-[640px]:max-h-[80%]',
        'max-[640px]:w-full max-[640px]:border-t max-[640px]:border-l-0',
        open
          ? 'translate-x-0 max-[640px]:translate-y-0'
          : 'pointer-events-none translate-x-full max-[640px]:translate-y-full',
      ].join(' ')}
    >
      <header className="flex items-center justify-end">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close match details"
          className="border-edge bg-surf-2 text-muted hover:border-edge-strong hover:text-ink flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
        >
          <X aria-hidden size={16} />
        </button>
      </header>

      {open && match && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <MatchDetailHeader match={match} groups={groups} detail={detail} />
          {status === 'loading' && <PanelSkeleton />}
          {status === 'error' && <PanelError />}
          {status === 'unavailable' && <PanelEmpty />}
          {status === 'ready' && detail && (
            <MatchDetailTabs
              detail={detail}
              homeName={refLabel(match.home)}
              awayName={refLabel(match.away)}
            />
          )}
        </div>
      )}

      {open && !match && placeholder && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <BracketPlaceholderHeader placeholder={placeholder} />
          <PanelEmpty
            title="Matchup not yet decided"
            body="Timeline, lineups and stats appear once this fixture is set."
          />
        </div>
      )}

      {open && !match && !placeholder && (
        <PanelEmpty title="Fixture to be confirmed" body="This matchup hasn’t been decided yet." />
      )}
    </aside>
  );
}
