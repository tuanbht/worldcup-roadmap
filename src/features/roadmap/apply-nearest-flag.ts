// Pure display-layer injection for the on-card nearest-match flag badge.
//
// The expensive roadmap graph (`buildRoadmapGraph`) is time-independent and
// memoized. "Nearest" is a time-dependent concept (it depends on `Date.now()`),
// so it is injected here in the canvas display layer — exactly mirroring the
// `onOpenStandings` opener injection in `RoadmapCanvas.displayNodes`. Keeping
// this a tiny pure function makes the "flag exactly one match node, immutably"
// contract unit-testable with no clock, no graph build, and no React runtime.
import type { RoadmapNode } from './graph-model';

/**
 * Immutably flag the single MATCH node whose id === `nearestId` with
 * `data.isNearest = true`. The `node.type === 'match'` guard confines the field
 * to `MatchNodeData` by construction, so a non-match node (day-marker /
 * group-header) sharing an id can never be flagged. `nearestId === null` (all
 * matches ended) or an id that matches no match node → nothing flagged.
 *
 * Pure: returns a NEW array; non-flagged nodes pass through as the same object
 * references; never mutates input nodes or their `data`.
 */
export function applyNearestFlag(
  nodes: readonly RoadmapNode[],
  nearestId: string | null,
): RoadmapNode[] {
  if (nearestId === null) return nodes.map((node) => node);
  return nodes.map((node) =>
    node.type === 'match' && node.id === nearestId
      ? { ...node, data: { ...node.data, isNearest: true } }
      : node,
  );
}
