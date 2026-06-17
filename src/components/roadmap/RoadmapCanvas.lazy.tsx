import { lazy, Suspense } from 'react';

/**
 * Lazy boundary for the heavy React Flow canvas: `React.lazy` keeps the canvas
 * (and React Flow) out of the initial bundle. The page shell stays light and
 * the fallback shows while the chunk loads. (Equivalent to the old `next/dynamic`
 * `ssr: false` boundary — there is no SSR in the Vite SPA.)
 */
const RoadmapCanvas = lazy(() => import('./RoadmapCanvas'));

function Preparing() {
  return (
    <div className="pitch-grid grid h-full w-full place-items-center">
      <span className="animate-pulse font-display text-sm uppercase tracking-[0.2em] text-muted">
        Preparing the bracket…
      </span>
    </div>
  );
}

export default function RoadmapCanvasLazy() {
  return (
    <Suspense fallback={<Preparing />}>
      <RoadmapCanvas />
    </Suspense>
  );
}
