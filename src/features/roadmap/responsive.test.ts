// Unit spec for the pure responsive helpers + constants behind the mobile
// gap-fill (requirement 2026-06-23-1336-mobile-friendly-small-screens).
//
// `responsive.ts` is the single source of truth for:
//   - the mobile/desktop minZoom floor constants + the pure `mobileZoomFloor`
//     selector (fed into <ReactFlow minZoom> AND useFocusCamera's clamp so the
//     two never drift),
//   - the relocated `StatColumn` interface + `STAT_COLUMNS` array (moved verbatim
//     out of GroupTableNode.tsx with the `detail` LOD flag intact), and
//   - the pure `pickStandingsColumns(variant)` selector that returns the variable
//     middle stat-column subset for the full vs compact standings tables.
//
// These assertions pin the EXACT shape (literal keys, literal constants, the
// `detail` flag per column) so the GREEN stage can't quietly invent a phantom
// `P` key or drop the LOD semantics during the move. RED until `responsive.ts`
// exists — it fails as a missing module, not a typo.
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_MIN_ZOOM,
  MOBILE_MAX_WIDTH,
  MOBILE_MIN_ZOOM,
  STAT_COLUMNS,
  mobileZoomFloor,
  pickStandingsColumns,
} from './responsive';
import { standingRow, ARG } from '@/components/nodes/__test-support__/standings-fixtures';

describe('responsive — zoom-floor constants', () => {
  it('pins the literal constant values the plan fixed', () => {
    expect(MOBILE_MAX_WIDTH).toBe(640);
    expect(DESKTOP_MIN_ZOOM).toBe(0.2);
    expect(MOBILE_MIN_ZOOM).toBe(0.32);
  });

  it('keeps the mobile floor strictly above the desktop floor (legible-on-open relation)', () => {
    // The whole point of the mobile floor is that a 296px standings card stays
    // legible on a 320px pane — so it must be the *higher* clamp.
    expect(MOBILE_MIN_ZOOM).toBeGreaterThan(DESKTOP_MIN_ZOOM);
  });
});

describe('responsive — mobileZoomFloor(width)', () => {
  // The named target-device widths the requirement calls out (320/375/414) plus
  // the two values that straddle the inclusive boundary on the mobile side.
  it.each([0, 1, 319, 375, 414, MOBILE_MAX_WIDTH - 1, MOBILE_MAX_WIDTH])(
    'returns the MOBILE floor for %ipx (<= MOBILE_MAX_WIDTH)',
    (width) => {
      expect(mobileZoomFloor(width)).toBe(MOBILE_MIN_ZOOM);
    },
  );

  it.each([MOBILE_MAX_WIDTH + 1, 768, 1024, 1440])(
    'returns the DESKTOP floor for %ipx (> MOBILE_MAX_WIDTH)',
    (width) => {
      expect(mobileZoomFloor(width)).toBe(DESKTOP_MIN_ZOOM);
    },
  );

  it('places the cutover at MOBILE_MAX_WIDTH inclusively (640 is mobile, 641 is desktop)', () => {
    // The boundary is inclusive of MOBILE_MAX_WIDTH so it mirrors the Tailwind
    // `max-[640px]` / `sm:` cutover used everywhere else in the UI: the two
    // adjacent widths must land on opposite floors with the seam exactly at 640.
    expect(mobileZoomFloor(MOBILE_MAX_WIDTH)).toBe(MOBILE_MIN_ZOOM);
    expect(mobileZoomFloor(MOBILE_MAX_WIDTH + 1)).toBe(DESKTOP_MIN_ZOOM);
  });

  it('only ever returns one of the two pinned floors (never an interpolated value)', () => {
    // Guards a future "smooth ramp" rewrite from silently returning an in-between
    // zoom: the floor is a step function over exactly {MOBILE_MIN_ZOOM, DESKTOP_MIN_ZOOM}.
    for (const width of [0, 320, 640, 641, 1024, 4096]) {
      expect([MOBILE_MIN_ZOOM, DESKTOP_MIN_ZOOM]).toContain(mobileZoomFloor(width));
    }
  });
});

