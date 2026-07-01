/**
 * Geometry tuning tokens for the matrix "journey-lanes" subway layout
 * (2026-07-01-1030-matrix-journey-lanes-view). Values are TUNING, not contract:
 * the matrix specs assert RELATIONS (one column per stage-band, monotonic x by
 * stage chronology, distinct y per column slot) — mirroring the
 * `radial-constants.ts`/`layout-constants.ts` doctrine. `computeMatrixLayout`
 * reads these; the specs never hardcode a pixel value.
 */
import type { Stage } from '@/domain/types';

/** Origin of the station grid (top-left of column 0, row 0). */
export const MATRIX_ORIGIN_X = 0;
export const MATRIX_ORIGIN_Y = 0;

/** Horizontal gap between stage columns (station ~300 wide + air). */
export const MATRIX_COL_PITCH = 460;

/** Vertical gap between stacked stations in a column. */
export const MATRIX_SLOT_PITCH = 128;

/** React Flow node footprint of a station (matches the CSS). */
export const MATRIX_STATION_W = 300;
export const MATRIX_STATION_H = 96;

/** Smoothstep rounded-corner radius for lane edges. */
export const MATRIX_CORNER_RADIUS = 12;

/**
 * One chronological stage-band column. `stages` is the set of `Stage`s that land
 * in this column (col 7 stacks THIRD_PLACE + FINAL); `matchday` narrows the three
 * group columns (1..3), null for the KO columns.
 */
export interface MatrixColumn {
  readonly colIndex: number;
  readonly stages: readonly Stage[];
  /** Group matchday (1..3) for the three group columns; null for KO columns. */
  readonly matchday: number | null;
}

/**
 * The 8-column stage spec (Group MD1 · MD2 · MD3 · R32 · R16 · QF · SF · Final
 * band). Left → right chronology; col 7 stacks the THIRD_PLACE play-off + FINAL
 * (both after SF) so the map ends on one "final band" rather than a lonely single
 * node. THIRD_PLACE precedes FINAL chronologically (match 103 vs 104) so it takes
 * the upper slot within the shared column.
 */
export const MATRIX_STAGE_COLUMNS: readonly MatrixColumn[] = [
  { colIndex: 0, stages: ['GROUP_STAGE'], matchday: 1 },
  { colIndex: 1, stages: ['GROUP_STAGE'], matchday: 2 },
  { colIndex: 2, stages: ['GROUP_STAGE'], matchday: 3 },
  { colIndex: 3, stages: ['ROUND_OF_32'], matchday: null },
  { colIndex: 4, stages: ['ROUND_OF_16'], matchday: null },
  { colIndex: 5, stages: ['QUARTER_FINALS'], matchday: null },
  { colIndex: 6, stages: ['SEMI_FINALS'], matchday: null },
  { colIndex: 7, stages: ['THIRD_PLACE', 'FINAL'], matchday: null },
];

/** The x coordinate of a 0-based column index. */
export function matrixColumnX(colIndex: number): number {
  return MATRIX_ORIGIN_X + colIndex * MATRIX_COL_PITCH;
}
