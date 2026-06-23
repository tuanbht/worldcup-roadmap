import { useEffect, useRef, type ReactElement } from 'react';
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const open = Boolean(matchId);

  useEffect(() => {
    if (!matchId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [matchId, onClose]);

  // Focus management: on open (null->set) capture the trigger that held focus,
  // then move focus into the panel (close button). On close (set->null, or
  // unmount) restore focus to that trigger when it is still connected, so it is
  // never thrown onto a stale/detached node.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    lastFocusedRef.current = previouslyFocused instanceof HTMLElement ? previouslyFocused : null;
    closeButtonRef.current?.focus();
    return () => {
      const target = lastFocusedRef.current;
      if (target && target.isConnected) target.focus();
      lastFocusedRef.current = null;
    };
  }, [open]);

  const match = findMatch(tournament, matchId);
  const placeholder = match ? null : findBracketPlaceholder(tournament, matchId);
  // Detail is only fetchable for a real match; the hook takes the resolved
  // `Match` (carrying providerRef) so an unresolved/placeholder node passes null
  // and the hook stays disabled.
  const { detail, status } = useMatchDetailQuery(match);
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
        // Desktop: right drawer — full viewport height, fixed width, slides in from right
        'absolute top-0 right-0 z-10 flex h-full w-[min(560px,96vw)] flex-col',
        'border-edge bg-glass border-l shadow-[var(--elevation-panel)] backdrop-blur-[18px]',
        'transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        // Mobile (≤640px): bottom sheet — near-full-height, safe-area aware
        'max-[640px]:top-auto max-[640px]:bottom-0',
        'max-[640px]:h-[88dvh] max-[640px]:max-h-[92dvh]',
        'max-[640px]:w-full max-[640px]:border-t max-[640px]:border-l-0',
        'max-[640px]:rounded-t-[20px]',
        open
          ? 'translate-x-0 max-[640px]:translate-y-0'
          : 'pointer-events-none translate-x-full max-[640px]:translate-y-full',
      ].join(' ')}
    >
      {/*
        Desktop: the header (close button) is a simple flex row at the top.
        Mobile: the close button sits absolute top-right so it doesn't consume
        vertical space in the three-region flex column below.
      */}
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label="Close match details"
        className={[
          'border-edge bg-surf-2 text-muted hover:border-edge-strong hover:text-ink',
          'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
          // Desktop: in-flow at top-right; Mobile: absolute so it overlays the compact header
          'm-4 shrink-0 self-end',
          'max-[640px]:absolute max-[640px]:top-0 max-[640px]:right-0 max-[640px]:z-10 max-[640px]:m-3',
        ].join(' ')}
      >
        <X aria-hidden size={16} />
      </button>

      {open && match && (
        /*
          Three-region flex column (mobile):
          1. Sticky compact header (shrinks scores on mobile)
          2. Sticky tabs row (always visible while scrolling)
          3. Scrollable content region (flex-1 overflow-y-auto)

          Desktop inherits the same structure but the panel is already full-height
          and scrolls fine because the drawer has enough space.
        */
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Region 1: Sticky header — compact on mobile */}
          <div className="shrink-0 px-6 pt-2 pb-3 max-[640px]:pt-10 max-[640px]:pb-2">
            <MatchDetailHeader match={match} groups={groups} detail={detail} />
          </div>
          {/* Regions 2 + 3 live inside MatchDetailTabs (sticky tabs + scroll content) */}
          {status === 'loading' && (
            <div className="px-6 pb-6">
              <PanelSkeleton />
            </div>
          )}
          {status === 'error' && (
            <div className="px-6 pb-6">
              <PanelError />
            </div>
          )}
          {status === 'unavailable' && (
            <div className="px-6 pb-6">
              <PanelEmpty />
            </div>
          )}
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
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 max-[640px]:pt-10">
          <BracketPlaceholderHeader placeholder={placeholder} />
          <PanelEmpty
            title="Matchup not yet decided"
            body="Timeline, lineups and stats appear once this fixture is set."
          />
        </div>
      )}

      {open && !match && !placeholder && (
        <div className="px-6 pb-6 max-[640px]:pt-10">
          <PanelEmpty
            title="Fixture to be confirmed"
            body="This matchup hasn't been decided yet."
          />
        </div>
      )}
    </aside>
  );
}
