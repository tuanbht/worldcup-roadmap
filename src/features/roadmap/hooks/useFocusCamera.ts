import { useEffect, useRef } from 'react';
import { useReactFlow, type ReactFlowInstance, type Rect } from '@xyflow/react';
import { NODE_W, NODE_H, STANDINGS_W, GROUP_TABLE_H } from '../layout/layout-constants';
import { mobileZoomFloor } from '../responsive';
import type { RoadmapFocus, RoadmapNode } from '../graph-model';

const PADDING = 0.16;
const DURATION = 500;
/** Fraction of the pane reserved as breathing room around the framed content. */
const FRAME_PAD = 0.12;
/** Upper zoom clamp — mirrors the canvas's `maxZoom`. The LOWER clamp is the
 *  viewport-width-aware `mobileZoomFloor` so framing == the canvas `minZoom`
 *  (single source of truth: 0.2 on desktop, MOBILE_MIN_ZOOM ≤640px). */
const MAX_ZOOM = 1.8;
/**
 * Panes ≥ this width keep the original CENTERED top-aligned frame (so the
 * desktop ≥1024 snapshots stay byte-identical). NARROWER panes (the 320/375/768
 * responsive targets) left-align the overflowing bracket so the leftmost group
 * column — Group A's standings header — stays on-screen and reachable.
 */
const DESKTOP_CENTER_MIN_WIDTH = 1024;
/**
 * Top clearance (px) reserved below the floating top-left StageToggle when a
 * narrow pane left-aligns the frame, so Group A's standings header opens BELOW
 * the toggle pill instead of under it (where the toggle would intercept taps).
 * Sized for the coarse-pointer-grown pill (≈52px) + the React-Flow panel inset.
 */
const MOBILE_TOGGLE_CLEARANCE = 64;

/** Footprint of a node by type (guides are roughly card-width / small). */
export function footprintOf(node: RoadmapNode): { w: number; h: number } {
  if (node.type === 'day-marker') return { w: 96, h: 32 };
  if (node.type === 'group-standings') return { w: STANDINGS_W, h: GROUP_TABLE_H };
  return { w: NODE_W, h: NODE_H };
}

/**
 * True for the group zone: the always-on standings tables (the per-column
 * headers) PLUS the group-stage match cards. Guaranteed non-empty so the
 * "Groups" tab frames a real subset.
 */
