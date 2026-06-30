// Unit spec for the PURE radial "circle" layout `computeRadialBracketLayout`
// (requirement 2026-06-30-1104; plan Test Strategy 1-8 / Acceptance #1, #2, #10).
//
// The radial layout reuses the FINAL-rooted winner tree (`hierarchy(finalNode,
// winnerChildrenOf)`) for STRUCTURE only, then assigns CLOSED-CIRCLE angles +
// depth radii and maps polar→Cartesian about `(cx,cy)`. This file pins the exact
// closed-circle math the plan-review verified by hand:
//   - Final at the center (radius 0, (x,y) == (cx,cy)),
//   - 16 R32 dots equiangular at θ_dot(i) = (i+0.5)·2π/16 with NO 0/2π seam dot,
//   - each INTERNAL parent at the wrap-safe circular mean of its two children's
//     angles `atan2(sin a + sin b, cos a + cos b)` — the FINAL is EXCLUDED from
//     that generic assertion (its SF children are antipodal → atan2(0,0) is
//     ill-defined; it is pinned separately at (cx,cy), radius 0),
//   - radii strictly DECREASING by depth (R32 > R16 > QF > SF > FINAL == 0),
//   - x = cx + r·sin(θ), y = cy − r·cos(θ),
//   - pure / deterministic / tolerates a frozen input / config translates+scales.
//
// Counts/structure are FIXTURE-DERIVED from the validated mock tournament, never
// hardcoded. The layout is rebuilt INSIDE each test so an unimplemented engine
// fails each assertion individually as "not implemented" (the right RED reason),
// not as an import/typo error.
import { describe, expect, it } from 'vitest';
import {
  computeRadialBracketLayout,
  type RadialLayout,
  type RadialNodePos,
} from './radial-bracket-layout';
import { RADIAL_CX, RADIAL_CY, RING_RADII } from './radial-constants';
import {
  bracketNodeById,
  deepFreeze,
  finalBracketNode,
  loadTournament,
  r32Nodes,
  thirdPlaceBracketNode,
  winnerChildren,
  winnerTreeNodes,
} from '../__test-support__/roadmap-fixtures';
import type { Tournament } from '@/domain/types';

const tournament = loadTournament();
const treeNodes = winnerTreeNodes(tournament); // 31, THIRD_PLACE excluded
const r32 = r32Nodes(tournament); // 16
const byId = bracketNodeById(tournament);
const finalNode = finalBracketNode(tournament);
const thirdNode = thirdPlaceBracketNode(tournament);

const TAU = 2 * Math.PI;
const SECTOR = TAU / 16; // s — the per-R32-sector angular width

/** Internal (winner-tree) nodes the circular-mean rule applies to, EXCLUDING the
 *  FINAL (antipodal children → atan2(0,0) is ill-defined; pinned separately). */
const internalNonFinal = treeNodes.filter(
  (n) => n.stage !== 'FINAL' && winnerChildren(n, byId).length === 2,
);

/** Stages ordered Final(depth 0) → R32(depth 4), for the monotonic-radius test. */
const STAGE_BY_DEPTH = ['FINAL', 'SEMI_FINALS', 'QUARTER_FINALS', 'ROUND_OF_16', 'ROUND_OF_32'];

/** The full layout (center + node map). */
function fullLayout(): RadialLayout {
  return computeRadialBracketLayout(tournament);
}

/** Just the node-position map — the surface most assertions read. */
function layout(): ReadonlyMap<string, RadialNodePos> {
  return fullLayout().nodes;
}

function pos(map: ReadonlyMap<string, RadialNodePos>, matchId: string): RadialNodePos {
  const p = map.get(matchId);
  expect(p, `expected a radial position for ${matchId}`).toBeDefined();
  return p!;
}

/** Wrap an angle into [0,2π). */
function norm(a: number): number {
  const m = a % TAU;
  return m < 0 ? m + TAU : m;
}

