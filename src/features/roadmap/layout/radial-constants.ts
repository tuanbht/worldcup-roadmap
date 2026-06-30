/**
 * STUB (RED phase, 2026-06-30-1104-radial-circle-bracket-view).
 *
 * Geometry tokens for the radial "circle" knockout layout. Values are TUNING,
 * not contract: the radial specs assert RELATIONS (Final at center, dots
 * equiangular at 2π/16, badges at 2π/32, monotonic decreasing radii) — mirroring
 * the `layout-constants.ts` doctrine. The GREEN stage owns the final numbers; the
 * stub provides a self-consistent set so the layout/builder type-check and the
 * tests fail on MISSING LOGIC (the unimplemented layout/builder), not on an
 * absent export.
 */
import type { XY } from './layout-constants';

/** Center of the circle (the Final sits here, radius 0). */
export const RADIAL_CX = 0;
export const RADIAL_CY = 0;

/**
 * Radius by tree depth (0 = Final … 4 = R32). STRICTLY DECREASING toward the
 * center with `RING_RADII[0] === 0`, so the rounds read as concentric rings.
 */
export const RING_RADII: readonly number[] = [0, 160, 320, 480, 640];

/** Outer ring the 32 team badges sit on — just beyond the R32 dot ring. */
export const BADGE_RING_RADIUS = 720;

/** Half the angular gap between a match's two badges: `(2π/16)/4`. */
export const HALF_GAP = (2 * Math.PI) / 16 / 4;

/** React Flow node footprints (square) for the new circle node types. */
export const BADGE_SIZE = 44;
export const DOT_SIZE = 18;
export const CENTER_SIZE = 96;

export const RADIAL_CENTER: XY = { x: RADIAL_CX, y: RADIAL_CY };
