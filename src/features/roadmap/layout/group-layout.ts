import { GROUP_GAP_X, GROUP_GAP_Y, GROUP_H, GROUP_W, type XY } from './layout-constants';

/** Even grid of group-table positions, `columns` wide. */
export function computeGroupGrid(count: number, columns: number): XY[] {
  return Array.from({ length: count }, (_, i) => ({
    x: (i % columns) * (GROUP_W + GROUP_GAP_X),
    y: Math.floor(i / columns) * (GROUP_H + GROUP_GAP_Y),
  }));
}

/** Total width occupied by a `columns`-wide group grid (used to offset the bracket). */
export function groupGridWidth(columns: number): number {
  return columns * GROUP_W + (columns - 1) * GROUP_GAP_X;
}
