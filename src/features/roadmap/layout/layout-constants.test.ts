// Pure geometry-constant contract for the group-view alignment fix + standings
// band growth. These pin the RELATIONS the plan makes load-bearing (Data Model /
// Types; Acceptance #1, #3) without freezing the exact tuning px:
//
//   item 1 — DAY_MARKER_H === NODE_H   (the marker centering box is one card tall)
//   item 2 — HEADER_H === HEADER_TOP + GROUP_TABLE_H + HEADER_GAP, and grew > 96
//            so the always-on standings table fits in [HEADER_TOP, HEADER_H).
//
// `CX` / `centerline(12)` must be UNCHANGED by the header growth (the funnel
// centerline is independent of the vertical band), so a sibling assertion locks
// `centerline(12) === CX` and that both stay `RAIL_W + 6 * GROUP_COL_PITCH`.
//
// RED until layout-constants.ts adds DAY_MARKER_H and derives HEADER_H from
// HEADER_TOP/GROUP_TABLE_H/HEADER_GAP (today HEADER_H is a flat `96` and the new
// tokens do not exist, so the named imports fail to resolve / are undefined).
import { describe, expect, it } from 'vitest';
import {
  CX,
  centerline,
  DAY_MARKER_H,
  GROUP_COL_PITCH,
  GROUP_TABLE_H,
  HEADER_GAP,
  HEADER_H,
  HEADER_TOP,
  NODE_H,
  RAIL_W,
} from './layout-constants';

describe('layout-constants — day-marker centering box [item 1, Acceptance #1]', () => {
  it('DAY_MARKER_H equals one card height (NODE_H) so the pill centers on the row', () => {
    // The renderer wraps the pill in a DAY_MARKER_H-tall flex-center box; making
    // that box exactly one card tall is what puts the pill on the card centerline.
    expect(DAY_MARKER_H).toBe(NODE_H);
  });
});

describe('layout-constants — header band growth [item 2, Acceptance #3]', () => {
  it('derives HEADER_H from its three sub-bands (top pill + table + gap), not a literal', () => {
    expect(HEADER_H).toBe(HEADER_TOP + GROUP_TABLE_H + HEADER_GAP);
  });

  it('grew the header band beyond the old flat 96 so the standings table fits above row 0', () => {
    expect(HEADER_H).toBeGreaterThan(96);
  });

  it('reserves a positive, ordered band: 0 < HEADER_TOP < HEADER_TOP+GROUP_TABLE_H < HEADER_H', () => {
    expect(HEADER_TOP).toBeGreaterThan(0);
    expect(GROUP_TABLE_H).toBeGreaterThan(0);
    expect(HEADER_GAP).toBeGreaterThanOrEqual(0);
    // The standings band [HEADER_TOP, HEADER_TOP+GROUP_TABLE_H) sits strictly
    // inside the header band, with clear air (HEADER_GAP) before row 0.
    expect(HEADER_TOP + GROUP_TABLE_H).toBeLessThanOrEqual(HEADER_H);
  });
});

describe('layout-constants — funnel centerline unchanged by the growth [Rev2:M1]', () => {
  it('keeps centerline(12) === CX === RAIL_W + 6*GROUP_COL_PITCH (one source of truth)', () => {
    expect(centerline(12)).toBe(CX);
    expect(CX).toBe(RAIL_W + 6 * GROUP_COL_PITCH);
  });
});
