import { useEffect } from 'react';
import { useReactFlow, type Rect } from '@xyflow/react';
import { NODE_W, NODE_H, GROUP_W, GROUP_H } from '../layout/layout-constants';
import type { RoadmapFocus, RoadmapNode } from '../graph-model';

const PADDING = 0.16;
const DURATION = 500;

/** True for the group band (standings tables + group-stage match cards). */
function isGroupBandNode(node: RoadmapNode): boolean {
  return node.type === 'group' || (node.type === 'match' && node.data.stage === 'GROUP_STAGE');
}

/** Axis-aligned bounds of a node set, accounting for each node's footprint. */
function boundsOf(nodes: RoadmapNode[]): Rect | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const w = node.type === 'group' ? GROUP_W : NODE_W;
    const h = node.type === 'group' ? GROUP_H : NODE_H;
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + w);
    maxY = Math.max(maxY, node.position.y + h);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Move the camera when `focus` changes. Focus never alters the graph — `all`
 * frames everything, `groups` frames the top band, `knockout` frames the tree.
 */
export function useFocusCamera(focus: RoadmapFocus, nodes: RoadmapNode[]): void {
  const { fitView, fitBounds } = useReactFlow();
  useEffect(() => {
    if (nodes.length === 0) return;
    const id = window.setTimeout(() => {
      if (focus === 'all') {
        void fitView({ padding: 0.12, duration: DURATION });
        return;
      }
      const subset = nodes.filter((n) =>
        focus === 'groups' ? isGroupBandNode(n) : !isGroupBandNode(n),
      );
      const bounds = boundsOf(subset);
      if (bounds) void fitBounds(bounds, { padding: PADDING, duration: DURATION });
    }, 40);
    return () => window.clearTimeout(id);
  }, [focus, nodes, fitView, fitBounds]);
}
