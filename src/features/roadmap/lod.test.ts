import { describe, expect, it } from 'vitest';
import { LOD_ENTER, LOD_EXIT, zoomToLod, type Lod } from './lod';

/**
 * Unit spec for the semantic-zoom LOD mapping (Acceptance #8, #10).
 *
 * RED until Stage 5 implements `zoomToLod` (the stub throws). These assertions
 * encode the LOCKED design: three bands with a hysteresis gap so the band cannot
 * flicker at a boundary, where
 *   - `LOD_ENTER.*` is crossed going UP (enter a richer band) and
 *   - `LOD_EXIT.*` is crossed going DOWN (leave a band),
 * with every enter threshold STRICTLY above its matching exit threshold.
 *
 * The repo's real zoom domain is [minZoom=0.2, maxZoom=1.8] (RoadmapCanvas), so
 * the extremes are tested against those literals.
 *
 * All sentinel zooms are DERIVED from the exported thresholds, never hardcoded,
 * so the suite stays correct if Stage 5 tunes the thresholds while preserving
 * the ordering invariants below.
 */

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.8;

/** A zoom strictly inside a hysteresis gap: above EXIT, below ENTER. */
const midGap = (band: 'titles' | 'detail'): number => (LOD_ENTER[band] + LOD_EXIT[band]) / 2;

/** A vanishingly small step used to probe just-below / just-above a threshold. */
const EPS = 1e-3;

describe('LOD thresholds (hysteresis invariants)', () => {
  it('keeps a non-zero hysteresis gap: every ENTER sits strictly above its EXIT', () => {
    expect(LOD_ENTER.titles).toBeGreaterThan(LOD_EXIT.titles);
    expect(LOD_ENTER.detail).toBeGreaterThan(LOD_EXIT.detail);
  });

  it('orders the bands: both titles thresholds sit below both detail thresholds', () => {
    expect(LOD_ENTER.titles).toBeLessThan(LOD_ENTER.detail);
    expect(LOD_EXIT.titles).toBeLessThan(LOD_EXIT.detail);
    // The detail EXIT must also clear the titles ENTER so the two gaps never overlap.
    expect(LOD_EXIT.detail).toBeGreaterThan(LOD_ENTER.titles);
  });

  it('keeps every threshold inside the real zoom domain [0.2, 1.8]', () => {
    for (const t of [LOD_ENTER.titles, LOD_ENTER.detail, LOD_EXIT.titles, LOD_EXIT.detail]) {
      expect(t).toBeGreaterThan(MIN_ZOOM);
      expect(t).toBeLessThan(MAX_ZOOM);
    }
  });
});

describe('zoomToLod — fresh mapping (no previous band) snaps to ENTER thresholds', () => {
  it('returns "overview" at min zoom and anywhere below the titles ENTER', () => {
    expect(zoomToLod(MIN_ZOOM)).toBe<Lod>('overview');
    expect(zoomToLod(LOD_ENTER.titles - EPS)).toBe<Lod>('overview');
  });

  it('returns "titles" from the titles ENTER up to (but not at) the detail ENTER', () => {
    expect(zoomToLod(LOD_ENTER.titles)).toBe<Lod>('titles');
    expect(zoomToLod(midGap('detail'))).toBe<Lod>('titles');
    expect(zoomToLod(LOD_ENTER.detail - EPS)).toBe<Lod>('titles');
  });

  it('returns "detail" at and above the detail ENTER, up to max zoom', () => {
    expect(zoomToLod(LOD_ENTER.detail)).toBe<Lod>('detail');
    expect(zoomToLod(MAX_ZOOM)).toBe<Lod>('detail');
  });

  it('lands a fresh read inside a gap on the LOWER band (proves the gap belongs to ENTER)', () => {
    // Without memory, the gap below an ENTER threshold resolves down, not up.
    expect(zoomToLod(midGap('titles'))).toBe<Lod>('overview');
    expect(zoomToLod(midGap('detail'))).toBe<Lod>('titles');
  });
});

describe('zoomToLod — hysteresis holds the previous band across its gap', () => {
  it('holds "detail" anywhere in the detail gap (below ENTER, at/above EXIT)', () => {
    expect(zoomToLod(midGap('detail'), 'detail')).toBe<Lod>('detail');
    expect(zoomToLod(LOD_ENTER.detail - EPS, 'detail')).toBe<Lod>('detail');
    // Exactly AT the exit threshold still counts as inside the band (>= semantics).
    expect(zoomToLod(LOD_EXIT.detail, 'detail')).toBe<Lod>('detail');
  });

  it('drops "detail" to exactly "titles" only once zoom falls below the detail EXIT', () => {
    // Strong: assert the precise destination band, not merely "not detail".
    expect(zoomToLod(LOD_EXIT.detail - EPS, 'detail')).toBe<Lod>('titles');
  });

  it('holds "titles" across both its own gaps without snapping up or down', () => {
    // Dipping toward overview: stays titles above the titles EXIT.
    expect(zoomToLod(midGap('titles'), 'titles')).toBe<Lod>('titles');
    expect(zoomToLod(LOD_EXIT.titles, 'titles')).toBe<Lod>('titles');
    // Rising toward detail: stays titles below the detail ENTER.
    expect(zoomToLod(midGap('detail'), 'titles')).toBe<Lod>('titles');
  });

  it('drops "titles" to "overview" only once zoom falls below the titles EXIT', () => {
    expect(zoomToLod(LOD_EXIT.titles - EPS, 'titles')).toBe<Lod>('overview');
  });

  it('holds "overview" in the titles gap, then promotes to "titles" at the titles ENTER', () => {
    expect(zoomToLod(midGap('titles'), 'overview')).toBe<Lod>('overview');
    expect(zoomToLod(LOD_ENTER.titles - EPS, 'overview')).toBe<Lod>('overview');
    // Crossing the ENTER threshold promotes one band exactly.
    expect(zoomToLod(LOD_ENTER.titles, 'overview')).toBe<Lod>('titles');
  });

  it('promotes "titles" to "detail" only once zoom reaches the detail ENTER', () => {
    expect(zoomToLod(LOD_ENTER.detail - EPS, 'titles')).toBe<Lod>('titles');
    expect(zoomToLod(LOD_ENTER.detail, 'titles')).toBe<Lod>('detail');
  });

  it('clamps to the extreme band at min/max zoom regardless of the previous band', () => {
    for (const prev of ['overview', 'titles', 'detail'] as const) {
      expect(zoomToLod(MIN_ZOOM, prev)).toBe<Lod>('overview');
      expect(zoomToLod(MAX_ZOOM, prev)).toBe<Lod>('detail');
    }
  });
});
