import { useEffect, useRef } from 'react';
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
 * Frame the viewport ONCE, on the first non-empty `nodes` arrival (the 0 → N
 * transition), and NEVER again — not even when the `key` / node set / count
 * changes on a later call. A TanStack Query refetch mints a new `tournament`
 * ref → rebuilt graph → a changed `nodes.length` (the call-site key); re-framing
 * on that would snap the camera back to the fit frame and discard the user's
 * zoom + pan. The `hasFramedRef` guard keeps the auto-frame to exactly the first
 * load, so refetched data updates node contents in place with the camera
 * untouched. Explicit re-frames (the "F" key, a `focus` change, FocusMatchButton)
 * are owned by other hooks and stay on demand.
 *
 * The single frame TOP-aligns the content (so the group-standings header band
 * stays in view on the tall canvas). It retries until the pane is measurable so
 * the deterministic top-aligned frame is used — only falling back to a centered
 * `fitView` once the pane stays unmeasurable. The frame SNAPS (no animation) so
 * the first-load transform is stable run-to-run (the scale-based settle harness
 * can't track an x/y-only pan, so an animated frame would flake the snapshot).
 */
export function useFitOnChange(key: unknown, nodes: readonly RoadmapNode[] = []): void {
  const rf = useReactFlow();
  const { fitView } = rf;
  // True once the first non-empty frame has fired. Per-mount (reset only on a
  // genuine remount), so a fresh canvas frames once and refetches never re-frame.
  const hasFramedRef = useRef(false);
  useEffect(() => {
    // No-op branches: already framed once, or data not yet arrived (an empty
    // initial render must NOT spend the guard). Return BEFORE scheduling — there
    // is no timer/frame to clean up, so register no cleanup.
    if (hasFramedRef.current || nodes.length === 0) return;
    hasFramedRef.current = true;

    // FRAMING branch — the first non-empty arrival. Its cleanup
    // (clearTimeout + cancelFrame) cancels a pending frame on unmount so an
    // in-flight first-load frame never lands late.
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
    // Frame once on the first non-empty key; the ref makes every later key
    // change (a refetch) a no-op, so it is intentionally not in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rf, fitView]);
}