/** Shortest signed angular delta b−a in (−π,π] — direction-aware, seam-safe. */
function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/**
 * Shared float tolerance for the closed-circle math. `1e-9` is tight enough to
 * catch a real angle/radius error (an off-by-`+0.5` sector, a `(a+b)/2` instead
 * of the circular mean, a missing seam offset) yet survives IEEE-754 rounding in
 * `sin`/`cos`/`atan2`. Do NOT loosen this to paper over a discrepancy.
 */
const EPS_DIGITS = 9;

/** Assert two angles are equal within EPS, with a descriptive failure message. */
function expectAngleClose(actual: number, expected: number, label: string): void {
  expect(actual, label).toBeCloseTo(expected, EPS_DIGITS);
}

describe('computeRadialBracketLayout — coverage [Test 1]', () => {
  it('positions every winner-tree node (31: R32 16 + R16 8 + QF 4 + SF 2 + FINAL 1); THIRD_PLACE ABSENT', () => {
    const map = layout();
    expect(treeNodes.length).toBe(31); // fixture self-check
    expect(map.size).toBe(31);
    for (const n of treeNodes) expect(map.has(n.matchId)).toBe(true);
    // The 3rd-place node (a `loserOf` node) is NOT in the winner tree → no position.
    expect(map.has(thirdNode.matchId)).toBe(false);
  });
});

describe('computeRadialBracketLayout — Final at the center [Test 2 / Acceptance #1]', () => {
  it('sits the Final at radius 0 and exactly (cx,cy)', () => {
    const map = layout();
    const final = pos(map, finalNode.matchId);
    expect(final.depth).toBe(0);
    expect(final.radius).toBe(0);
    expect(final.x).toBeCloseTo(RADIAL_CX, 9);
    expect(final.y).toBeCloseTo(RADIAL_CY, 9);
  });
});

describe('computeRadialBracketLayout — monotonic radii by depth [Test 3 / Acceptance #1]', () => {
  it('keeps radius(R32) > radius(R16) > radius(QF) > radius(SF) > radius(FINAL) === 0', () => {
    const map = layout();
    // One representative radius per depth, read off the layout (not the constants).
    const radiusAtDepth = (stage: string): number => {
      const node = tournament.bracket.rounds.find((r) => r.stage === stage)!.nodes[0];
      return pos(map, node.matchId).radius;
    };
    const radii = STAGE_BY_DEPTH.map(radiusAtDepth); // [FINAL, SF, QF, R16, R32]
    expect(radii[0]).toBe(0); // FINAL at the center
    // Strictly increasing OUTWARD from Final(0) to R32(4) == strictly decreasing inward.
    for (let d = 1; d < radii.length; d += 1) {
      expect(radii[d], `radius must grow outward at depth ${d}`).toBeGreaterThan(radii[d - 1]);
    }
    // Every node's radius equals RING_RADII at its depth (depth→ring mapping).
    for (const p of map.values()) {
      expect(p.radius).toBeCloseTo(RING_RADII[p.depth], 9);
    }
  });
});

