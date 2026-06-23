/**
 * Legend chip strip — Live / Finished / Upcoming + provider attribution line.
 *
 * Used in two places:
 *   - RoadmapCanvas (desktop): inside a floating `<Panel position="top-right">`
 *     with `hidden sm:block` so it disappears below the sm breakpoint.
 *   - App.tsx (mobile): a full-width row in the header, visible only below sm
 *     (`sm:hidden`), so the legend never floats over the canvas on small screens.
 */
export function Legend({ provider }: { provider: string | null }) {
  const dots: Array<[string, string]> = [
    ['Live', 'bg-live'],
    ['Finished', 'bg-accent'],
    ['Upcoming', 'bg-dim'],
  ];
  return (
    <div className="border-edge bg-surf-1/80 flex flex-col gap-2 rounded-xl border px-3 py-2.5 text-[0.72rem] backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        {dots.map(([label, dot]) => (
          <span key={label} className="text-muted flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            {label}
          </span>
        ))}
      </div>
      {provider && (
        <span className="text-dim">
          {provider === 'fifa' ? 'Live data · FIFA' : 'Demo data · offline fixture'}
        </span>
      )}
    </div>
  );
}
