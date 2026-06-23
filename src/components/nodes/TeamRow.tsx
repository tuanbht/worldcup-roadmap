import type { TeamRef } from '@/domain/types';
import { refLabel } from '@/domain/types';
import { Flag } from '@/components/ui/Flag';

interface TeamRowProps {
  team: TeamRef;
  goals: number | null;
  penalty: number | null;
  isWinner: boolean;
  dim: boolean;
  showScore: boolean;
  /**
   * When given AND the ref is a resolved team, the flag becomes a focusable
   * button that sets the focused team (item 3). Absent / placeholder → the flag
   * stays the decorative `aria-hidden` span.
   */
  onFocusTeam?: (teamId: string) => void;
}

export function TeamRow({
  team,
  goals,
  penalty,
  isWinner,
  dim,
  showScore,
  onFocusTeam,
}: TeamRowProps) {
  const resolved = team.kind === 'team';
  const code = resolved ? team.team.code : null;
  const url = resolved ? team.team.flagUrl : null;

  const nameTone = !resolved
    ? 'italic font-medium text-dim'
    : dim
      ? 'font-medium text-dim'
      : isWinner
        ? 'font-bold text-ink'
        : 'font-semibold text-ink';

  const flag = <Flag code={code} url={url} />;

  return (
    <div className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-2">
      {resolved && onFocusTeam ? (
        <button
          type="button"
          className="nopan shrink-0 rounded-[3px] focus-visible:shadow-[var(--glow-accent)] focus-visible:outline-none"
          aria-label={`Show matches for ${team.team.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onFocusTeam(team.team.id);
          }}
        >
          {flag}
        </button>
      ) : (
        flag
      )}
      <span className={`truncate text-[0.98rem] ${nameTone}`} title={refLabel(team)}>
        {refLabel(team)}
      </span>
      {showScore && (
        <span
          className={`font-display text-[1.05rem] tabular-nums ${dim ? 'text-dim' : 'text-ink'}`}
        >
          {goals ?? '–'}
          {penalty != null && <span className="text-muted text-[0.72rem]"> ({penalty})</span>}
        </span>
      )}
    </div>
  );
}