describe('computeRadialBracketLayout — wrap-safe parent midpoint [Test 4 / Acceptance #2]', () => {
  it("sets each INTERNAL (non-Final) parent's angle to the circular mean of its children's angles", () => {
    const map = layout();
    // R16(8) + QF(4) + SF(2) = 14 internal non-Final parents, fixture-derived.
    expect(internalNonFinal.length).toBe(14);
    for (const parent of internalNonFinal) {
      const [a, b] = winnerChildren(parent, byId).map((c) => pos(map, c.matchId).angle);
      const expected = norm(Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b)));
      const actual = pos(map, parent.matchId).angle;
      expectAngleClose(actual, expected, `${parent.matchId} circular-mean angle`);
      // Sanity beyond echoing the formula: the parent bisects the SHORTER arc, so
      // it is equidistant from each child and never coincides with a child (which
      // a naive `(a+b)/2` or a "return first child" bug would violate). Both
      // children are a strictly non-zero, equal shortest-arc distance away.
      const toA = Math.abs(angleDelta(actual, a));
      const toB = Math.abs(angleDelta(actual, b));
      expectAngleClose(toA, toB, `${parent.matchId} equidistant from its children`);
      expect(toA, `${parent.matchId} parent must not sit on a child`).toBeGreaterThan(1e-6);
    }
  });

  it('EXCLUDES the Final from the generic circular mean: its SF children are antipodal (≈π apart)', () => {
    // The two SF dots sit at 4s and 12s — exactly π apart — so the generic
    // `atan2(sin+,cos+)` degenerates to atan2(0,0). The Final's angle is therefore
    // a convention; its POSITION is pinned by radius 0 instead (asserted in Test 2).
    const map = layout();
    const [sfA, sfB] = winnerChildren(finalNode, byId).map((c) => pos(map, c.matchId).angle);
    const delta = Math.abs(norm(sfA) - norm(sfB));
    const arc = Math.min(delta, TAU - delta);
    expect(arc, "the Final's SF children are antipodal").toBeCloseTo(Math.PI, 6);
  });
});

describe('computeRadialBracketLayout — equiangular R32 dots [Test 5 / Acceptance #10]', () => {
  it('places the 16 R32 dots at θ_dot(i) = (i+0.5)·2π/16 with no 0/2π seam dot', () => {
    const map = layout();
    const dots = r32.map((n) => pos(map, n.matchId));
    expect(dots).toHaveLength(16);

    // Each dot carries a leafIndex; the 16 indices are an EXACT permutation of
    // {0..15} (catches a duplicate / missing / off-by-one leaf order), and each
    // dot's angle is exactly (leafIndex + 0.5)·s.
    const leafIndices = dots.map((d) => {
      expect(d.leafIndex, 'an R32 dot must carry a 0..15 leaf index').not.toBeNull();
      return d.leafIndex!;
    });
    expect([...leafIndices].sort((p, q) => p - q)).toEqual([...Array(16).keys()]);
    for (const d of dots) {
      expectAngleClose(d.angle, (d.leafIndex! + 0.5) * SECTOR, `R32 dot leaf ${d.leafIndex}`);
    }

    // The SORTED angle sequence is exactly the canonical closed-circle ring:
    // [0.5·s, 1.5·s, … 15.5·s] — full sequence, not just consecutive deltas. This
    // pins both the equiangular spacing AND the half-sector seam offset at once.
    const sorted = [...dots.map((d) => d.angle)].sort((p, q) => p - q);
    const canonical = Array.from({ length: 16 }, (_, i) => (i + 0.5) * SECTOR);
    sorted.forEach((angle, i) => expectAngleClose(angle, canonical[i], `sorted dot #${i}`));

    // Equiangular: consecutive Δθ is exactly the sector width 2π/16, all distinct.
    expect(new Set(sorted.map((a) => a.toFixed(EPS_DIGITS))).size).toBe(16);
    for (let i = 1; i < sorted.length; i += 1) {
      expectAngleClose(sorted[i] - sorted[i - 1], SECTOR, `gap #${i}`);
    }

    // NO dot lands on the 0/2π SEAM, and the seam itself is a full sector wide:
    // the first dot is half a sector past 0, the last half a sector before 2π,
    // and the wrap gap (2π − max + min) is also exactly one sector — so a 17th
    // "phantom" dot would be required to double up at 0 (the bug C1 prevents).
    expect(sorted[0]).toBeGreaterThan(0);
    expectAngleClose(sorted[0], 0.5 * SECTOR, 'first dot half a sector off the seam');
    const maxAngle = sorted[sorted.length - 1];
    expect(maxAngle).toBeLessThan(TAU);
    expectAngleClose(maxAngle, TAU - 0.5 * SECTOR, 'last dot half a sector before 2π');
    const wrapGap = TAU - maxAngle + sorted[0];
    expectAngleClose(wrapGap, SECTOR, 'the 0/2π seam gap is a full sector (no double-up)');
  });
});

