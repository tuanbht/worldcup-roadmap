/**
 * Geometry shared by the layout engine and the node CSS. These mirror the
 * --node-w / --node-h / --col-gap / --row-gap design tokens in globals.css.
 */
export const NODE_W = 260;
export const NODE_H = 96;
export const COL_GAP = 120;
export const ROW_GAP = 28;

export const STEP = NODE_W + COL_GAP; // horizontal distance between rounds
export const ROW_PITCH = NODE_H + ROW_GAP; // vertical distance between R32 leaves

export const GROUP_W = 296;
export const GROUP_H = 208;
export const GROUP_GAP_X = 36;
export const GROUP_GAP_Y = 32;

export interface XY {
  readonly x: number;
  readonly y: number;
}
