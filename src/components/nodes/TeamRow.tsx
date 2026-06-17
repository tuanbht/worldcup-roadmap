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
}

export function TeamRow({ team, goals, penalty, isWinner, dim, showScore }: TeamRowProps) {
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

  return (
    <div className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-2">
      <Flag code={code} url={url} />
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
