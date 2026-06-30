/**
 * Pure, O(n) radial layout of the FINAL-rooted winner tree (the "circle" view).
 *
 * The radial layout reuses the same FINAL-rooted winner tree
 * `hierarchy(finalNode, winnerChildrenOf)` that `bracket-layout.ts` walks — for
 * STRUCTURE (parent/child + depth) and LEAF ORDER only. We do NOT take the angle
 * from d3's raw `x` (its inclusive `[0,2π]` distribution overlaps the 0/2π seam);
 * instead we assign CLOSED-CIRCLE angles explicitly:
 *
 *   - R32 dot angle (leaves), `i` = 0-based leaf order, `n = 16`:
 *       θ_dot(i) = (i + 0.5)·(2π/16)
 *     The `+0.5` centers each dot in its 1/16 sector, so the 16 dots are
 *     equiangular at exactly 2π/16 with NO leaf on the 0/2π seam.
 *   - Internal parent angle = wrap-safe circular mean of its two children's
 *     CORRECTED angles: `atan2(sin a + sin b, cos a + cos b)` normalized to
 *     [0,2π). The angular midpoint of the shorter arc — correct even across the
 *     seam. Computed bottom-up so each parent reads already-assigned children.
 *   - The FINAL is special-cased: its two SF children sit at 4s and 12s — exactly
 *     π apart (antipodal) — so the generic circular mean degenerates to
 *     `atan2(0,0)`. We therefore set the Final's angle BY CONVENTION (0). This is
 *     harmless: the Final is at radius 0, so its angle has no positional effect
 *     (`x = cx + 0·sin θ = cx` for any θ).
 *   - Radius by depth: r(d) = RING_RADII[depth], RING_RADII[0] = 0 (Final at
 *     center), strictly increasing outward → concentric rings.
 *   - Cartesian: x = cx + r·sin(θ), y = cy − r·cos(θ) (θ=0 points up; clockwise).
 *
 * THIRD_PLACE (a `loserOf` node) is unreachable from the FINAL via `winnerOf`
 * links, so `hierarchy` excludes it automatically — the circle view omits it.
 *
 * Pure; O(n) over the 31 winner-tree nodes; deterministic; never mutates input.
 */
import { hierarchy } from 'd3-hierarchy';
import type { BracketNode, Tournament } from '@/domain/types';
import type { XY } from './layout-constants';
import { RADIAL_CX, RADIAL_CY, RING_RADII } from './radial-constants';

export interface RadialNodePos {
  readonly matchId: string;
  /** 0 = Final … 4 = R32. */
  readonly depth: number;
  /** θ in [0,2π) — closed-circle, NOT raw d3 x. */
  readonly angle: number;
  /** RING_RADII[depth]. */
  readonly radius: number;
  /** cx + radius·sin(angle). */
  readonly x: number;
  /** cy − radius·cos(angle). */
  readonly y: number;
  readonly parentMatchId: string | null;
  /** R32 leaf order (0..15); null for internal nodes. */
  readonly leafIndex: number | null;
}

export interface RadialLayout {
  readonly center: XY;
  /** Winner-tree KO matches only (31 nodes); THIRD_PLACE absent. */
  readonly nodes: ReadonlyMap<string, RadialNodePos>;
}

export interface RadialLayoutConfig {
  readonly cx?: number;
  readonly cy?: number;
  readonly ringRadii?: readonly number[];
}

const TAU = 2 * Math.PI;
/** The per-R32-leaf sector width: 16 equal sectors over the full circle. */
const SECTOR = TAU / 16;

/** Children = the two `winnerOf` feeders in [home, away] (slot) order. */
function winnerChildrenOf(node: BracketNode, byMatchId: Map<string, BracketNode>): BracketNode[] {
  return [node.home, node.away]
    .map((slot) => (slot.source.kind === 'winnerOf' ? slot.source.matchId : null))
    .filter((id): id is string => id !== null)
    .map((id) => byMatchId.get(id))
    .filter((n): n is BracketNode => n !== undefined);
}

/** Wrap an angle into [0,2π). */
function normalize(angle: number): number {
  const m = angle % TAU;
  return m < 0 ? m + TAU : m;
}

/** Wrap-safe circular mean (angular midpoint of the shorter arc) of two angles. */
function circularMean(a: number, b: number): number {
  return normalize(Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b)));
}

/** A d3-hierarchy node over BracketNode (the structure the radial layout reuses). */
type TreeNode = ReturnType<typeof hierarchy<BracketNode>>;

/**
 * Assign a closed-circle angle to every node, bottom-up.
 *   - leaves (R32): θ_dot(i) by leaf order,
 *   - internal non-root parents: circular mean of their children's angles,
 *   - the FINAL root (depth 0): 0 by convention (antipodal children; r=0).
 */
function assignAngles(root: TreeNode): Map<string, number> {
  const angleByMatchId = new Map<string, number>();
  const leaves = root.leaves();
  leaves.forEach((leaf, index) => {
    angleByMatchId.set(leaf.data.matchId, (index + 0.5) * SECTOR);
  });

  // Post-order so every node's children are angled before it is. The FINAL is
  // the post-order root → its (degenerate) generic mean is overridden to 0.
  for (const node of root.descendants().reverse()) {
    if (node.children === undefined) continue; // leaf — already angled
    if (node.depth === 0) {
      angleByMatchId.set(node.data.matchId, 0); // FINAL: convention; r=0 anyway
      continue;
    }
    const childAngles = node.children.map((c) => angleByMatchId.get(c.data.matchId) ?? 0);
    angleByMatchId.set(node.data.matchId, circularMean(childAngles[0], childAngles[1]));
  }
  return angleByMatchId;
}

/**
 * Lay the FINAL-rooted winner tree out radially. See the file header for the
 * closed-circle math. Pure / O(n) / deterministic; tolerates a frozen input.
 */
export function computeRadialBracketLayout(
  tournament: Tournament,
  config: RadialLayoutConfig = {},
): RadialLayout {
  const cx = config.cx ?? RADIAL_CX;
  const cy = config.cy ?? RADIAL_CY;
  const ringRadii = config.ringRadii ?? RING_RADII;

  const byMatchId = new Map<string, BracketNode>();
  let finalNode: BracketNode | undefined;
  for (const round of tournament.bracket.rounds) {
    for (const node of round.nodes) {
      byMatchId.set(node.matchId, node);
      if (node.stage === 'FINAL') finalNode = node;
    }
  }
  if (!finalNode) throw new Error('bracket invariant: FINAL round missing');

  const root = hierarchy<BracketNode>(finalNode, (n) => winnerChildrenOf(n, byMatchId));
  const angleByMatchId = assignAngles(root);
  // Leaf order index, for the R32 dots (null for every internal node).
  const leafIndexByMatchId = new Map<string, number>();
  root.leaves().forEach((leaf, index) => leafIndexByMatchId.set(leaf.data.matchId, index));

  const nodes = new Map<string, RadialNodePos>();
  for (const node of root.descendants()) {
    const matchId = node.data.matchId;
    const depth = node.depth;
    const angle = angleByMatchId.get(matchId) ?? 0;
    const radius = ringRadii[depth] ?? 0;
    nodes.set(matchId, {
      matchId,
      depth,
      angle,
      radius,
      x: cx + radius * Math.sin(angle),
      y: cy - radius * Math.cos(angle),
      parentMatchId: node.parent?.data.matchId ?? null,
      leafIndex: leafIndexByMatchId.get(matchId) ?? null,
    });
  }

  return { center: { x: cx, y: cy }, nodes };
}
