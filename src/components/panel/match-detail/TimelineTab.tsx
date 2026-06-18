import type { ReactElement } from 'react';
import { ArrowLeftRight, CircleDot, Flag as FlagIcon, Goal, ScanEye, Square } from 'lucide-react';
import type { MatchDetail, MatchEvent, MatchEventKind } from '@/domain/types';

/** lucide icon + accessible label per event kind. */
function kindIcon(kind: MatchEventKind): ReactElement {
  switch (kind) {
    case 'goal':
    case 'penalty-goal':
      return <Goal aria-label="Goal" size={16} className="text-accent" />;
    case 'own-goal':
      return <Goal aria-label="Own goal" size={16} className="text-live" />;
    case 'assist':
      return <CircleDot aria-label="Assist" size={14} className="text-muted" />;
    case 'yellow':
      return <Square aria-label="Yellow card" size={14} className="text-gold" />;
    case 'second-yellow':
      return <Square aria-label="Second yellow card" size={14} className="text-gold" />;
    case 'red':
      return <Square aria-label="Red card" size={14} className="text-live" />;
    case 'substitution':
      return <ArrowLeftRight aria-label="Substitution" size={14} className="text-muted" />;
    case 'var':
      return <ScanEye aria-label="VAR" size={14} className="text-muted" />;
    default:
      return <FlagIcon aria-label="Period" size={14} className="text-dim" />;
  }
}

function EventRow({ event }: { event: MatchEvent }): ReactElement {
  const home = event.side === 'home';
  return (
    <li className="border-edge/60 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b py-2 last:border-0">
      <div className={`flex items-center gap-2 ${home ? 'justify-start' : 'invisible'}`}>
        {home && <EventBody event={event} />}
      </div>
      <span className="text-dim text-[0.72rem] font-semibold tabular-nums">
        {event.minute}&apos;
      </span>
      <div className={`flex items-center gap-2 ${home ? 'invisible' : 'justify-end'}`}>
        {!home && <EventBody event={event} align="end" />}
      </div>
    </li>
  );
}

function EventBody({
  event,
  align = 'start',
}: {
  event: MatchEvent;
  align?: 'start' | 'end';
}): ReactElement {
  const name = (
    <span className="text-ink min-w-0 truncate text-[0.8rem] font-medium">
      {event.playerName ?? '—'}
      {event.relatedName && <span className="text-muted"> · {event.relatedName}</span>}
    </span>
  );
  return align === 'end' ? (
    <>
      {name}
      {kindIcon(event.kind)}
    </>
  ) : (
    <>
      {kindIcon(event.kind)}
      {name}
    </>
  );
}

interface TimelineTabProps {
  readonly detail: MatchDetail;
}

/** Chronological event list, home-left / away-right. Semantic ordered list. */
export function TimelineTab({ detail }: TimelineTabProps): ReactElement {
  if (detail.events.length === 0) {
    return (
      <p className="text-muted px-2 py-8 text-center text-[0.82rem]">
        Timeline not available yet for this match.
      </p>
    );
  }
  return (
    <ol className="m-0 flex flex-col gap-0 p-0">
      {detail.events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </ol>
  );
}
