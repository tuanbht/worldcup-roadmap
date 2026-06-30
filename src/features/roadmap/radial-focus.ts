/**
 * `selectRadialTeamFocus(tournament, teamId)` → the team's INWARD path in the
 * circle view [C2]:
 *   - its R32 badge node id(s)  (`badge-<r32MatchId>-<side>`),
 *   - the R32 dot it plays      (node id === the R32 matchId),
 *   - every ancestor dot up to the Final (walking winner-tree parent links),
 *   - the `radial-<child>-<parent>` edge ids on that path,
 * and NOTHING off that path. Unknown/unresolved team → empty sets; never throws.
 *
 * Reconstructed from the winner tree + the `badge-<r32MatchId>-<side>` grammar,
 * mirroring `team-focus.ts`'s id-grammar approach. Pure; never mutates input.
 */
import type { BracketNode, Tournament } from '@/domain/types';
import { teamIdOfRef } from './team-focus';

export interface RadialTeamFocus {
  /** Badge node id(s) + dot/center node ids on the team's inward path. */
  readonly nodeIds: ReadonlySet<string>;
  /** `radial-<child>-<parent>` edge ids on the inward path. */
  readonly edgeIds: ReadonlySet<string>;
}

const EMPTY: RadialTeamFocus = { nodeIds: new Set(), edgeIds: new Set() };

/** Children = the two `winnerOf` feeders in [home, away] (slot) order. */
function winnerChildrenOf(node: BracketNode, byMatchId: Map<string, BracketNode>): BracketNode[] {
  return [node.home, node.away]
    .map((slot) => (slot.source.kind === 'winnerOf' ? slot.source.matchId : null))
    .filter((id): id is string => id !== null)
    .map((id) => byMatchId.get(id))
    .filter((n): n is BracketNode => n !== undefined);
}

/** A `childMatchId → parentBracketNode` map over the FINAL-rooted winner tree. */
function parentByChild(tournament: Tournament): Map<string, BracketNode> {
  const byMatchId = new Map<string, BracketNode>();
  let finalNode: BracketNode | undefined;
  for (const round of tournament.bracket.rounds) {
    for (const node of round.nodes) {
      byMatchId.set(node.matchId, node);
      if (node.stage === 'FINAL') finalNode = node;
    }
  }
  const parentOf = new Map<string, BracketNode>();
  if (!finalNode) return parentOf;
  const walk = (parent: BracketNode): void => {
    for (const child of winnerChildrenOf(parent, byMatchId)) {
      parentOf.set(child.matchId, parent);
      walk(child);
    }
  };
  walk(finalNode);
  return parentOf;
}

export function selectRadialTeamFocus(tournament: Tournament, teamId: string): RadialTeamFocus {
  if (!teamId) return EMPTY;
  const r32 = tournament.bracket.rounds.find((r) => r.stage === 'ROUND_OF_32');
  if (!r32) return EMPTY;

  const parentOf = parentByChild(tournament);
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const r32Node of r32.nodes) {
    const sides = (['home', 'away'] as const).filter(
      (side) => teamIdOfRef(side === 'home' ? r32Node.home.team : r32Node.away.team) === teamId,
    );
    if (sides.length === 0) continue;
    for (const side of sides) nodeIds.add(`badge-${r32Node.matchId}-${side}`);
    // The R32 dot the team plays, then climb child → parent up to the Final.
    nodeIds.add(r32Node.matchId);
    let node: BracketNode | undefined = r32Node;
    while (node) {
      const parent = parentOf.get(node.matchId);
      if (!parent) break;
      nodeIds.add(parent.matchId);
      edgeIds.add(`radial-${node.matchId}-${parent.matchId}`);
      node = parent;
    }
  }

  return { nodeIds, edgeIds };
}
