/**
 * The SHARED winner/loser resolution for a finished knockout match, extracted so
 * the radial builder's `eliminated` derivation reuses ONE rule instead of
 * re-deriving winner→loser inline [M3]. This is a NEW module (NOT an edit to
 * `build-bracket.ts`) so it never overlaps the concurrent seeding work
 * (2026-06-30-1105) that edits the knockout seeding in `build-bracket.ts`.
 *
 * Mirrors `build-bracket.ts:decidedTeam` exactly:
 *   - the match must be `finished` with a non-null, non-draw winner,
 *   - `winnerTeamId` → the winning side's resolved team id (else null),
 *   - `loserTeamId`  → the losing side's resolved team id (else null).
 *
 * Pure: never mutates the inputs.
 */
import type { BracketNode, Match } from '../types';
import { isResolved } from '../types';

/**
 * The resolved team id of a finished child node's `winner` / `loser` side, or
 * null when the match is unfinished, drawn, or the resolved side is still a
 * placeholder. The single source of truth for both helpers below.
 */
function decidedTeamId(
  node: BracketNode,
  matchById: Map<string, Match>,
  which: 'winner' | 'loser',
): string | null {
  const match = matchById.get(node.matchId);
  if (!match || match.status !== 'finished') return null;
  const w = match.score.winner;
  if (w === null || w === 'draw') return null;
  const side = which === 'winner' ? w : w === 'home' ? 'away' : 'home';
  const ref = side === 'home' ? match.home : match.away;
  return isResolved(ref) ? ref.team.id : null;
}

/** The resolved WINNER team id of a finished child node, else null. */
export function winnerTeamId(node: BracketNode, matchById: Map<string, Match>): string | null {
  return decidedTeamId(node, matchById, 'winner');
}

/** The resolved LOSER team id of a finished child node, else null. */
export function loserTeamId(node: BracketNode, matchById: Map<string, Match>): string | null {
  return decidedTeamId(node, matchById, 'loser');
}
