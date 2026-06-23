import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { boundsOf, frameTopAlignedWithRetry } from './useFocusCamera';
import type { RoadmapNode } from '../graph-model';

/** Padding tuned to frame the tall, continuous group-band + knockout canvas. */
const FIT_PADDING = 0.12;
/**
 * The first-load frame SNAPS (duration 0) instead of animating. A timed x/y pan
 * here is invisible to the scale-based settle harness (scale barely changes while
 * x/y slides), which let the snapshot capture the pan mid-flight — a flake. A snap
 * lands on the deterministic final transform immediately, and the bracket simply
 * appears already-framed (no janky load pan). Focus-driven re-frames still animate
 * (useFocusCamera) since the user initiated them.
 */
const FRAME_DURATION = 0;

/**
 * Re-frame the viewport whenever `key` changes (data arrival, node-count change).
 * TOP-aligns the content (so the group-standings header band stays in view on
 * the tall canvas). It retries until the pane is measurable so the deterministic
 * top-aligned frame is used — only falling back to a centered `fitView` once the
 * pane stays unmeasurable. The frame SNAPS (no animation) so the first-load
 * transform is stable run-to-run (the scale-based settle harness can't track an
 * x/y-only pan, so an animated frame would flake the snapshot).
 */
export function useFitOnChange(key: unknown, nodes: readonly RoadmapNode[] = []): void {
  const rf = useReactFlow();
  const { fitView } = rf;
  useEffect(() => {
    let cancelFrame: (() => void) | undefined;
    const id = window.setTimeout(() => {
      const bounds = boundsOf([...nodes]);
      cancelFrame = frameTopAlignedWithRetry(rf, bounds, FRAME_DURATION, () => {
        void fitView({ padding: FIT_PADDING, duration: FRAME_DURATION });
      });
    }, 60);
    return () => {
      window.clearTimeout(id);
      cancelFrame?.();
    };
    // Re-frame on the explicit key (data/count change), not on every nodes ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rf, fitView]);
}