export function isGroupZoneNode(node: RoadmapNode): boolean {
  if (node.type === 'group-standings') return true;
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
 *
 * Horizontal alignment: panes ≥ DESKTOP_CENTER_MIN_WIDTH keep the original
 * CENTERED frame (byte-identical ≥1024 snapshots). On a narrower pane the floored
 * zoom makes the bracket far wider than the viewport, so centering would push the
 * leftmost column off the left edge; there we LEFT-align (pin the content's left
 * near the pane's left with FRAME_PAD breathing room) so the first column — Group
 * A's standings header — is on-screen and reachable.
 *
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
  // Clamp to the same width-aware floor the canvas uses for `minZoom`, so the
  // top-aligned frame opens legibly (not unreadably tiny) on a 320px pane.
  const minZoom = mobileZoomFloor(pane.width);
  const zoom = Math.max(minZoom, Math.min(MAX_ZOOM, fitZoom));
  const scaledW = bounds.width * zoom;
  // Narrow panes left-align the overflowing bracket so the first group column
  // stays reachable; ≥1024 keeps the original centered frame (snapshots fixed).
  const overflowsNarrowPane = scaledW > pane.width && pane.width < DESKTOP_CENTER_MIN_WIDTH;
  const x = overflowsNarrowPane
    ? pane.width * FRAME_PAD - bounds.x * zoom
    : (pane.width - scaledW) / 2 - bounds.x * zoom;
  // Narrow panes start the frame below the top-left toggle's clearance band so
  // Group A's header opens BELOW the floating toggle (which would otherwise
  // intercept its tap); desktop keeps the FRAME_PAD top inset unchanged.
  const topInset = overflowsNarrowPane
    ? Math.max(pane.height * FRAME_PAD, MOBILE_TOGGLE_CLEARANCE)
    : pane.height * FRAME_PAD;
  const y = topInset - bounds.y * zoom;
  void rf.setViewport({ x, y, zoom }, { duration });
  return true;
}

/** Bounded retry budget for the measurable-pane wait (≈ 8 × 50ms = 400ms). */
const FRAME_RETRY_ATTEMPTS = 8;
const FRAME_RETRY_DELAY = 50;

/**
 * Frame `bounds` deterministically: retry `frameTopAligned` until the pane is
 * measurable (bounded), and ONLY fall back to a centered `fitView` once the
 * budget is exhausted. This removes the race where, before the pane was
 * measurable, the centering fallback ran instead of the (left-aligned on narrow
 * panes) top-aligned frame — a divergence that made the first-load transform
 * non-deterministic on tablet/mobile. Returns a cleanup that cancels any pending
 * retry so a re-frame or unmount can't leave a stale timer running.
 */
export function frameTopAlignedWithRetry(
  rf: Pick<ReactFlowInstance, 'setViewport'>,
  bounds: Rect | null,
  duration: number,
  fallback: () => void,
): () => void {
  if (!bounds) {
    fallback();
    return () => undefined;
  }
  let timer: number | undefined;
  let attempts = 0;
  const attempt = () => {
    if (frameTopAligned(rf, bounds, duration)) return;
    if (attempts >= FRAME_RETRY_ATTEMPTS) {
      fallback();
      return;
    }
    attempts += 1;
    timer = window.setTimeout(attempt, FRAME_RETRY_DELAY);
  };
  attempt();
  return () => {
    if (timer !== undefined) window.clearTimeout(timer);
  };
}

/**
 * Move the camera when `focus` CHANGES — and ONLY then. Focus never alters the
 * graph — `all` frames everything TOP-aligned (so the standings band stays in
 * view on the tall canvas), `groups` frames the header columns + group cards,
 * `knockout` frames the funnel.
 *
 * The INITIAL `all` frame is owned by `useFitOnChange` (keyed on data arrival);
 * this hook skips its first run so the two don't issue competing camera
 * animations on mount (which would leave the first-load transform mid-flight and
 * non-deterministic). It then frames on every subsequent `focus` change.
 *
 * It NEVER re-frames on a data-only refetch. A TanStack Query refetch mints a
 * new `tournament` ref → a brand-new `nodes` array identity (in this effect's
 * deps) with an UNCHANGED `focus`; without a gate the effect would re-run and
 * snap the camera, discarding the user's zoom + pan. The `prevFocusRef` guard
 * frames only when `focus` actually changed, so a refetch is a no-op while a
 * real StageToggle still re-frames.
 */
export function useFocusCamera(focus: RoadmapFocus, nodes: RoadmapNode[]): void {
  const rf = useReactFlow();
  const { fitView, fitBounds } = rf;
  const framedOnce = useRef(false);
  // The `focus` value at the last framed/skipped run. Per-mount; lets the effect
  // distinguish a real focus change (frame) from a data-only refetch (no-op).
  const prevFocusRef = useRef<RoadmapFocus | null>(null);
  useEffect(() => {
    if (nodes.length === 0) return;
    // Skip the first effective run (mount with data): `useFitOnChange` owns the
    // initial frame; re-framing here too would fight it and desync the transform.
    // Record the initial focus so a later same-focus refetch is detected.
    if (!framedOnce.current) {
      framedOnce.current = true;
      prevFocusRef.current = focus;
      return;
    }
    // A data-only refetch: `nodes` changed but `focus` did not → no re-frame.
    if (focus === prevFocusRef.current) return;
    prevFocusRef.current = focus;
    let cancelFrame: (() => void) | undefined;
    const id = window.setTimeout(() => {
      if (focus === 'all') {
        cancelFrame = frameTopAlignedWithRetry(rf, boundsOf(nodes), DURATION, () => {
          void fitView({ padding: 0.12, duration: DURATION });
        });
        return;
      }
      const subset = nodes.filter((n) =>
        focus === 'groups' ? isGroupZoneNode(n) : isKnockoutNode(n),
      );
      const bounds = boundsOf(subset);
      if (bounds) void fitBounds(bounds, { padding: PADDING, duration: DURATION });
    }, 40);
    return () => {
      window.clearTimeout(id);
      cancelFrame?.();
    };
  }, [focus, nodes, rf, fitView, fitBounds]);
}
