/**
 * Pure geometry for the matrix "journey-lanes" subway layout
 * (2026-07-01-1030-matrix-journey-lanes-view) — NO React Flow. Positions every
 * match at `(columnX, slotY)`: the COLUMN (x) is the match's chronological
 * stage-band (Group MD1 … Final band, monotonic left → right); the SLOT (y) is a
 * deterministic, crossing-LIMITING order within the column.
 *
 * Slot ordering (a reasonable ordering that limits crossings — optimal
 * crossing-minimization is explicitly OUT of scope for v1):
 *   - Group columns (0,1,2): group letter A..L, then in-group pairing order
 *     (kickoff-then-id) — each group keeps a contiguous vertical band across all
 *     three group matchdays so group lanes read near-horizontal.
 *   - KO columns (3..6): `BracketNode.slotIndex` (the round's 0-based top→bottom
 *     bracket position) so a surviving team funnels smoothly toward center.
 *   - Final band (col 7): THIRD_PLACE at slot 0, FINAL at slot 1 (fixed).
 *
 * Each column is packed top-down by its slot index and vertically centered against
 * the tallest (group) column, so the short KO columns converge on center — the
 * classic bracket funnel.
 *
 * Pure / immutable: never mutates the input tournament (tolerates a frozen input);
 * deterministic across calls.
 */
import type { BracketNode, Match, Stage, Tournament } from '@/domain/types';
import {
  MATRIX_ORIGIN_Y,
  MATRIX_SLOT_PITCH,
  MATRIX_STAGE_COLUMNS,
  matrixColumnX,
} from './matrix-constants';

/** The layout position of one match station in the matrix grid. */
export interface MatrixNodePos {
  readonly matchId: string;
  readonly stage: Stage;
  /** 0-based chronological column (Group MD1 = 0 … Final band = 7). */
  readonly col: number;
  /** 0-based slot within the column (top → bottom). */
  readonly slot: number;
  /** Absolute canvas coordinates (station CENTER). */
  readonly x: number;
  readonly y: number;
}

/** The 0-based column index a match lands in, or null if no column matches. */
function columnIndexOf(match: Match): number | null {
  for (const column of MATRIX_STAGE_COLUMNS) {
    if (!column.stages.includes(match.stage)) continue;
    // Group columns are narrowed by matchday; KO columns ignore matchday.
    if (column.matchday !== null && column.matchday !== match.matchday) continue;
    return column.colIndex;
  }
  return null;
}

/** kickoff ascending then id — stable within a group/matchday band. */
function byKickoffThenId(a: Match, b: Match): number {
  return a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id);
}

/**
 * The intra-column ORDER KEY of a match: lower sorts higher (nearer slot 0). Group
 * columns key on `(groupLetter, kickoff, id)`; KO columns key on the bracket
 * `slotIndex`; the final band keys THIRD_PLACE(0) before FINAL(1).
 */
function orderKeyOf(match: Match, slotIndexByMatchId: Map<string, number>): string {
  if (match.stage === 'GROUP_STAGE') {
    const group = match.group ?? '';
    return `${group}|${match.kickoff}|${match.id}`;
  }
  if (match.stage === 'THIRD_PLACE') return '0';
  if (match.stage === 'FINAL') return '1';
  // KO round → pad the bracket slot index so lexical sort matches numeric order.
  const slot = slotIndexByMatchId.get(match.id) ?? 0;
  return String(slot).padStart(4, '0');
}

/** Map every knockout matchId → its `BracketNode.slotIndex`. */
function bracketSlotIndex(tournament: Tournament): Map<string, number> {
  const byMatchId = new Map<string, number>();
  for (const round of tournament.bracket.rounds) {
    for (const node of round.nodes as readonly BracketNode[]) {
      byMatchId.set(node.matchId, node.slotIndex);
    }
  }
  return byMatchId;
}

export function computeMatrixLayout(tournament: Tournament): Map<string, MatrixNodePos> {
  const slotIndexByMatchId = bracketSlotIndex(tournament);

  // Bucket matches into their columns (skip any match with no column band).
  const byColumn = new Map<number, Match[]>();
  for (const match of tournament.matches) {
    const col = columnIndexOf(match);
    if (col === null) continue;
    const bucket = byColumn.get(col) ?? [];
    bucket.push(match);
    byColumn.set(col, bucket);
  }

  // The tallest column drives the shared vertical center (bracket funnel).
  let maxSlots = 0;
  for (const bucket of byColumn.values()) maxSlots = Math.max(maxSlots, bucket.length);

  const layout = new Map<string, MatrixNodePos>();
  for (const [col, bucket] of byColumn) {
    // Deterministic intra-column order via the composite key.
    const ordered = [...bucket].sort((a, b) => {
      const ka = orderKeyOf(a, slotIndexByMatchId);
      const kb = orderKeyOf(b, slotIndexByMatchId);
      return ka < kb ? -1 : ka > kb ? 1 : byKickoffThenId(a, b);
    });
    // Center this column's stack against the tallest column.
    const centerOffset = ((maxSlots - ordered.length) / 2) * MATRIX_SLOT_PITCH;
    const x = matrixColumnX(col);
    ordered.forEach((match, slot) => {
      layout.set(match.id, {
        matchId: match.id,
        stage: match.stage,
        col,
        slot,
        x,
        y: MATRIX_ORIGIN_Y + centerOffset + slot * MATRIX_SLOT_PITCH,
      });
    });
  }

  return layout;
}
