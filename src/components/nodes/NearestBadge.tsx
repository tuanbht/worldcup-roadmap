import { Flag } from 'lucide-react';

interface NearestBadgeProps {
  /**
   * Live affordance (`--color-live` ring + `animate-livepulse` dot, label "Live")
   * when true; accent affordance (label "Next", no pulse) when false. Derived by
   * the caller from the card's own `data.status === 'live'`.
   */
  live: boolean;
}

/**
 * A real pennant planted on the nearest match card — a rounded chip with an
 * angled tail (via `clip-path`) carrying a decorative lucide `Flag` and a short
 * label. The container exposes the stable `data-nearest-badge` test hook and
 * carries NO `data-lod-detail`, so it stays visible under the low-zoom detail
 * fade. The `Flag` icon is `aria-hidden`; the card's accessible-name suffix (set
 * by `MatchNode`) carries the semantics, so the badge adds no competing ARIA.
 *
 * Positioned above/overlapping the card's top edge, centered horizontally so it
 * clears the in-card header (group label left, StatusPill right). Compositor-only
 * styling (transform/opacity/box-shadow); the live pulse reuses the existing
 * `animate-livepulse` class (already guarded under prefers-reduced-motion).
 */
export function NearestBadge({ live }: NearestBadgeProps) {
  const tone = live
    ? 'border-live/60 bg-live/20 text-live shadow-[0_2px_10px_rgb(255_77_94/0.35)]'
    : 'border-accent/60 bg-accent/15 text-accent shadow-[0_2px_10px_rgb(61_220_151/0.3)]';

  return (
    <span
      data-nearest-badge
      className={[
        'pointer-events-none absolute -top-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1',
        'rounded-md border py-0.5 pr-3 pl-2 text-[0.62rem] font-semibold tracking-[0.1em] uppercase',
        'backdrop-blur-sm [clip-path:polygon(0_0,100%_0,calc(100%-7px)_50%,100%_100%,0_100%)]',
        '[will-change:transform]',
        tone,
      ].join(' ')}
    >
      <Flag aria-hidden="true" className="h-3 w-3 shrink-0" strokeWidth={2.5} />
      {live && (
        <span
          aria-hidden="true"
          className="bg-live animate-livepulse h-[6px] w-[6px] rounded-full [will-change:transform,opacity]"
        />
      )}
      <span>{live ? 'Live' : 'Next'}</span>
    </span>
  );
}
