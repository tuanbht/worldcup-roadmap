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
  const name = (
    <span className={`truncate text-[0.98rem] ${nameTone}`} title={refLabel(team)}>
      {refLabel(team)}
    </span>
  );
  const scoreCell = showScore && (
    <span className={`font-display text-[1.05rem] tabular-nums ${dim ? 'text-dim' : 'text-ink'}`}>
      {goals ?? '–'}
      {penalty != null && <span className="text-muted text-[0.72rem]"> ({penalty})</span>}
    </span>
  );

  // Only a resolved team with a focus handler is interactive (the canvas path).
  // Then the grid <div> becomes the SOLE positioned containing block and the whole
  // row IS the focus-team control via the proven 1030 sibling-overlay pattern: a
  // transparent, content-less full-row `<button absolute inset-0>` overlays the
  // NORMAL in-flow decorative flag/name/score (its SIBLINGS). `inset-0` resolves
  // against the `relative` grid <div>, so the on-screen tap target is the full
  // ~236px interior row (~75px at the 0.32 zoom floor, ≈1.7x the 44px minimum)
  // instead of the ~7px flag glyph, while the in-flow content reserves the row's
  // natural height/tracks with ZERO duplication — visually byte-identical to the
  // decorative branch below (the only change is the added overlay + `relative`).
  if (resolved && onFocusTeam) {
    const focusTeam = team.team;
    return (
      <div className="relative grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-2">
        <button
          type="button"
          className="nopan absolute inset-0 z-10 cursor-pointer rounded-[3px] focus-visible:shadow-[var(--glow-accent)] focus-visible:outline-none"
          aria-label={`Show matches for ${focusTeam.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onFocusTeam(focusTeam.id);
          }}
          onKeyDown={(event) => {
            // Native <button> already fires click on Enter/Space; we only keep the
            // keystroke off React Flow's pan/select handlers.
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.stopPropagation();
          }}
        />
        {flag}
        {name}
        {scoreCell}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-2">
      {flag}
      {name}
      {scoreCell}
    </div>
  );
}
