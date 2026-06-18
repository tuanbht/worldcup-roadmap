import type { ReactElement } from 'react';
import type { MatchDetail, TeamStats, WinProbability } from '@/domain/types';

interface StatRow {
  readonly label: string;
  readonly key: keyof TeamStats;
  readonly suffix?: string;
}

// Order + labels for the comparison rows. Unsourced stats (passes / pass
// accuracy / shots on target) are intentionally absent → never rendered.
const ROWS: readonly StatRow[] = [
  { label: 'Possession', key: 'possession', suffix: '%' },
  { label: 'Shots', key: 'shots' },
  { label: 'Corners', key: 'corners' },
  { label: 'Fouls', key: 'fouls' },
  { label: 'Offsides', key: 'offsides' },
  { label: 'Yellow cards', key: 'yellowCards' },
  { label: 'Red cards', key: 'redCards' },
];

function Value({ value, higher }: { value: number | null; higher: boolean }): ReactElement {
  // A missing side renders an em-dash, never a fabricated 0 (AC6).
  const display = value == null ? '–' : value;
  return (
    <span
      className={`inline-flex min-w-[2rem] justify-center rounded-full px-2 py-0.5 text-[0.82rem] font-bold tabular-nums ${
        higher ? 'bg-accent/15 text-accent' : 'text-muted'
      }`}
    >
      {display}
    </span>
  );
}

function StatComparison({
  row,
  home,
  away,
}: {
  row: StatRow;
  home: number | null;
  away: number | null;
}): ReactElement {
  const suffix = row.suffix ?? '';
  // Only compare (and highlight a "higher" side) when both values exist; a
  // one-sided stat shows the present value plain and an em-dash opposite it.
  const comparable = home != null && away != null;
  return (
    <li className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-3 py-1.5">
      <Value value={home} higher={comparable && home > away} />
      <span className="text-dim text-center text-[0.72rem] tracking-[0.04em] uppercase">
        {row.label}
        {suffix}
      </span>
      <Value value={away} higher={comparable && away > home} />
    </li>
  );
}

function WinProbabilityBar({ wp }: { wp: WinProbability }): ReactElement {
  return (
    <section aria-label="Win probability estimate" className="flex flex-col gap-1.5">
      <header className="flex items-center justify-between">
        <span className="text-dim text-[0.72rem] tracking-[0.06em] uppercase">Win probability</span>
        <span className="bg-surf-2 text-muted rounded-full px-2 py-0.5 text-[0.62rem] font-semibold tracking-[0.04em] uppercase">
          Estimate
        </span>
      </header>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`Home ${wp.home}%, draw ${wp.draw}%, away ${wp.away}%`}
      >
        <span className="bg-accent h-full" style={{ width: `${wp.home}%` }} />
        <span className="bg-surf-3 h-full" style={{ width: `${wp.draw}%` }} />
        <span className="bg-gold h-full" style={{ width: `${wp.away}%` }} />
      </div>
      <div className="text-muted flex justify-between text-[0.7rem] tabular-nums">
        <span>{wp.home}%</span>
        <span>Draw {wp.draw}%</span>
        <span>{wp.away}%</span>
      </div>
    </section>
  );
}

interface StatsTabProps {
  readonly detail: MatchDetail;
}

/** Win-probability bar (labeled estimate or hidden) + team-stats comparison rows. */
export function StatsTab({ detail }: StatsTabProps): ReactElement {
  const { homeStats, awayStats, winProbability } = detail;
  const rows = ROWS.filter((row) => homeStats[row.key] != null || awayStats[row.key] != null);

  if (rows.length === 0 && winProbability === null) {
    return (
      <p className="text-muted px-2 py-8 text-center text-[0.82rem]">
        Stats not available yet for this match.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {winProbability && <WinProbabilityBar wp={winProbability} />}
      {rows.length > 0 && (
        <ul className="border-edge bg-surf-1/40 m-0 flex list-none flex-col rounded-[16px] border px-3 py-1">
          {rows.map((row) => (
            <StatComparison
              key={row.key}
              row={row}
              home={homeStats[row.key] as number | null}
              away={awayStats[row.key] as number | null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
