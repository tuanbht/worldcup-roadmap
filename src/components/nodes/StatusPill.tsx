import type { MatchStatus } from '@/domain/types';
import { formatTime } from '@/features/roadmap/format';

interface StatusPillProps {
  status: MatchStatus;
  minute: number | null;
  kickoff: string | null;
}

/** Small status chip; for live matches it shows the elapsed minute. */
export function StatusPill({ status, minute, kickoff }: StatusPillProps) {
  const live = status === 'live';
  const value = live
    ? minute != null
      ? `${minute}'`
      : 'Live'
    : status === 'scheduled'
      ? formatTime(kickoff)
      : 'FT';

  const tone = live
    ? 'bg-live/15 text-live'
    : status === 'finished'
      ? 'bg-surf-3 text-dim'
      : 'bg-surf-3 text-muted';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.72rem] font-semibold tabular-nums ${tone}`}
    >
      {live && (
        <span
          aria-hidden="true"
          className="h-[7px] w-[7px] rounded-full bg-live animate-livepulse [will-change:transform,opacity]"
        />
      )}
      {live && <span className="sr-only">Live</span>}
      <span>{value}</span>
    </span>
  );
}
