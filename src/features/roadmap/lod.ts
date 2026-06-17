/**
 * Semantic-zoom level-of-detail (LOD) mapping.
 *
 * Three bands driven by hysteresis so the LOD does not flicker at a threshold.
 * `LOD_ENTER` thresholds (crossing UP) sit strictly above the matching
 * `LOD_EXIT` thresholds (crossing DOWN); `prev` selects which set applies. Pure,
 * no React. Detail visibility in the canvas is driven by this band via a
 * `data-lod` attribute + CSS opacity (compositor-only), never a re-render.
 */

export type Lod = 'overview' | 'titles' | 'detail';

/** Zoom thresholds crossed going UP (enter a richer band). */
export const LOD_ENTER: { readonly titles: number; readonly detail: number } = {
  titles: 0.45,
  detail: 0.85,
};

/** Zoom thresholds crossed going DOWN (leave a band). Strictly below LOD_ENTER. */
export const LOD_EXIT: { readonly titles: number; readonly detail: number } = {
  titles: 0.35,
  detail: 0.7,
};

/** Band order, lowest detail first, for index-based comparisons. */
const BAND_ORDER: readonly Lod[] = ['overview', 'titles', 'detail'];

/**
 * The band a *fresh* read (no memory) resolves to: a gap below an ENTER
 * threshold resolves DOWN to the lower band.
 */
function freshLod(zoom: number): Lod {
  if (zoom >= LOD_ENTER.detail) return 'detail';
  if (zoom >= LOD_ENTER.titles) return 'titles';
  return 'overview';
}

/**
 * The lowest band the zoom is *still entitled to* given hysteresis: a value
 * holds its richer band until it falls below that band's EXIT threshold.
 */
function exitLod(zoom: number): Lod {
  if (zoom >= LOD_EXIT.detail) return 'detail';
  if (zoom >= LOD_EXIT.titles) return 'titles';
  return 'overview';
}

/**
 * Map a numeric zoom to a LOD band, applying hysteresis relative to `prev`.
 *
 * - Without `prev`, snaps to the ENTER thresholds (gaps resolve to the lower band).
 * - With `prev`, the band is held across its hysteresis gap: a value keeps the
 *   higher of the fresh band and (when still above the relevant EXIT) the
 *   previous band, so it never flickers at a boundary.
 */
export function zoomToLod(zoom: number, prev?: Lod): Lod {
  const fresh = freshLod(zoom);
  if (!prev) return fresh;

  // The previous band is retained only while zoom stays at/above its EXIT floor.
  const held = exitLod(zoom);
  const retained = bandIndex(held) >= bandIndex(prev) ? prev : held;

  return bandIndex(fresh) >= bandIndex(retained) ? fresh : retained;
}

function bandIndex(lod: Lod): number {
  return BAND_ORDER.indexOf(lod);
}
