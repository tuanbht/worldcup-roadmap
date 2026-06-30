/**
 * Shared, deterministic test fixtures + derivation helpers for the continuous
 * per-match canvas specs (group-layout / bracket-layout / build-graph).
 *
 * Everything here is FIXTURE-DERIVED, never hardcoded: counts and structural
 * relations come straight off the validated mock tournament, so the specs stay
 * honest if the fixture changes. Kept out of `coverage.include` (test support,
 * not production geometry).
 */
import { buildMockTournament } from '@/data/providers/mock/build-mock-tournament';
import { parseTournament } from '@/data/schema/tournament-schema';
import { buildBracket } from '@/domain/bracket/build-bracket';
import { R32_SEEDING } from '@/domain/bracket/seeding';
import type { Bracket, BracketNode, BracketSlot, Match, Tournament } from '@/domain/types';

/** Fixed clock so every derived kickoff/order is reproducible across runs. */
export const FIXTURE_AT = '2026-06-17T00:00:00Z';

/**
 * A freshly parsed + validated mock tournament. Re-parsed per call so no test
 * shares mutable state — isolation by construction.
 */
export function loadTournament(): Tournament {
  return parseTournament(buildMockTournament(FIXTURE_AT));
}

/** The complete synthetic bracket topology (16->8->4->2->1 + 3rd place). */
export function loadBracket(): Bracket {
  return buildBracket([]);
}

/** Every group-stage `Match`, in fixture order. */
export function groupStageMatches(t: Tournament): Match[] {
  return t.matches.filter((m) => m.stage === 'GROUP_STAGE');
}

/** Flatten all bracket nodes (every round, including THIRD_PLACE). */
export function allBracketNodes(bracket: Bracket): BracketNode[] {
  return bracket.rounds.flatMap((r) => r.nodes);
}

/** Group names in canonical A..L lane order. */
export function groupNames(t: Tournament): string[] {
  return t.groups.map((g) => g.name);
}

/** Match a group letter as a winner/runner-up R32 seed label ("1A" / "2A"). */
function seedFeedsGroup(label: string, group: string): boolean {
  return label === `1${group}` || label === `2${group}`;
}

/**
 * Feeder edges = one per (group, R32 slot) pair the group seeds. Derived from
 * `R32_SEEDING` exactly as `build-graph` must wire them.
 */
export function expectedFeederCount(t: Tournament): number {
  const r32 = t.bracket.rounds.find((r) => r.stage === 'ROUND_OF_32');
  if (!r32) throw new Error('fixture invariant: ROUND_OF_32 round missing');
  let total = 0;
  for (const group of t.groups) {
    r32.nodes.forEach((_node, slot) => {
      const pair = R32_SEEDING[slot];
      if (seedFeedsGroup(pair.home, group.name) || seedFeedsGroup(pair.away, group.name)) {
        total += 1;
      }
    });
  }
  return total;
}

/** Advance edges = one per non-group bracket slot (child -> parent). */
export function expectedAdvanceEdgeCount(t: Tournament): number {
  return allBracketNodes(t.bracket).reduce(
    (count, node) => count + [node.home, node.away].filter((s) => s.source.kind !== 'group').length,
    0,
  );
}

// --- Timeline-grid derivation helpers ---------------------------------------

/** UTC calendar-day key of an ISO instant; lexically == chronologically sortable. */
export function fixtureDayKey(iso: string): string {
  return iso.slice(0, 10); // 'yyyy-MM-dd' (mock kickoffs are UTC ISO)
}

/** Distinct match-days across the WHOLE tournament (group + KO), ascending. */
export function distinctMatchDays(t: Tournament): string[] {
  return [...new Set(t.matches.map((m) => fixtureDayKey(m.kickoff)))].sort();
}

/** A populated (group, day) cell: a group's matches on one calendar day. */
export interface GroupDayCell {
  readonly group: string;
  readonly day: string;
  /** The matches in that cell, ordered by kickoff then matchId (slot order). */
  readonly matches: Match[];
}

/** kickoff ascending then id — the same pair order the grid uses for sub-slots. */
function bySlotOrder(a: Match, b: Match): number {
  return a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id);
}

/**
 * Every populated (group, day) cell, sorted within each cell by slot order.
 * In the mock every group has exactly three 2-match cells (MD1/MD2/MD3 pairs).
 */
