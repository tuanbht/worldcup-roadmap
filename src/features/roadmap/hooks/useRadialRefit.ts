/**
 * A dedicated camera effect that re-fits the viewport when the LAYOUT MODE flips:
 * it fires `fitView({ duration: 0 })` when `mode` CHANGES (skipping the first run
 * via a `prevModeRef`, like `useFocusCamera`'s `prevFocusRef`), and is guarded on
 * `mode` NOT `nodes` so a TanStack refetch never re-frames [H3].
 *
 * The fit is deferred a tick so React Flow has the new circle nodes laid out
 * before it frames them; `duration: 0` snaps (no pan flake). The initial frame is
 * owned by the cold-load fitter (`useFitOnChange`), so the first run is skipped.
 */
import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { LayoutMode } from '../graph-model';

/** Breathing room around the framed circle, mirroring the canvas fitView padding. */
const PADDING = 0.12;
/** Defer one frame so the new layout's nodes exist before we frame them. */
const FIT_DELAY = 40;

export function useRadialRefit(mode: LayoutMode): void {
  const { fitView } = useReactFlow();
  // The `mode` at the last framed/skipped run. Per-mount; lets the effect skip the
  // initial run and distinguish a real mode flip from a same-mode refetch re-render.
  const prevModeRef = useRef<LayoutMode | null>(null);

  useEffect(() => {
    // Skip the first effective run: the cold-load fitter owns the initial frame.
    if (prevModeRef.current === null) {
      prevModeRef.current = mode;
      return;
    }
    // Same mode (a refetch re-render) → no re-frame; guard on `mode`, not `nodes`.
    if (mode === prevModeRef.current) return;
    prevModeRef.current = mode;
    const id = window.setTimeout(() => {
      void fitView({ padding: PADDING, duration: 0 });
    }, FIT_DELAY);
    return () => window.clearTimeout(id);
  }, [mode, fitView]);
}
