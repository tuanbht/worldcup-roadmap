/**
 * The SHARED winner/loser resolution for a finished knockout match, extracted so
 * the radial builder's `eliminated` derivation reuses ONE rule instead of
 * re-deriving winner→loser inline [M3]. This is a NEW module (NOT an edit to
 * `build-bracket.ts`) so it never overlaps the concurrent seeding work
 * (2026-06-30-1105) that edits the knockout seeding in `build-bracket.ts`.
 *
 * ONE guarded core `decidedTeamRef`, mirroring `build-bracket.ts:decidedTeam`
 * exactly (incl. the `isResolved` guard):
 *   - the match must be `finished` with a non-null, non-draw winner,
 *   - `winnerTeamRef` → the winning side's resolved `TeamRef` (else null),
 *   - `winnerTeamId`  → that ref's `team.id` (else null) — agrees by construction,
 *   - `loserTeamId`   → the losing side's resolved team id (else null).
 *
 * Pure: never mutates the inputs.
 */
import type { BracketNode, Match, TeamRef } from '../types';
import { isResolved } from '../types';

/** The resolved variant of `TeamRef` (a placeholder is never returned by the core). */
type ResolvedTeamRef = Extract<TeamRef, { kind: 'team' }>;

/**
 * The resolved `TeamRef` of a finished child node's `winner` / `loser` side, or
 * null when the match is unfinished, drawn, or the resolved side is still a
 * placeholder. The SINGLE guarded core for the three exports below — byte-for-byte
 * the same predicate as `build-bracket.ts:decidedTeam` (incl. the `isResolved`
 * guard), so the winner rule is ONE rule and `winnerTeamRef`/`winnerTeamId` agree
 * BY CONSTRUCTION (both read `decidedTeamRef(…, 'winner')`) [H1]. The narrowed
 * return type lets the id wrappers read `.team.id` without re-asserting the guard.
 */
function decidedTeamRef(
  node: BracketNode,
  matchById: Map<string, Match>,
  which: 'winner' | 'loser',
): ResolvedTeamRef | null {
  const match = matchById.get(node.matchId);
  if (!match || match.status !== 'finished') return null;
  const w = match.score.winner;
  if (w === null || w === 'draw') return null;
  const side = which === 'winner' ? w : w === 'home' ? 'away' : 'home';
  const ref = side === 'home' ? match.home : match.away;
  return isResolved(ref) ? ref : null;
}

/**
 * The resolved WINNER `TeamRef` of a finished child node, else null — the sibling
 * of `winnerTeamId` the radial builder threads onto each match-dot / final-center
 * so the inner nodes can render the winning team's round flag. Shares the ONE
 * guarded `decidedTeamRef` core with `winnerTeamId`, so an unresolved winning side
 * → null (neutral dot / TBD) and the two exports agree by construction [H1].
 */
export function winnerTeamRef(node: BracketNode, matchById: Map<string, Match>): TeamRef | null {
  return decidedTeamRef(node, matchById, 'winner');
}

/** The resolved WINNER team id of a finished child node, else null. */
export function winnerTeamId(node: BracketNode, matchById: Map<string, Match>): string | null {
  return decidedTeamRef(node, matchById, 'winner')?.team.id ?? null;
}

/** The resolved LOSER team id of a finished child node, else null. */
export function loserTeamId(node: BracketNode, matchById: Map<string, Match>): string | null {
  return decidedTeamRef(node, matchById, 'loser')?.team.id ?? null;
}