export function groupDayCells(t: Tournament): GroupDayCell[] {
  const byKey = new Map<string, Match[]>();
  for (const m of t.matches) {
    if (m.stage !== 'GROUP_STAGE' || m.group === null) continue;
    const key = `${m.group}|${fixtureDayKey(m.kickoff)}`;
    const arr = byKey.get(key) ?? [];
    arr.push(m);
    byKey.set(key, arr);
  }
  return [...byKey.entries()]
    .map(([key, matches]) => {
      const [group, day] = key.split('|');
      return { group, day, matches: [...matches].sort(bySlotOrder) };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.day.localeCompare(b.day));
}

/** Just the (group, day) cells that hold exactly two matches (the paired cells). */
export function groupTwoMatchCells(t: Tournament): GroupDayCell[] {
  return groupDayCells(t).filter((c) => c.matches.length === 2);
}

/** Look a real `Match` up by its bracket `matchId` (KO node y reads this). */
export function koMatchById(t: Tournament): Map<string, Match> {
  return new Map(t.matches.filter((m) => m.stage !== 'GROUP_STAGE').map((m) => [m.id, m]));
}

/** Children of a bracket node = its two `winnerOf` feeders in [home, away] order. */
export function winnerChildren(node: BracketNode, byId: Map<string, BracketNode>): BracketNode[] {
  const matchIdOf = (slot: BracketSlot): string | null =>
    slot.source.kind === 'winnerOf' ? slot.source.matchId : null;
  return [node.home, node.away]
    .map(matchIdOf)
    .filter((id): id is string => id !== null)
    .map((id) => byId.get(id))
    .filter((n): n is BracketNode => n !== undefined);
}

/**
 * Recursively freeze a value so a layout/transform that tries to mutate its
 * input throws — proving purity by construction.
 */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** Stable, comparable snapshot of a `Map<string, XY>`-shaped layout. */
export function sortedEntries<V>(map: ReadonlyMap<string, V>): [string, V][] {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// --- Radial "circle" layout derivation helpers (2026-06-30-1104) ------------
//
// FIXTURE-DERIVED, never hardcoded: the radial specs read the SAME winner-tree /
// R32 round the radial builder walks, so a fixture change keeps the specs honest.

/** The FINAL-rooted winner tree's nodes (the radial layout's domain): the 31 KO
 *  matches reachable from FINAL via `winnerOf` links — R32(16)+R16(8)+QF(4)+SF(2)
 *  +FINAL(1). THIRD_PLACE (a `loserOf` node) is unreachable and therefore ABSENT,
 *  exactly as `hierarchy(finalNode, winnerChildrenOf)` excludes it. */
export function winnerTreeNodes(t: Tournament): BracketNode[] {
  const byId = new Map(allBracketNodes(t.bracket).map((n) => [n.matchId, n]));
  const final = t.bracket.rounds.find((r) => r.stage === 'FINAL')?.nodes[0];
  if (!final) throw new Error('fixture invariant: FINAL round missing');
  const out: BracketNode[] = [];
  const walk = (node: BracketNode): void => {
    out.push(node);
    for (const child of winnerChildren(node, byId)) walk(child);
  };
  walk(final);
  return out;
}

/** Every R32 round node (16), the parents of the 32 outer-ring badges. */
export function r32Nodes(t: Tournament): BracketNode[] {
  const r32 = t.bracket.rounds.find((r) => r.stage === 'ROUND_OF_32');
  if (!r32) throw new Error('fixture invariant: ROUND_OF_32 round missing');
  return [...r32.nodes];
}

/** A flat list of the 32 R32 participants (home+away of each R32 match) in
 *  [matchId, side, team] form — the badge ground truth, fixture-derived. */
export interface R32ParticipantRef {
  readonly matchId: string;
  readonly side: 'home' | 'away';
  readonly team: BracketSlot['team'];
}
export function r32ParticipantRefs(t: Tournament): R32ParticipantRef[] {
  return r32Nodes(t).flatMap((n) => [
    { matchId: n.matchId, side: 'home' as const, team: n.home.team },
    { matchId: n.matchId, side: 'away' as const, team: n.away.team },
  ]);
}

/** The expected number of outer-ring badges == the 32 R32 participants. */
export function expectedBadgeCount(t: Tournament): number {
  return r32ParticipantRefs(t).length;
}

/** The unique React Flow node id of a badge: `badge-<r32MatchId>-<side>` [H4]. */
export function badgeNodeId(matchId: string, side: 'home' | 'away'): string {
  return `badge-${matchId}-${side}`;
}

/** The radial connector edge id: `radial-<childMatchId>-<parentMatchId>` [H4].
 *  ONE source of truth for the grammar both the builder + focus specs assert. */
export function radialEdgeId(childMatchId: string, parentMatchId: string): string {
  return `radial-${childMatchId}-${parentMatchId}`;
}

/** A `matchId -> BracketNode` lookup over EVERY bracket node (all rounds). The
 *  radial specs index the winner tree by match id; derived once here. */
export function bracketNodeById(t: Tournament): Map<string, BracketNode> {
  return new Map(allBracketNodes(t.bracket).map((n) => [n.matchId, n]));
}

/** The single FINAL bracket node (the radial tree's root / center). Throws on a
 *  malformed fixture so a missing FINAL surfaces loudly, not as `undefined`. */
export function finalBracketNode(t: Tournament): BracketNode {
  const node = t.bracket.rounds.find((r) => r.stage === 'FINAL')?.nodes[0];
  if (!node) throw new Error('fixture invariant: FINAL round missing');
  return node;
}

/** The single THIRD_PLACE bracket node (a `loserOf` node OUTSIDE the winner tree —
 *  the radial view omits it). Throws if the fixture lacks one. */
export function thirdPlaceBracketNode(t: Tournament): BracketNode {
  const node = t.bracket.rounds.find((r) => r.stage === 'THIRD_PLACE')?.nodes[0];
  if (!node) throw new Error('fixture invariant: THIRD_PLACE round missing');
  return node;
}

/** A `childMatchId -> parentBracketNode` map over the winner tree — the inward
 *  link each `radial-<child>-<parent>` edge / focus path walks. Derived from the
 *  same `winnerChildren` relation the layout/builder use, so one source of truth. */
export function winnerTreeParentByChild(t: Tournament): Map<string, BracketNode> {
  const byId = bracketNodeById(t);
  const parentOf = new Map<string, BracketNode>();
  for (const parent of winnerTreeNodes(t)) {
    for (const child of winnerChildren(parent, byId)) parentOf.set(child.matchId, parent);
  }
  return parentOf;
}

/** Every child→parent winner link in the tree (the radial edge oracle): 30 links
 *  (R32 16 + R16 8 + QF 4 + SF 2). Each yields one `radial-<child>-<parent>` edge. */
export interface WinnerTreeLink {
  readonly child: BracketNode;
  readonly parent: BracketNode;
}
export function winnerTreeLinks(t: Tournament): WinnerTreeLink[] {
  const byId = bracketNodeById(t);
  return winnerTreeNodes(t).flatMap((parent) =>
    winnerChildren(parent, byId).map((child) => ({ child, parent })),
  );
}
