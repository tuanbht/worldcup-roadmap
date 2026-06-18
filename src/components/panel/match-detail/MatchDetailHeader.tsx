import type { ReactElement } from 'react';
import { Goal } from 'lucide-react';
import type { Group, Match, MatchDetail, TeamRef } from '@/domain/types';
import { refLabel } from '@/domain/types';
import { STAGE_LABELS } from '@/domain/bracket/stage-order';
import { formatDateTime } from '@/features/roadmap/format';
import { Flag } from '@/components/ui/Flag';
import { goalscorerSummary, standingPositionLabel, statusLabel } from './match-detail-view';

const COMPETITION_LABEL = 'FIFA World Cup 2026™';

function teamIdOf(ref: TeamRef): string | null {
  return ref.kind === 'team' ? ref.team.id : null;
}

function TeamColumn({
  team,
  standing,
  goals,
  pens,
}: {
  team: TeamRef;
  standing: string | null;
  goals: number | null;
  pens: number | null;
}): ReactElement {
  const resolved = team.kind === 'team';
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <Flag
        code={resolved ? team.team.code : null}
        url={resolved ? team.team.flagUrl : null}
        size={34}
      />
      <span className="text-ink truncate text-[0.82rem] font-semibold">{refLabel(team)}</span>
      {standing && <span className="text-dim text-[0.68rem] font-semibold">{standing}</span>}
      <span className="font-display text-ink text-[2rem] font-extrabold tabular-nums">
        {goals ?? '–'}
        {pens != null && <small className="text-muted text-[0.9rem]"> ({pens})</small>}
      </span>
    </div>
  );
}

interface MatchDetailHeaderProps {
  readonly match: Match;
  readonly groups: readonly Group[];
  readonly detail: MatchDetail | null;
}

/** Competition + status + both teams + stage/group + kickoff + goalscorers. */
export function MatchDetailHeader({ match, groups, detail }: MatchDetailHeaderProps): ReactElement {
  const live = match.status === 'live';
  const homeStanding = standingPositionLabel(groups, match.group, teamIdOf(match.home));
  const awayStanding = standingPositionLabel(groups, match.group, teamIdOf(match.away));
  const stageLine = [STAGE_LABELS[match.stage], match.group ? `Group ${match.group}` : null]
    .filter(Boolean)
    .join(' · ');
  const scorers = detail ? goalscorerSummary(detail.events) : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-accent text-[0.72rem] tracking-[0.08em] uppercase">
          {COMPETITION_LABEL}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[0.66rem] font-bold tracking-[0.04em] uppercase ${
            live ? 'bg-live/15 text-live' : 'bg-surf-2 text-dim'
          }`}
        >
          {statusLabel(match)}
        </span>
      </div>

      <div className="border-edge bg-surf-1 grid grid-cols-[1fr_auto_1fr] items-start gap-3 rounded-[20px] border px-4 py-5">
        <TeamColumn
          team={match.home}
          standing={homeStanding}
          goals={match.score.home}
          pens={match.score.penaltyHome}
        />
        <span className="text-dim self-center text-[0.72rem] tracking-[0.08em] uppercase">vs</span>
        <TeamColumn
          team={match.away}
          standing={awayStanding}
          goals={match.score.away}
          pens={match.score.penaltyAway}
        />
      </div>

      <div className="text-muted flex items-center justify-between text-[0.72rem]">
        <span>{stageLine}</span>
        <span>{formatDateTime(match.kickoff)}</span>
      </div>

      {scorers.length > 0 && (
        <p className="text-muted m-0 flex items-start gap-2 text-[0.76rem]">
          <Goal aria-hidden size={14} className="text-accent mt-0.5 shrink-0" />
          <span>
            {scorers
              .map((s) => `${s.playerName} ${s.minutes.map((m) => `${m}'`).join(', ')}`)
              .join(' · ')}
          </span>
        </p>
      )}
    </div>
  );
}
