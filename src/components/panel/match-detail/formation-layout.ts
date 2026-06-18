import type { LineupPlayer } from '@/domain/types';

export interface PlacedPlayer {
  readonly player: LineupPlayer;
  /** Normalized pitch coordinate in [0,1] (0 = own goal line). */
  readonly x: number;
  /** Normalized pitch coordinate in [0,1]. */
  readonly y: number;
}

const DEFAULT_FORMATION = '4-4-2';

/** Parse "4-1-2-3" → [4,1,2,3]; returns null for garbage/empty input. */
function parseFormation(formation: string | null): readonly number[] | null {
  if (!formation) return null;
  const parts = formation
    .trim()
    .split('-')
    .map((p) => Number.parseInt(p, 10));
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  return parts;
}

/**
 * Build the per-line counts (GK first, then each outfield line) sized to exactly
 * `count` players. Falls back to the default formation, then pads/trims so every
 * player gets a slot regardless of the reported formation.
 */
function lineCounts(formation: string | null, count: number): readonly number[] {
  const outfield = count - 1; // one GK
  const parsed = parseFormation(formation) ?? parseFormation(DEFAULT_FORMATION)!;
  const lines = [1, ...parsed]; // GK line + outfield lines

  const total = lines.reduce((sum, n) => sum + n, 0);
  if (total === count) return lines;

  // Reconcile against the actual squad size so no player is dropped/duplicated.
  const reconciled = [...lines];
  let diff = count - total;
  // Adjust the last (most-forward) line first, then walk back.
  for (let i = reconciled.length - 1; i >= 1 && diff !== 0; i -= 1) {
    const next = Math.max(1, reconciled[i] + diff);
    diff -= next - reconciled[i];
    reconciled[i] = next;
  }
  if (diff > 0) reconciled.push(diff); // overflow → an extra forward line
  // Keep the GK line at one regardless.
  reconciled[0] = 1;
  void outfield;
  return reconciled;
}

/**
 * Derive normalized pitch coordinates for a starting XI from a formation string
 * + each player's `positionIndex` (lowest index = goalkeeper). Garbage/empty
 * formation falls back gracefully (no throw); all coordinates within [0,1].
 */
export function layoutFormation(
  formation: string | null,
  players: readonly LineupPlayer[],
): readonly PlacedPlayer[] {
  if (players.length === 0) return [];

  const ordered = [...players].sort((a, b) => a.positionIndex - b.positionIndex);
  const lines = lineCounts(formation, ordered.length);
  const lineCount = lines.length;

  const placed: PlacedPlayer[] = [];
  let cursor = 0;
  for (let line = 0; line < lineCount; line += 1) {
    const inLine = lines[line];
    // y: own goal line (0) at the GK, advancing toward the opponent (1).
    const y = lineCount === 1 ? 0.5 : line / (lineCount - 1);
    for (let slot = 0; slot < inLine; slot += 1) {
      const player = ordered[cursor];
      if (!player) break;
      const x = inLine === 1 ? 0.5 : (slot + 1) / (inLine + 1);
      placed.push({ player, x, y });
      cursor += 1;
    }
  }

  // Any leftover (reconciliation undershoot) gets a centred row near the top.
  while (cursor < ordered.length) {
    placed.push({ player: ordered[cursor], x: 0.5, y: 1 });
    cursor += 1;
  }

  return placed;
}
