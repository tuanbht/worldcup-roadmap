/**
 * Geometry for the timeline-grid layout (date rail + group columns + knockout
 * funnel). `NODE_W`/`NODE_H` mirror the --node-w / --node-h design tokens in
 * global.css.
 *
 * Values are tuning, not contract: the layout specs assert RELATIONS
 * (chronological rows / fixed columns / midpoint fan-in / no-overlap), never
 * these absolutes. `GROUP_COL_PITCH > 2*NODE_W + gap` and `SLOT >= NODE_W + gap`
 * so a column fits two side-by-side cards without overlapping its neighbour.
 */
export const NODE_W = 260;
export const NODE_H = 108;

/** Vertical pixels between adjacent day-rows on the shared axis. */
export const DAY_ROW_PITCH = NODE_H + 92;
/** Horizontal pixels between adjacent group columns (room for 2 sub-slots). */
export const GROUP_COL_PITCH = 2 * NODE_W + 96;
/** Sub-slot offset inside a column: matches at DIFFERENT kickoffs sit at x ± SLOT/2. */
export const SLOT = NODE_W + 40;
/** Vertical pitch between two cards stacked in one cell when their matches kick
 *  off at the SAME time (the simultaneous final group matchday) — they align
 *  vertically (centred on the day-row) instead of spreading horizontally. */
export const STACK = NODE_H + 20;
/** R32 leaf spacing for the centered knockout fan-in. */
export const LEAF_X_PITCH = NODE_W + 36;
/** Left date-rail width; group column 0 starts at x = RAIL_W. */
export const RAIL_W = 120;
/** Top group-header band height; day-row 0 starts at y = HEADER_H. */
export const HEADER_H = 96;
/** Horizontal inset of a day-marker inside the rail (x = RAIL_W - DAY_MARKER_INSET). */
export const DAY_MARKER_INSET = 16;

/**
 * The grid centerline the knockout funnel converges on — column 6 of the 12-col
 * grid. `CX` and `centerline(12)` are the SAME value (asserted in a spec), so
 * there is one source of truth, not two sketches. [Rev2:M1]
 */
export const CX = RAIL_W + 6 * GROUP_COL_PITCH;

/** Centerline for an arbitrary group count; `centerline(12) === CX`. */
export function centerline(groupCount = 12): number {
  return RAIL_W + (groupCount / 2) * GROUP_COL_PITCH;
}

export interface XY {
  readonly x: number;
  readonly y: number;
}
