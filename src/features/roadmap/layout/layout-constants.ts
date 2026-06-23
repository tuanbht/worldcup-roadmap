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

/**
 * Height of the day-marker centering box (item 1): exactly one card tall so the
 * date pill centers on the card-row centerline instead of sitting ~40px above it.
 * The renderer wraps the pill in a `DAY_MARKER_H`-tall flex-center box.
 */
export const DAY_MARKER_H = NODE_H;

/**
 * Header-band sub-bands (item 2). The always-on standings table lives under each
 * group-header in `[HEADER_TOP, HEADER_TOP + GROUP_TABLE_H)`, with `HEADER_GAP`
 * of clear air before day-row 0 at `HEADER_H`.
 *
 * `HEADER_TOP` reserves the column-title pill at the top of the band; the
 * standings table is anchored at `HEADER_TOP` (directly under the pill) and its
 * `GROUP_TABLE_H`-tall box plus `HEADER_GAP` of breathing room must clear
 * `HEADER_H` (= day-row 0). `HEADER_H` is DERIVED from these three sub-bands so
 * growing the table grows the whole header band and pushes every day-row (group
 * and knockout, both rooted at `HEADER_H`) down uniformly.
 */
export const HEADER_TOP = 56;
export const GROUP_TABLE_H = 196;
export const HEADER_GAP = 24;

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
/**
 * Top header-band height; day-row 0 starts at y = HEADER_H. Derived from the
 * three sub-bands (item 2) so the always-on standings table [HEADER_TOP,
 * HEADER_TOP + GROUP_TABLE_H) fits with `HEADER_GAP` of clear air before row 0.
 * `HEADER_TOP + GROUP_TABLE_H + HEADER_GAP === 276` (> the old flat 96).
 */
export const HEADER_H = HEADER_TOP + GROUP_TABLE_H + HEADER_GAP;
/** Vertical anchor of the always-on standings table inside the header band. */
export const STANDINGS_Y = HEADER_TOP;
/** Width of the always-on standings card (mirrors GroupTableNode's 296px). */
export const STANDINGS_W = 296;
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