describe('responsive — STAT_COLUMNS relocation (the full set)', () => {
  it('carries exactly the 7 stat columns in order, by key', () => {
    expect(STAT_COLUMNS.map((c) => c.key)).toEqual(['mp', 'w', 'd', 'l', 'gf', 'ga', 'gd']);
  });

  it('carries the original column LABELS verbatim (mp -> "MP", no phantom "P")', () => {
    const labels = Object.fromEntries(STAT_COLUMNS.map((c) => [c.key, c.label]));
    expect(labels).toMatchObject({
      mp: 'MP',
      w: 'W',
      d: 'D',
      l: 'L',
      gf: 'GF',
      ga: 'GA',
      gd: 'GD',
    });
    // There is NO `P` key — "played" is `mp`/`MP`. Guard the phantom explicitly.
    expect(STAT_COLUMNS.some((c) => c.key === 'P')).toBe(false);
  });

  it('preserves the `detail` LOD flag per column (mp/w/d/l/gf/ga true, gd false)', () => {
    const detail = Object.fromEntries(STAT_COLUMNS.map((c) => [c.key, c.detail]));
    expect(detail).toEqual({
      mp: true,
      w: true,
      d: true,
      l: true,
      gf: true,
      ga: true,
      gd: false,
    });
  });

  it('computes each column value from the StandingRow (value fns moved intact)', () => {
    // A column-distinct row so a transposed value() is caught.
    const row = standingRow(ARG, {
      played: 3,
      won: 2,
      draw: 1,
      lost: 0,
      goalsFor: 7,
      goalsAgainst: 2,
      goalDifference: 5,
    });
    const valueOf = (key: string) => STAT_COLUMNS.find((c) => c.key === key)!.value(row);
    expect(valueOf('mp')).toBe(3);
    expect(valueOf('w')).toBe(2);
    expect(valueOf('d')).toBe(1);
    expect(valueOf('l')).toBe(0);
    expect(valueOf('gf')).toBe(7);
    expect(valueOf('ga')).toBe(2);
    // GD keeps its signed-string formatter ("+5", not 5).
    expect(valueOf('gd')).toBe('+5');
  });
});

describe('responsive — pickStandingsColumns(variant)', () => {
  it("'full' returns the 7-entry STAT_COLUMNS set (same keys, in order)", () => {
    expect(pickStandingsColumns('full').map((c) => c.key)).toEqual([
      'mp',
      'w',
      'd',
      'l',
      'gf',
      'ga',
      'gd',
    ]);
  });

  it("'full' returns the SAME column objects as STAT_COLUMNS (single source of truth, not re-invented)", () => {
    // Reference identity, not just key equality: the selector must hand back the
    // relocated STAT_COLUMNS entries verbatim so the moved `value`/`detail` logic
    // can never drift from a parallel copy.
    const full = pickStandingsColumns('full');
    expect(full.map((c) => c.key)).toEqual(STAT_COLUMNS.map((c) => c.key));
    full.forEach((column, i) => expect(column).toBe(STAT_COLUMNS[i]));
  });

  it("'compact' returns EXACTLY ['mp','gd'] — MP + GD only (framed by #/team/Pts in the table)", () => {
    expect(pickStandingsColumns('compact').map((c) => c.key)).toEqual(['mp', 'gd']);
  });

  it("'compact' columns are the SAME objects as in STAT_COLUMNS (a filtered subset, not copies)", () => {
    // mp/gd in the compact set must BE the mp/gd from the full set, so the
    // surviving `value`/`detail` logic is shared — guards against a phantom
    // re-declared `{ key: 'mp', … }` that could silently diverge.
    const byKey = new Map(STAT_COLUMNS.map((c) => [c.key, c]));
    for (const column of pickStandingsColumns('compact')) {
      expect(column).toBe(byKey.get(column.key));
    }
  });

  it("'compact' preserves the full-set order of the columns it keeps (mp before gd)", () => {
    // 'compact' is an order-preserving filter of STAT_COLUMNS, not an arbitrary
    // reordering: mp precedes gd in the full set, so it must here too.
    expect(pickStandingsColumns('compact').map((c) => c.key)).toEqual(['mp', 'gd']);
    const mpIndex = STAT_COLUMNS.findIndex((c) => c.key === 'mp');
    const gdIndex = STAT_COLUMNS.findIndex((c) => c.key === 'gd');
    expect(mpIndex).toBeLessThan(gdIndex);
  });

  it("'compact' OMITS w/d/l/gf/ga (the columns that don't fit a 320px overlay)", () => {
    const keys = pickStandingsColumns('compact').map((c) => c.key);
    for (const dropped of ['w', 'd', 'l', 'gf', 'ga']) {
      expect(keys).not.toContain(dropped);
    }
  });

  it("'compact' keeps each surviving column's original `detail` flag (mp true, gd false)", () => {
    const detail = Object.fromEntries(
      pickStandingsColumns('compact').map((c) => [c.key, c.detail]),
    );
    expect(detail).toEqual({ mp: true, gd: false });
  });
});
