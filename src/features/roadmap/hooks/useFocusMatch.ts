import { useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { NODE_W, NODE_H } from '../layout/layout-constants';
import { FOCUS_ZOOM, FOCUS_DURATION_MS } from '../focus-target';

interface UseFocusMatchOptions {
  /** Called with the focused matchId after the camera move starts (selection/highlight). */
  onFocused?: (matchId: string) => void;
}

/**
 * Returns a stable `focusMatch(matchId)` that imperatively centers the camera on
 * that match's node. Reuses React Flow's `setCenter` (the same primitive the
 * declarative `useFocusCamera` is built on) so a single-node click-to-center stays
 * explicit and unit-testable.
 *
 * The node is read via `getNode` and centered with the named focus constants. A
 * missing node is a safe no-op (no dead camera move). `focusMatch` keeps a stable
 * identity across re-renders, and routes to the LATEST `onFocused` via a ref so a
 * handle captured before a re-render never fires a stale callback.
 */
export function useFocusMatch(options?: UseFocusMatchOptions): {
  focusMatch: (matchId: string) => void;
} {
  const { getNode, setCenter } = useReactFlow();

  const onFocusedRef = useRef(options?.onFocused);
  useEffect(() => {
    onFocusedRef.current = options?.onFocused;
  }, [options?.onFocused]);

  const focusMatch = useCallback(
    (matchId: string) => {
      const node = getNode(matchId);
      if (!node) return;
      setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, {
        zoom: FOCUS_ZOOM,
        duration: FOCUS_DURATION_MS,
      });
      onFocusedRef.current?.(matchId);
    },
    [getNode, setCenter],
  );

  return { focusMatch };
}
