import { useState, type CSSProperties, type ReactElement } from 'react';
import { Armchair, CircleDot, Square } from 'lucide-react';
import type { LineupPlayer } from '@/domain/types';

const PHOTO_PX = 44;

/** Two-letter initials from a short name, e.g. "Mbappe" → "MB". */
function initials(shortName: string): string {
  const parts = shortName.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return shortName.slice(0, 2).toUpperCase();
}

function Headshot({ player }: { player: LineupPlayer }): ReactElement {
  const [failed, setFailed] = useState(false);
  if (!player.photoUrl || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: PHOTO_PX, height: PHOTO_PX }}
        className="bg-surf-3 text-muted inline-flex items-center justify-center rounded-full text-[0.7rem] font-bold"
      >
        {initials(player.shortName)}
      </span>
    );
  }
  return (
    <img
      src={player.photoUrl}
      alt={player.name}
      width={PHOTO_PX}
      height={PHOTO_PX}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="bg-surf-3 rounded-full object-cover"
    />
  );
}

function Badges({ player }: { player: LineupPlayer }): ReactElement | null {
  const badges: ReactElement[] = [];
  if (player.goals > 0)
    badges.push(<CircleDot key="g" aria-label="Scored" size={12} className="text-accent" />);
  if (player.yellow)
    badges.push(<Square key="y" aria-label="Yellow card" size={11} className="text-gold" />);
  if (player.red)
    badges.push(<Square key="r" aria-label="Red card" size={11} className="text-live" />);
  if (player.subbedOff != null)
    badges.push(<Armchair key="s" aria-label="Substituted off" size={12} className="text-muted" />);
  return badges.length ? <span className="flex items-center gap-0.5">{badges}</span> : null;
}

interface PlayerChipProps {
  readonly player: LineupPlayer;
  readonly style?: CSSProperties;
  readonly className?: string;
}

/** One pitch player: headshot (initials fallback), shirt number, short name, badges. */
export function PlayerChip({ player, style, className = '' }: PlayerChipProps): ReactElement {
  return (
    <li
      style={style}
      className={`flex w-[64px] flex-col items-center gap-1 text-center ${className}`}
    >
      <Headshot player={player} />
      <span className="flex items-center gap-1">
        <span className="text-dim text-[0.7rem] font-bold tabular-nums">{player.shirtNumber}</span>
        <span className="text-ink max-w-[58px] truncate text-[0.72rem] font-semibold">
          {player.shortName}
        </span>
        {player.isCaptain && (
          <span
            aria-label="Captain"
            className="bg-accent text-deep inline-flex h-[14px] w-[14px] items-center justify-center rounded-full text-[0.55rem] font-extrabold"
          >
            C
          </span>
        )}
      </span>
      <Badges player={player} />
    </li>
  );
}
