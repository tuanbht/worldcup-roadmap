import type { ReactElement } from 'react';
import type { Lineup } from '@/domain/types';
import { layoutFormation } from './formation-layout';
import { PlayerChip } from './PlayerChip';

function Pitch({ lineup, teamName }: { lineup: Lineup; teamName: string }): ReactElement {
  const placed = layoutFormation(lineup.formation, lineup.starters);
  return (
    <section className="flex flex-col gap-2" aria-label={`${teamName} lineup`}>
      <header className="flex items-baseline justify-between">
        <h4 className="text-ink m-0 text-[0.82rem] font-semibold">{teamName}</h4>
        {lineup.formation && (
          <span className="text-dim text-[0.72rem] font-semibold tabular-nums">
            {lineup.formation}
          </span>
        )}
      </header>
      <div className="pitch-grid border-edge bg-surf-1/50 relative aspect-[3/4] w-full overflow-hidden rounded-[16px] border">
        <ul className="absolute inset-0 m-0 list-none p-0">
          {placed.map(({ player, x, y }) => (
            <PlayerChip
              key={player.id}
              player={player}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x * 100}%`, top: `${(1 - y) * 90 + 5}%` }}
            />
          ))}
        </ul>
      </div>
      {lineup.coach && (
        <p className="text-muted m-0 text-[0.72rem]">
          Coach: <span className="text-ink">{lineup.coach}</span>
        </p>
      )}
    </section>
  );
}

interface LineupsTabProps {
  readonly home: Lineup;
  readonly away: Lineup;
  readonly homeName: string;
  readonly awayName: string;
}

/** Two formation pitches (home + away) laid out from formation + positionIndex. */
export function LineupsTab({ home, away, homeName, awayName }: LineupsTabProps): ReactElement {
  if (home.starters.length === 0 && away.starters.length === 0) {
    return (
      <p className="text-muted px-2 py-8 text-center text-[0.82rem]">
        Lineups not available yet for this match.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <Pitch lineup={home} teamName={homeName} />
      <Pitch lineup={away} teamName={awayName} />
    </div>
  );
}
