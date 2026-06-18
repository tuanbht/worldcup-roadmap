import type { ReactElement } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';

/** Loading skeleton: compositor-only pulse, reduced-motion safe via animate-pulse. */
export function PanelSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading match details…</span>
      {[0, 1, 2, 3].map((row) => (
        <div
          key={row}
          className="bg-surf-2/70 h-10 rounded-[12px] motion-safe:animate-pulse"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

interface MessageStateProps {
  readonly title: string;
  readonly body: string;
}

/** Neutral "not available" empty state for pre-match / mock / unknown matches. */
export function PanelEmpty({
  title = 'Match detail not available',
  body = "Detailed timeline, lineups and stats aren't available for this match.",
}: Partial<MessageStateProps>): ReactElement {
  return (
    <div className="border-edge bg-surf-1/60 flex flex-col items-center gap-2 rounded-[16px] border px-6 py-10 text-center">
      <Inbox aria-hidden size={28} className="text-dim" />
      <p className="text-ink m-0 text-[0.9rem] font-semibold">{title}</p>
      <p className="text-muted m-0 text-[0.82rem]">{body}</p>
    </div>
  );
}

/** Typed error state for genuine upstream failures. */
export function PanelError({
  title = 'Couldn’t load match details',
  body = 'Something went wrong fetching this match. Please try again shortly.',
}: Partial<MessageStateProps>): ReactElement {
  return (
    <div
      role="alert"
      className="border-edge bg-surf-1/60 flex flex-col items-center gap-2 rounded-[16px] border px-6 py-10 text-center"
    >
      <AlertTriangle aria-hidden size={28} className="text-live" />
      <p className="text-ink m-0 text-[0.9rem] font-semibold">{title}</p>
      <p className="text-muted m-0 text-[0.82rem]">{body}</p>
    </div>
  );
}
