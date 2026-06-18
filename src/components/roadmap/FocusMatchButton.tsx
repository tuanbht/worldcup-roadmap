import { Panel } from '@xyflow/react';
import { LocateFixed } from 'lucide-react';

interface FocusMatchButtonProps {
  /** Resolved target id, or null when every match has ended (button disabled). */
  targetMatchId: string | null;
  /** True when the resolved target is currently live (live affordance/label). */
  isLive: boolean;
  /** Fired with the non-null targetMatchId when the user activates the control. */
  onActivate: (matchId: string) => void;
}

const LABEL_LIVE = 'Go to live match';
const LABEL_CURRENT = 'Go to current match';

/**
 * Canvas control that centers the camera on the "current" match. A single
 * semantic `<button>` (lucide LocateFixed icon) inside a React Flow `<Panel>`.
 *
 * The label and a small accent flip to a "live" affordance when the resolved
 * target is in play (`isLive`), exposed to assistive tech via `aria-label` and to
 * styling/tests via `data-live`. The button is `disabled` when there is no target
 * (every match has ended) so a dead click is impossible. Keyboard activation comes
 * free from the native button; focus state uses the design-token ring.
 */
export function FocusMatchButton({ targetMatchId, isLive, onActivate }: FocusMatchButtonProps) {
  const disabled = targetMatchId === null;
  const live = !disabled && isLive;

  function handleActivate() {
    if (targetMatchId === null) return;
    onActivate(targetMatchId);
  }

  return (
    <Panel position="top-center" className="focus-match-control">
      <button
        type="button"
        disabled={disabled}
        data-live={live ? 'true' : 'false'}
        aria-label={live ? LABEL_LIVE : LABEL_CURRENT}
        onClick={handleActivate}
        className={[
          'border-edge bg-surf-1/80 inline-flex items-center gap-2 rounded-full border',
          'px-3.5 py-1.5 text-[0.82rem] font-semibold backdrop-blur transition-colors',
          'focus-visible:ring-accent focus-visible:ring-2 focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-45',
          live ? 'text-live hover:text-live border-live/40' : 'text-muted hover:text-ink',
        ].join(' ')}
      >
        {live && (
          <span aria-hidden="true" className="bg-live animate-livepulse h-2 w-2 rounded-full" />
        )}
        <LocateFixed aria-hidden="true" className="h-4 w-4" />
        <span>{live ? 'Live match' : 'Current match'}</span>
      </button>
    </Panel>
  );
}
