import { useEffect } from 'react';
import { useReactFlow, type ReactFlowInstance, type Rect } from '@xyflow/react';
import { NODE_W, NODE_H } from '../layout/layout-constants';
import type { RoadmapFocus, RoadmapNode } from '../graph-model';

const PADDING = 0.16;
const DURATION = 500;
/** Fraction of the pane reserved as breathing room around the framed content. */
const FRAME_PAD = 0.12;
/** Zoom clamps — must mirror the canvas's `minZoom`/`maxZoom` so framing sticks. */
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.8;

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

/** Pixel size of the React Flow pane, or null when it is not mounted yet. */
function paneSize(): { width: number; height: number } | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector('.react-flow');
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return { width: rect.width, height: rect.height };
}

/**
 * Frame `bounds` TOP-aligned: fit to width, pin the content's top edge near the
 * pane top (with breathing room). The roadmap is far taller than it is wide, so a
 * centered `fitView` clamps at `minZoom` and pushes the top band (group headers +
 * standings) ABOVE the viewport. Top-aligning keeps that band — and the first
 * day-row — reachable, while the knockout funnel stays below the fold (pannable).
 * Returns false when the pane is not measurable yet (caller falls back to fitView).
 */
export function frameTopAligned(
  rf: Pick<ReactFlowInstance, 'setViewport'>,
  bounds: Rect,
  duration: number,
): boolean {
  const pane = paneSize();
  if (!pane || bounds.width === 0) return false;
  const usableW = pane.width * (1 - 2 * FRAME_PAD);
  const usableH = pane.height * (1 - 2 * FRAME_PAD);
  const fitZoom = Math.min(usableW / bounds.width, usableH / bounds.height);
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));
  // Center horizontally; pin the top edge with FRAME_PAD of clear air above it.
  const x = (pane.width - bounds.width * zoom) / 2 - bounds.x * zoom;
  const y = pane.height * FRAME_PAD - bounds.y * zoom;
  void rf.setViewport({ x, y, zoom }, { duration });
  return true;
}

/**
 * Move the camera when `focus` changes. Focus never alters the graph — `all`
 * frames everything TOP-aligned (so the standings band stays in view on the tall
 * canvas), `groups` frames the header columns + group cards, `knockout` frames
 * the funnel.
 */
export function useFocusCamera(focus: RoadmapFocus, nodes: RoadmapNode[]): void {
  const rf = useReactFlow();
  const { fitView, fitBounds } = rf;
  useEffect(() => {
    if (nodes.length === 0) return;
    const id = window.setTimeout(() => {
      if (focus === 'all') {
        const bounds = boundsOf(nodes);
        if (!bounds || !frameTopAligned(rf, bounds, DURATION)) {
          void fitView({ padding: 0.12, duration: DURATION });
        }
        return;
      }
      const subset = nodes.filter((n) =>
        focus === 'groups' ? isGroupZoneNode(n) : isKnockoutNode(n),
      );
      const bounds = boundsOf(subset);
      if (bounds) void fitBounds(bounds, { padding: PADDING, duration: DURATION });
    }, 40);
    return () => window.clearTimeout(id);
  }, [focus, nodes, rf, fitView, fitBounds]);
}
