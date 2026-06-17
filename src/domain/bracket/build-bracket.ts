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
  STAGE_LABELS,
  STAGE_MATCH_COUNT,
  STAGE_TAG,
} from './stage-order';

function sortKoMatches(a: Match, b: Match): number {
  const byTime = a.kickoff.localeCompare(b.kickoff);
  return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
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
  for (const arr of realByStage.values()) arr.sort(sortKoMatches);

  const nodesByStage = new Map<KnockoutStage, BracketNode[]>();

  for (let r = 0; r < KNOCKOUT_STAGES.length; r++) {
    const stage = KNOCKOUT_STAGES[r];
    const count = STAGE_MATCH_COUNT[stage];
    const real = realByStage.get(stage) ?? [];
    const childStage = r === 0 ? null : KNOCKOUT_STAGES[r - 1];
    const childNodes = childStage ? nodesByStage.get(childStage)! : null;
    const nodes: BracketNode[] = [];

    for (let slot = 0; slot < count; slot++) {
      const match = real[slot];
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
        homeTeam = match
          ? match.home
          : (decidedTeam(top, matchById, 'winner') ??
            placeholderRef(`Winner ${shortLabel(childStage!, slot * 2)}`));
        awayTeam = match
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
  const real = (realByStage.get('THIRD_PLACE') ?? [])[0];
  const matchId = real ? real.id : syntheticId('THIRD_PLACE', 0);

  const homeTeam: TeamRef = real
    ? real.home
    : (decidedTeam(sf[0], matchById, 'loser') ?? placeholderRef('Loser SF-1'));
  const awayTeam: TeamRef = real
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
