import { computeGroups } from '@/domain/bracket/standings';
import { buildBracket } from '@/domain/bracket/build-bracket';
import { R32_SEEDING } from '@/domain/bracket/seeding';
import type { Group, Match, MatchStatus, Score, Stage, Team, Tournament } from '@/domain/types';
import { teamRef } from '@/domain/types';
import { fifaFlagUrl } from '@/data/flag-url';
import { MOCK_NATIONS } from './teams';

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

interface Seeded {
  readonly team: Team;
  readonly group: string;
  readonly strength: number;
}

/** Deterministic PRNG (mulberry32) — no Math.random, fully reproducible. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function iso(month0: number, day: number, hour: number, minute = 0): string {
  return new Date(Date.UTC(2026, month0, day, hour, minute)).toISOString();
}

/** Knuth Poisson sampler bounded to a believable scoreline. */
function drawGoals(attack: number, defence: number, rng: () => number): number {
  const lambda = Math.max(0.25, Math.min(3.6, 1.25 + (attack - defence) / 42));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

function decide(home: Seeded, away: Seeded, rng: () => number, knockout: boolean): Score {
  const hg = drawGoals(home.strength, away.strength, rng);
  const ag = drawGoals(away.strength, home.strength, rng);

  if (hg !== ag) {
    return {
      home: hg,
      away: ag,
      penaltyHome: null,
      penaltyAway: null,
      resolution: 'regular',
      winner: hg > ag ? 'home' : 'away',
    };
  }
  if (!knockout) {
    return {
      home: hg,
      away: ag,
      penaltyHome: null,
      penaltyAway: null,
      resolution: 'regular',
      winner: 'draw',
    };
  }
  // Knockout: settle level games on penalties.
  const homeFavoured = home.strength + rng() * 12 >= away.strength + rng() * 12;
  const ph = homeFavoured ? 4 : 3;
  const pa = homeFavoured ? 3 : 4;
  return {
    home: hg,
    away: ag,
    penaltyHome: ph,
    penaltyAway: pa,
    resolution: 'penalties',
    winner: homeFavoured ? 'home' : 'away',
  };
}

function winnerOf(home: Seeded, away: Seeded, score: Score): Seeded {
  return score.winner === 'home' ? home : away;
}
function loserOf(home: Seeded, away: Seeded, score: Score): Seeded {
  return score.winner === 'home' ? away : home;
}

function makeMatch(args: {
  id: string;
  stage: Stage;
  group: string | null;
  matchday: number | null;
  home: Seeded;
  away: Seeded;
  score: Score;
  kickoff: string;
  status: MatchStatus;
  minute?: number | null;
  venue?: string | null;
}): Match {
  return {
    id: args.id,
    providerMatchId: args.id,
    stage: args.stage,
    group: args.group,
    matchday: args.matchday,
    home: teamRef(args.home.team),
    away: teamRef(args.away.team),
    score: args.score,
    kickoff: args.kickoff,
    status: args.status,
    minute: args.minute ?? null,
    venue: { name: args.venue ?? null, city: null },
  };
}

/**
 * Build a complete, deterministic mock World Cup snapshot:
 * full group stage played → standings → seeded Round of 32 → knockout simulated
 * to a *live* Final, with the third-place play-off left scheduled. Every node has
 * real teams, and all three match states (finished / live / scheduled) appear.
 */
export function buildMockTournament(fetchedAt: string): Tournament {
  const rng = makeRng(20260611);

  const seeds: Seeded[] = MOCK_NATIONS.map((nation, i) => ({
    team: {
      id: `team-${nation.code}`,
      name: nation.name,
      code: nation.code,
      flagUrl: fifaFlagUrl(nation.code),
    },
    group: GROUP_LETTERS[i % 12],
    strength: MOCK_NATIONS.length - i,
  }));

  const byGroup = new Map<string, Seeded[]>();
  for (const letter of GROUP_LETTERS) byGroup.set(letter, []);
  for (const s of seeds) byGroup.get(s.group)!.push(s);

  const matches: Match[] = [];

  // --- Group stage: round-robin of 4, three matchdays, all finished. ---
  const rounds: [number, number][][] = [
    [
      [0, 1],
      [2, 3],
    ],
    [
      [0, 2],
      [3, 1],
    ],
    [
      [3, 0],
      [1, 2],
    ],
  ];
  GROUP_LETTERS.forEach((letter, g) => {
    const teams = byGroup.get(letter)!;
    rounds.forEach((pairs, md) => {
      pairs.forEach(([hi, ai], n) => {
        const home = teams[hi];
        const away = teams[ai];
        matches.push(
          makeMatch({
            id: `wc2026-g${letter}-${md + 1}-${n + 1}`,
            stage: 'GROUP_STAGE',
            group: letter,
            matchday: md + 1,
            home,
            away,
            score: decide(home, away, rng, false),
            kickoff: iso(5, 11 + md * 4, 12 + (g % 4) * 2, n * 30),
            status: 'finished',
          }),
        );
      });
    });
  });

  const groups: Group[] = computeGroups(matches);

  // --- Resolve Round-of-32 qualifiers from the standings. ---
  const seedById = new Map(seeds.map((s) => [s.team.id, s]));
  const groupByName = new Map(groups.map((grp) => [grp.name, grp]));
  const thirds = groups
    .map((grp) => grp.table[2])
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.team.name.localeCompare(b.team.name),
    )
    .slice(0, 8)
    .map((row) => seedById.get(row.team.id)!);

  let thirdCursor = 0;
  const resolveLabel = (label: string): Seeded => {
    if (label === '3rd') return thirds[thirdCursor++];
    const pos = label[0] === '1' ? 0 : 1;
    const row = groupByName.get(label[1])!.table[pos];
    return seedById.get(row.team.id)!;
  };

  // --- Knockout: R32→SF finished, third-place scheduled, Final live. ---
  let round: Seeded[] = R32_SEEDING.flatMap((pair) => [
    resolveLabel(pair.home),
    resolveLabel(pair.away),
  ]);

  const koSchedule: {
    stage: Stage;
    month0: number;
    baseDay: number;
    perDay: number;
    baseHour: number;
  }[] = [
    { stage: 'ROUND_OF_32', month0: 5, baseDay: 28, perDay: 4, baseHour: 12 },
    { stage: 'ROUND_OF_16', month0: 6, baseDay: 4, perDay: 4, baseHour: 13 },
    { stage: 'QUARTER_FINALS', month0: 6, baseDay: 9, perDay: 2, baseHour: 14 },
    { stage: 'SEMI_FINALS', month0: 6, baseDay: 14, perDay: 2, baseHour: 19 },
  ];

  let semifinalists: { home: Seeded; away: Seeded; score: Score }[] = [];

  for (const cfg of koSchedule) {
    const tag =
      cfg.stage === 'ROUND_OF_32'
        ? 'r32'
        : cfg.stage === 'ROUND_OF_16'
          ? 'r16'
          : cfg.stage === 'QUARTER_FINALS'
            ? 'qf'
            : 'sf';
    const next: Seeded[] = [];
    const played: { home: Seeded; away: Seeded; score: Score }[] = [];
    for (let slot = 0; slot < round.length / 2; slot++) {
      const home = round[slot * 2];
      const away = round[slot * 2 + 1];
      const score = decide(home, away, rng, true);
      played.push({ home, away, score });
      matches.push(
        makeMatch({
          id: `wc2026-${tag}-${slot + 1}`,
          stage: cfg.stage,
          group: null,
          matchday: null,
          home,
          away,
          score,
          kickoff: iso(
            cfg.month0,
            cfg.baseDay + Math.floor(slot / cfg.perDay),
            cfg.baseHour + (slot % cfg.perDay) * 3,
          ),
          status: 'finished',
        }),
      );
      next.push(winnerOf(home, away, score));
    }
    if (cfg.stage === 'SEMI_FINALS') semifinalists = played;
    round = next;
  }

  // Finalists (winners) and third-place contenders (losers) of the semifinals.
  const finalHome = winnerOf(semifinalists[0].home, semifinalists[0].away, semifinalists[0].score);
  const finalAway = winnerOf(semifinalists[1].home, semifinalists[1].away, semifinalists[1].score);
  const tpHome = loserOf(semifinalists[0].home, semifinalists[0].away, semifinalists[0].score);
  const tpAway = loserOf(semifinalists[1].home, semifinalists[1].away, semifinalists[1].score);

  matches.push(
    makeMatch({
      id: 'wc2026-3p-1',
      stage: 'THIRD_PLACE',
      group: null,
      matchday: null,
      home: tpHome,
      away: tpAway,
      score: {
        home: null,
        away: null,
        penaltyHome: null,
        penaltyAway: null,
        resolution: null,
        winner: null,
      },
      kickoff: iso(6, 18, 15),
      status: 'scheduled',
      venue: 'Hard Rock Stadium, Miami',
    }),
  );

  matches.push(
    makeMatch({
      id: 'wc2026-f-1',
      stage: 'FINAL',
      group: null,
      matchday: null,
      home: finalHome,
      away: finalAway,
      score: {
        home: 1,
        away: 0,
        penaltyHome: null,
        penaltyAway: null,
        resolution: null,
        winner: null,
      },
      kickoff: iso(6, 19, 16),
      status: 'live',
      minute: 67,
      venue: 'MetLife Stadium, New York',
    }),
  );

  return {
    meta: {
      id: 'WC-2026',
      name: 'FIFA World Cup 2026',
      season: 2026,
      provider: 'mock',
      fetchedAt,
    },
    teams: seeds.map((s) => s.team),
    matches,
    groups,
    bracket: buildBracket(matches),
  };
}
