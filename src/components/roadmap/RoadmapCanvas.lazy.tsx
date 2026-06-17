'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy boundary for the heavy React Flow canvas: `ssr: false` keeps the canvas
 * (and React Flow) out of the initial bundle and avoids hydration mismatch on
 * measured nodes. The page shell stays light and server-rendered.
 */
const RoadmapCanvasLazy = dynamic(() => import('./RoadmapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="pitch-grid grid h-full w-full place-items-center">
      <span className="animate-pulse font-display text-sm uppercase tracking-[0.2em] text-muted">
        Preparing the bracket…
      </span>
    </div>
  ),
});

export default RoadmapCanvasLazy;
