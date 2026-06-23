import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { boundsOf, frameTopAligned } from './useFocusCamera';
import type { RoadmapNode } from '../graph-model';

/** Padding tuned to frame the tall, continuous group-band + knockout canvas. */
const FIT_PADDING = 0.12;

/**
 * Re-frame the viewport whenever `key` changes (data arrival, node-count change).
 * TOP-aligns the content (so the group-standings header band stays in view on
 * the tall canvas), falling back to a centered `fitView` before the pane is
 * measurable.
 */
export function useFitOnChange(key: unknown, nodes: readonly RoadmapNode[] = []): void {
  const rf = useReactFlow();
  const { fitView } = rf;
  useEffect(() => {
    const id = window.setTimeout(() => {
      const bounds = boundsOf([...nodes]);
      if (!bounds || !frameTopAligned(rf, bounds, 400)) {
        void fitView({ padding: FIT_PADDING, duration: 400 });
      }
    }, 60);
    return () => window.clearTimeout(id);
    // Re-frame on the explicit key (data/count change), not on every nodes ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rf, fitView]);
}