describe('computeRadialBracketLayout — polar→Cartesian identity [Test 6 / Acceptance #10]', () => {
  it('maps every node by x = cx + r·sin(θ), y = cy − r·cos(θ)', () => {
    const map = layout();
    expect(map.size).toBeGreaterThan(0); // guard: the loop is not vacuous
    for (const p of map.values()) {
      expect(p.x).toBeCloseTo(RADIAL_CX + p.radius * Math.sin(p.angle), EPS_DIGITS);
      expect(p.y).toBeCloseTo(RADIAL_CY - p.radius * Math.cos(p.angle), EPS_DIGITS);
    }
  });
});

describe('computeRadialBracketLayout — purity / determinism [Test 7]', () => {
  const snap = (m: RadialLayout) => [...m.nodes.entries()].sort(([x], [y]) => x.localeCompare(y));

  it('produces structurally-equal maps across calls and tolerates a frozen tournament', () => {
    const frozen = deepFreeze(loadTournament());
    // No throw on a deeply-frozen input PROVES the layout never mutates it.
    const a = computeRadialBracketLayout(frozen);
    const b = computeRadialBracketLayout(frozen);
    expect(snap(a)).toEqual(snap(b));
  });

  it('is deterministic across two independently-parsed tournaments (no hidden state)', () => {
    // Two separate fixture loads → identical layout: the result depends ONLY on
    // the input, not on call order or any module-level cache.
    const a = computeRadialBracketLayout(loadTournament());
    const b = computeRadialBracketLayout(loadTournament());
    expect(snap(a)).toEqual(snap(b));
  });
});

describe('computeRadialBracketLayout — custom config [Test 8]', () => {
  it('translates positions by a custom (cx,cy) without changing angles/radii', () => {
    const base = fullLayout();
    const dx = 1000;
    const dy = 500;
    const shifted = computeRadialBracketLayout(tournament, {
      cx: RADIAL_CX + dx,
      cy: RADIAL_CY + dy,
    });
    for (const [id, p] of base.nodes) {
      const s = shifted.nodes.get(id)!;
      expect(s.angle).toBeCloseTo(p.angle, 9);
      expect(s.radius).toBeCloseTo(p.radius, 9);
      expect(s.x).toBeCloseTo(p.x + dx, 9);
      expect(s.y).toBeCloseTo(p.y + dy, 9);
    }
    expect(shifted.center).toEqual({ x: RADIAL_CX + dx, y: RADIAL_CY + dy });
  });

  it('scales positions by a custom ringRadii (depth radii) deterministically', () => {
    const custom = RING_RADII.map((r) => r * 2);
    const scaled = computeRadialBracketLayout(tournament, { ringRadii: custom });
    const base = fullLayout();
    for (const [id, p] of base.nodes) {
      const s = scaled.nodes.get(id)!;
      // Same depth → same angle; radius is the custom ring for that depth.
      expect(s.angle).toBeCloseTo(p.angle, 9);
      expect(s.radius).toBeCloseTo(custom[p.depth], 9);
    }
  });
});

describe('computeRadialBracketLayout — missing-FINAL invariant [validation]', () => {
  it('throws when the bracket has no FINAL round (mirrors bracket-layout.ts)', () => {
    // The layout is rooted at the FINAL; a bracket without it is malformed. The
    // plan pins this as a thrown Error (NOT a silent empty map / NaN positions),
    // matching the `bracket invariant: FINAL round missing` guard.
    const base = loadTournament();
    const withoutFinal: Tournament = {
      ...base,
      bracket: {
        ...base.bracket,
        rounds: base.bracket.rounds.filter((r) => r.stage !== 'FINAL'),
      },
    };
    expect(() => computeRadialBracketLayout(withoutFinal)).toThrow(/FINAL/i);
  });
});
