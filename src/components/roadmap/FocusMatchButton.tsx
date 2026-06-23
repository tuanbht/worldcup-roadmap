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
 *
 * Responsive shape (one `<button>`, one stable `aria-label`, class-only — no DOM
 * swap): at `>= md` it is the top-center pill with its visible label; below `md`
 * (< 768px) it collapses to a ~48px (`h-12 w-12`) bottom-right circular icon
 * bubble. The text label is wrapped in a `max-md:sr-only` span (kept in the DOM
 * for assistive tech, hidden-not-removed below `md`), the live pulse rides the
 * icon's corner (`max-md:absolute`), and the panel flips to bottom-right with a
 * safe-area inset so it clears the home indicator and the match-detail sheet. The
 * `!` (Tailwind v4 important) overrides beat xyflow's `.top.center` selector; the
 * pulse reuses `animate-livepulse` so the global reduced-motion guard still kills
 * it (compositor-only transform/opacity motion).
 */
export function FocusMatchButton({ targetMatchId, isLive, onActivate }: FocusMatchButtonProps) {
  const disabled = targetMatchId === null;
  const live = !disabled && isLive;

  function handleActivate() {
    if (targetMatchId === null) return;
    onActivate(targetMatchId);
  }

  return (
    <Panel
      position="top-center"
      className={[
        'max-md:!top-auto max-md:!right-0 max-md:!bottom-0 max-md:!left-auto',
        // `!transform-none` (not `!translate-x-0`): xyflow positions the panel via the
        // legacy `transform` property; Tailwind v4's translate utilities only zero the
        // modern `translate` property, leaving xyflow's `translateX(-50%)` to drag the
        // bubble off the corner. `transform: none !important` cancels it outright.
        'max-md:!transform-none',
        'max-md:pr-1 max-md:pb-[env(safe-area-inset-bottom)]',
      ].join(' ')}
    >
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
          'max-md:relative max-md:h-12 max-md:w-12 max-md:justify-center max-md:gap-0 max-md:p-0',
          live ? 'text-live hover:text-live border-live/40' : 'text-muted hover:text-ink',
        ].join(' ')}
      >
        {live && (
          <span
            aria-hidden="true"
            className="bg-live animate-livepulse h-2 w-2 rounded-full max-md:absolute max-md:top-1 max-md:right-1"
          />
        )}
        <LocateFixed aria-hidden="true" className="h-4 w-4" />
        <span className="max-md:sr-only">{live ? 'Live match' : 'Current match'}</span>
      </button>
    </Panel>
  );
}
