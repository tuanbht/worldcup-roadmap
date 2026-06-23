import { AlertTriangle } from 'lucide-react';

interface ErrorFallbackProps {
  /** Headline shown above the message. */
  readonly title: string;
  /** The thrown error, used for the (collapsible) technical detail. */
  readonly error: Error;
  /** Resets the boundary and re-attempts the failed subtree. */
  readonly onRetry: () => void;
}

/**
 * Default user-facing fallback rendered by `ErrorBoundary` on a caught render
 * throw. A semantic `role="alert"` region (assertive by default) with a headline,
 * a calm reassurance line, the raw error message in a muted `<details>` for the
 * curious, and a single Retry action that resets the boundary.
 *
 * Styling uses the project design tokens (`bg-surf-1`, `text-ink`, `text-muted`,
 * `border-edge`, `text-accent`) — no hardcoded palette. The icon is decorative
 * (`aria-hidden`); the heading carries the semantics.
 */
export function ErrorFallback({ title, error, onRetry }: ErrorFallbackProps) {
  return (
    <div role="alert" className="grid h-full w-full place-items-center p-6">
      <div className="border-edge bg-surf-1 flex max-w-md flex-col items-start gap-4 rounded-xl border p-6 shadow-lg">
        <span className="text-live inline-flex items-center gap-2">
          <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={2.25} />
          <span className="font-display text-[0.7rem] font-semibold tracking-[0.18em] uppercase">
            Something went wrong
          </span>
        </span>

        <h2 className="text-ink text-xl font-bold tracking-tight">{title}</h2>

        <p className="text-muted text-sm leading-relaxed">
          This part of the roadmap hit an unexpected snag and could not be displayed. The rest of
          the page is still usable — try again, and reload if it persists.
        </p>

        <details className="text-dim w-full text-xs">
          <summary className="text-muted hover:text-ink cursor-pointer transition-colors select-none">
            Technical detail
          </summary>
          <p className="border-edge bg-surf-2 mt-2 rounded-md border px-3 py-2 font-mono break-words">
            {error.message}
          </p>
        </details>

        <button
          type="button"
          onClick={onRetry}
          className="bg-accent text-bg focus-visible:outline-accent rounded-lg px-4 py-2 text-sm font-semibold transition-[transform,opacity] duration-150 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
