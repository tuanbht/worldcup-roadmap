import type { FormResult, Group, Match, StandingRow, Team } from '../types';
import { isResolved } from '../types';

interface Accumulator {
  team: Team;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** kickoff -> result, collected then ordered for `form`. */
  form: { kickoff: string; result: FormResult }[];
}

function emptyAccumulator(team: Team): Accumulator {
  return {
    team,
    played: 0,
    won: 0,
    draw: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    form: [],
  };
}

/**
 * Compute the 12 group tables from finished group-stage matches.
 *
 * Tiebreakers applied, in order: points, goal difference, goals for, name.
 * (FIFA also uses head-to-head; this is the widely-used GD/GF approximation and
 * is documented as such.) Pure and immutable — input is never mutated.
 */
export function computeGroups(matches: readonly Match[]): Group[] {
  const byGroup = new Map<string, Accumulator[]>();
  const indexInGroup = new Map<string, Map<string, Accumulator>>();

  const ensureTeam = (group: string, team: Team): Accumulator => {
    let teams = indexInGroup.get(group);
    if (!teams) {
      teams = new Map();
      indexInGroup.set(group, teams);
      byGroup.set(group, []);
    }
    let acc = teams.get(team.id);
    if (!acc) {
      acc = emptyAccumulator(team);
      teams.set(team.id, acc);
      byGroup.get(group)!.push(acc);
    }
    return acc;
  };

  for (const match of matches) {
    if (match.stage !== 'GROUP_STAGE' || match.group === null) continue;
    if (!isResolved(match.home) || !isResolved(match.away)) continue;

    // Register both teams so winless/unplayed teams still appear in the table.
    const home = ensureTeam(match.group, match.home.team);
    const away = ensureTeam(match.group, match.away.team);

    if (match.status !== 'finished' || match.score.home === null || match.score.away === null) {
      continue;
    }

    const hg = match.score.home;
    const ag = match.score.away;
    home.played += 1;
    away.played += 1;
    home.goalsFor += hg;
    home.goalsAgainst += ag;
    away.goalsFor += ag;
    away.goalsAgainst += hg;

    if (hg > ag) {
      home.won += 1;
      home.points += 3;
      home.form.push({ kickoff: match.kickoff, result: 'W' });
      away.lost += 1;
      away.form.push({ kickoff: match.kickoff, result: 'L' });
    } else if (hg < ag) {
      away.won += 1;
      away.points += 3;
      away.form.push({ kickoff: match.kickoff, result: 'W' });
      home.lost += 1;
      home.form.push({ kickoff: match.kickoff, result: 'L' });
    } else {
      home.draw += 1;
      away.draw += 1;
      home.points += 1;
      away.points += 1;
      home.form.push({ kickoff: match.kickoff, result: 'D' });
      away.form.push({ kickoff: match.kickoff, result: 'D' });
    }
  }

  const groups: Group[] = [];
  for (const [name, accs] of byGroup) {
    const ranked = [...accs].sort(compareAccumulators);
    const table: StandingRow[] = ranked.map((acc, i) => ({
      position: i + 1,
      team: acc.team,
      played: acc.played,
      won: acc.won,
      draw: acc.draw,
      lost: acc.lost,
      goalsFor: acc.goalsFor,
      goalsAgainst: acc.goalsAgainst,
      goalDifference: acc.goalsFor - acc.goalsAgainst,
      points: acc.points,
      form: acc.form
        .slice()
        .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
        .map((f) => f.result),
      qualified: i < 2,
    }));
    groups.push({ name, table });
  }

  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

function compareAccumulators(a: Accumulator, b: Accumulator): number {
  if (b.points !== a.points) return b.points - a.points;
  const gdA = a.goalsFor - a.goalsAgainst;
  const gdB = b.goalsFor - b.goalsAgainst;
  if (gdB !== gdA) return gdB - gdA;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.team.name.localeCompare(b.team.name);
}
