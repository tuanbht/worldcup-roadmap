/**
 * Geometry shared by the layout engine and the node CSS. `NODE_W`/`NODE_H`
 * mirror the --node-w / --node-h design tokens in global.css.
 *
 * Two coordinate families live here:
 *  - the horizontal GROUP BAND (one lane per group, matches by kickoff), and
 *  - the vertical KNOCKOUT (stages stacked top->bottom, fan-in along x).
 *
 * Values are tuning, not contract: the layout specs assert RELATIONS
 * (monotonic / midpoint / strictly-increasing), never these absolutes.
 */
export const NODE_W = 260;
export const NODE_H = 108;

export const GROUP_W = 296;
export const GROUP_H = 208;

// --- Horizontal group band ---------------------------------------------------
/** Table width consumed before the first match in a lane. */
export const TABLE_W = GROUP_W;
/** Gap between the standings table and the lane's first match. */
export const GROUP_GAP = 56;
/** Horizontal step between consecutive matches within a lane. */
export const GROUP_MATCH_STEP_X = NODE_W + 56;
/** Vertical distance between group lanes (>= GROUP_H so lanes never overlap). */
export const LANE_PITCH_Y = GROUP_H + 40;

// --- Vertical knockout -------------------------------------------------------
/** Vertical distance between knockout stages (R32 -> R16 -> ... -> FINAL). */
export const STAGE_PITCH_Y = NODE_H + 110;
/** Horizontal spacing of the R32 leaves (drives every midpoint above them). */
export const LEAF_PITCH_X = NODE_W + 36;
/** Gap between the bottom of the group band and the top of the knockout band. */
export const SECTION_GAP = 240;

/** Total vertical extent of the group band: one lane per group. */
export function groupBandHeight(groupCount: number): number {
  return groupCount * LANE_PITCH_Y;
}

export interface XY {
  readonly x: number;
  readonly y: number;
}
