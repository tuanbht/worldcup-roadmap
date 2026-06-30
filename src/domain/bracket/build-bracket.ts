import type {
  Bracket,
  BracketNode,
  BracketRound,
  KnockoutStage,
  Match,
  SlotSource,
  TeamRef,
} from '../types';
import { isResolved, placeholderRef } from '../types';
import { R32_SEEDING } from './seeding';
import {
  KNOCKOUT_STAGES,
  STAGE_FIRST_MATCH,
  STAGE_LABELS,
  STAGE_MATCH_COUNT,
  STAGE_TAG,
} from './stage-order';

function sortKoMatches(a: Match, b: Match): number {
  const byTime = a.kickoff.localeCompare(b.kickoff);
  return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
}

/**
 * Slot a stage's real fixtures into their TRUE bracket positions.
 *
 * The advance edges and seeding labels are topological (`R32_SEEDING[slot]`,
 * `winnerOf childNodes[slot*2]`), so the displayed team must land in the slot
 * those edges point at. When a fixture carries FIFA `matchNumber`, place it at
 * `matchNumber − STAGE_FIRST_MATCH[stage]` (guarded to `[0, count)`); this keeps
 * the resolved team and its feeders aligned. Fixtures without `matchNumber`
 * (mock/legacy), out-of-range numbers, or slot collisions fall back to the
 * legacy kickoff-sorted dense-pack into the remaining empty slots — so the mock
 * (authored in slot order, fully populated) produces a byte-identical bracket.
 *
 * Pure: allocates a fresh array and copies before sorting; never mutates `real`.
 */
function placeRealByStage(
  stage: KnockoutStage,
  real: readonly Match[],
  count: number,
): (Match | undefined)[] {
  const base = STAGE_FIRST_MATCH[stage];
  const bySlot: (Match | undefined)[] = new Array(count).fill(undefined);
  const leftover: Match[] = [];

  // Pass 1 — explicit placement by matchNumber (the topological slot key).
  for (const m of real) {
    const n = m.matchNumber;
    if (n == null) {
      leftover.push(m);
      continue;
    }
    const slot = n - base;
    if (slot >= 0 && slot < count && bySlot[slot] === undefined) {
      bySlot[slot] = m;
    } else {
      // Out of range, or a slot collision (duplicate matchNumber) → never drop a
      // real fixture; dense-pack it defensively in Pass 2.
      leftover.push(m);
    }
  }

  // Pass 2 — dense-pack the remainder (legacy/mock) by kickoff into empty slots.
  const ordered = [...leftover].sort(sortKoMatches);
  let cursor = 0;
  for (const m of ordered) {
    while (cursor < count && bySlot[cursor] !== undefined) cursor++;
    if (cursor >= count) break;
    bySlot[cursor] = m;
    cursor++;
  }

  return bySlot;
}

function syntheticId(stage: KnockoutStage, slot: number): string {
  return `wc2026-ko-${STAGE_TAG[stage].toLowerCase()}-${slot + 1}`;
}

function shortLabel(stage: KnockoutStage, slot: number): string {
  return `${STAGE_TAG[stage]}-${slot + 1}`;
}

/** Resolve the winner/loser of a child node when its match has finished. */
function decidedTeam(
  node: BracketNode,
  matchById: Map<string, Match>,
  which: 'winner' | 'loser',
): TeamRef | null {
  const match = matchById.get(node.matchId);
  if (!match || match.status !== 'finished') return null;
  const w = match.score.winner;
  if (w === null || w === 'draw') return null;
  const side = which === 'winner' ? w : w === 'home' ? 'away' : 'home';
  const ref = side === 'home' ? match.home : match.away;
  return isResolved(ref) ? ref : null;
}

/**
 * Derive the full knockout `Bracket` from the flat match list.
 *
 * The topology (16→8→4→2→1 plus a third-place play-off) is always complete, even
 * before a provider has created the later-round fixtures: missing matches become
 * synthetic placeholder nodes. Parent slots reference their two children via
 * `winnerOf`, and concrete teams propagate upward as feeder matches finish.
 *
 * Pure: the input arrays are never mutated.
 */
