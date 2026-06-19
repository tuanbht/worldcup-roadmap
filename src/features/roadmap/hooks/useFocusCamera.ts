import { useEffect } from 'react';
import { useReactFlow, type Rect } from '@xyflow/react';
import { NODE_W, NODE_H } from '../layout/layout-constants';
import type { RoadmapFocus, RoadmapNode } from '../graph-model';

const PADDING = 0.16;
const DURATION = 500;

/** Footprint of a node by type (guides are roughly card-width / small). */
export function footprintOf(node: RoadmapNode): { w: number; h: number } {
  if (node.type === 'day-marker') return { w: 96, h: 32 };
  if (node.type === 'group-header') return { w: NODE_W, h: 44 };
  return { w: NODE_W, h: NODE_H };
}

/**
 * True for the group zone: the column headers PLUS the group-stage match cards.
 * Guaranteed non-empty so the "Groups" tab frames a real subset.
 */
export function isGroupZoneNode(node: RoadmapNode): boolean {
  if (node.type === 'group-header') return true;
  return node.type === 'match' && node.data.stage === 'GROUP_STAGE';
}

/** The knockout zone: match cards that are NOT in the group stage. */
export function isKnockoutNode(node: RoadmapNode): boolean {
  return node.type === 'match' && node.data.stage !== 'GROUP_STAGE';
}

/** Axis-aligned bounds of a node set, accounting for each node's footprint. */
export function boundsOf(nodes: RoadmapNode[]): Rect | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const { w, h } = footprintOf(node);
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + w);
    maxY = Math.max(maxY, node.position.y + h);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Move the camera when `focus` changes. Focus never alters the graph — `all`
 * frames everything, `groups` frames the header columns + group cards,
 * `knockout` frames the funnel.
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
        focus === 'groups' ? isGroupZoneNode(n) : isKnockoutNode(n),
      );
      const bounds = boundsOf(subset);
      if (bounds) void fitBounds(bounds, { padding: PADDING, duration: DURATION });
    }, 40);
    return () => window.clearTimeout(id);
  }, [focus, nodes, fitView, fitBounds]);
}
