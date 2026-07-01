/**
 * Pure lane derivation for the matrix "journey-lanes" view
 * (2026-07-01-1030-matrix-journey-lanes-view). The ONE source of truth for the
 * per-team journey, the edge-id grammar, and the per-team hue, shared by
 * `buildMatrixGraph` + the specs so they can never drift.
 *
 *   - `teamLanes(tournament)`: for each RESOLVED team, its matches (resolved
 *     home/away membership ONLY — a placeholder side never attributes a lane)
 *     sorted by kickoff ascending, tiebreak id — the team's chronological journey.
 *   - `laneEdgeId(teamId, src, dst)`: the `lane-<teamId>-<src>-<dst>` grammar.
 *   - `teamHue(teamId)`: a stable, total per-team hue (oklch string) derived
 *     deterministically from the team id.
 *
 * Pure / immutable: never mutates the input tournament (tolerates a frozen input).
 */
import type { Match, Tournament } from '@/domain/types';
import { matchInvolvesTeam, teamIdOfRef } from './team-focus';

/** Canonical lane-edge id: `lane-<teamId>-<srcMatchId>-<dstMatchId>`. */
export function laneEdgeId(teamId: string, srcMatchId: string, dstMatchId: string): string {
  return `lane-${teamId}-${srcMatchId}-${dstMatchId}`;
}

/**
 * kickoff ascending then id — a team's chronological journey order (mirrors the
 * grid's `bySlotOrder`). A stable, total comparator over two matches.
 */
function byKickoffThenId(a: Match, b: Match): number {
  return a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id);
}

/**
 * Map each RESOLVED team id → its matches in chronological (kickoff-then-id) order.
 * Only resolved home/away membership counts (`matchInvolvesTeam`), so a placeholder
 * KO slot never attributes a phantom lane to a not-yet-known team. A team that
 * plays no resolved match gets no entry. Immutable: builds fresh arrays.
 */
export function teamLanes(tournament: Tournament): Map<string, Match[]> {
  const lanes = new Map<string, Match[]>();
  for (const match of tournament.matches) {
    for (const ref of [match.home, match.away]) {
      const teamId = teamIdOfRef(ref);
      if (teamId === null) continue;
      const existing = lanes.get(teamId);
      // Guard the "team on both sides" degenerate: a team resolved on both sides
      // of one match still lists that match once.
      if (existing) {
        if (!existing.includes(match)) existing.push(match);
      } else {
        lanes.set(teamId, [match]);
      }
    }
  }
  for (const matches of lanes.values()) matches.sort(byKickoffThenId);
  return lanes;
}

/** FNV-1a 32-bit hash of a string — stable, fast, no crypto. */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Fold to an unsigned 32-bit int.
  return hash >>> 0;
}

/**
 * A stable, total per-team hue string (oklch). Derived deterministically from the
 * team id so a team's whole lane is one color, stable across renders and builds,
 * and distinct teams read as distinct lanes on the dark canvas. Vivid + legible:
 * fixed lightness/chroma, hue spread over the full wheel by the id hash.
 */
export function teamHue(teamId: string): string {
  const hue = hashString(teamId) % 360;
  return `oklch(72% 0.17 ${hue})`;
}