export function buildBracket(matches: readonly Match[]): Bracket {
  const matchById = new Map<string, Match>(matches.map((m) => [m.id, m]));

  const realByStage = new Map<KnockoutStage, Match[]>();
  for (const m of matches) {
    if (m.stage === 'GROUP_STAGE') continue;
    const arr = realByStage.get(m.stage) ?? [];
    arr.push(m);
    realByStage.set(m.stage, arr);
  }

  const nodesByStage = new Map<KnockoutStage, BracketNode[]>();

  for (let r = 0; r < KNOCKOUT_STAGES.length; r++) {
    const stage = KNOCKOUT_STAGES[r];
    const count = STAGE_MATCH_COUNT[stage];
    // Slot real fixtures by their TRUE bracket position (matchNumber), so the
    // displayed team rejoins the slot whose advance edges actually fed it.
    const realBySlot = placeRealByStage(stage, realByStage.get(stage) ?? [], count);
    const childStage = r === 0 ? null : KNOCKOUT_STAGES[r - 1];
    const childNodes = childStage ? nodesByStage.get(childStage)! : null;
    const nodes: BracketNode[] = [];

    for (let slot = 0; slot < count; slot++) {
      const match = realBySlot[slot];
      const matchId = match ? match.id : syntheticId(stage, slot);

      let homeSource: SlotSource;
      let awaySource: SlotSource;
      let homeTeam: TeamRef;
      let awayTeam: TeamRef;

      if (r === 0) {
        homeSource = { kind: 'group', position: R32_SEEDING[slot].home };
        awaySource = { kind: 'group', position: R32_SEEDING[slot].away };
        homeTeam = match ? match.home : placeholderRef(R32_SEEDING[slot].home);
        awayTeam = match ? match.away : placeholderRef(R32_SEEDING[slot].away);
      } else {
        const top = childNodes![slot * 2];
        const bottom = childNodes![slot * 2 + 1];
        homeSource = { kind: 'winnerOf', matchId: top.matchId };
        awaySource = { kind: 'winnerOf', matchId: bottom.matchId };
        // A real later-round fixture can exist as a placeholder *shell*
        // (PlaceHolderA/B, no IdTeam) before its feeder resolves. Only trust the
        // fixture's own team when it is actually resolved; otherwise propagate the
        // finished feeder's winner, falling back to a labelled placeholder.
        homeTeam =
          match && isResolved(match.home)
            ? match.home
            : (decidedTeam(top, matchById, 'winner') ??
              placeholderRef(`Winner ${shortLabel(childStage!, slot * 2)}`));
        awayTeam =
          match && isResolved(match.away)
            ? match.away
            : (decidedTeam(bottom, matchById, 'winner') ??
              placeholderRef(`Winner ${shortLabel(childStage!, slot * 2 + 1)}`));
      }

      nodes.push({
        matchId,
        stage,
        slotIndex: slot,
        home: { side: 'home', source: homeSource, team: homeTeam },
        away: { side: 'away', source: awaySource, team: awayTeam },
      });
    }

    nodesByStage.set(stage, nodes);
  }

  const thirdPlace = buildThirdPlace(realByStage, nodesByStage, matchById);

  const rounds: BracketRound[] = KNOCKOUT_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    nodes: nodesByStage.get(stage)!,
  }));
  rounds.push(thirdPlace);

  return { rounds };
}

function buildThirdPlace(
  realByStage: Map<KnockoutStage, Match[]>,
  nodesByStage: Map<KnockoutStage, BracketNode[]>,
  matchById: Map<string, Match>,
): BracketRound {
  const sf = nodesByStage.get('SEMI_FINALS')!;
  // Route the single-slot third-place play-off through the same matchNumber-aware
  // placement (base 103 → slot 0) so its displayed team and the loserOf-SF edges
  // share one source of truth, consistent with the main rounds.
  const real = placeRealByStage('THIRD_PLACE', realByStage.get('THIRD_PLACE') ?? [], 1)[0];
  const matchId = real ? real.id : syntheticId('THIRD_PLACE', 0);

  // Same shell guard as the main rounds: a real third-place fixture may carry
  // placeholder home/away until both semifinals resolve. Trust the fixture team
  // only when resolved; otherwise propagate the semifinal losers.
  const homeTeam: TeamRef =
    real && isResolved(real.home)
      ? real.home
      : (decidedTeam(sf[0], matchById, 'loser') ?? placeholderRef('Loser SF-1'));
  const awayTeam: TeamRef =
    real && isResolved(real.away)
      ? real.away
      : (decidedTeam(sf[1], matchById, 'loser') ?? placeholderRef('Loser SF-2'));

  const node: BracketNode = {
    matchId,
    stage: 'THIRD_PLACE',
    slotIndex: 0,
    home: { side: 'home', source: { kind: 'loserOf', matchId: sf[0].matchId }, team: homeTeam },
    away: { side: 'away', source: { kind: 'loserOf', matchId: sf[1].matchId }, team: awayTeam },
  };

  return { stage: 'THIRD_PLACE', label: STAGE_LABELS.THIRD_PLACE, nodes: [node] };
}
