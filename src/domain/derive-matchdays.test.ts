import { describe, expect, it } from 'vitest';
import { deriveGroupMatchdays } from './derive-matchdays';
import { EMPTY_SCORE, teamRef } from './types';
import type { Match, Stage } from './types';

function mkMatch(p: {
  id: string;
  group: string | null;
  matchday: number | null;
  kickoff: string;
  stage?: Stage;
}): Match {
  return {
    id: p.id,
    providerMatchId: p.id,
    providerRef: null,
    stage: p.stage ?? 'GROUP_STAGE',
    group: p.group,
    matchday: p.matchday,
    home: teamRef({ id: `${p.id}-h`, name: 'Home', code: 'HOM', flagUrl: null }),
    away: teamRef({ id: `${p.id}-a`, name: 'Away', code: 'AWY', flagUrl: null }),
    score: EMPTY_SCORE,
    kickoff: p.kickoff,
    status: 'scheduled',
    minute: null,
    venue: { name: null, city: null },
  };
}

/** Six group-A matches, matchday null, deliberately out of kickoff order. */
function groupAMatches(): Match[] {
  return [
    mkMatch({ id: 'a-md3-1', group: 'A', matchday: null, kickoff: '2026-06-25T16:00:00Z' }),
    mkMatch({ id: 'a-md1-1', group: 'A', matchday: null, kickoff: '2026-06-13T16:00:00Z' }),
    mkMatch({ id: 'a-md2-2', group: 'A', matchday: null, kickoff: '2026-06-19T16:00:00Z' }),
    mkMatch({ id: 'a-md1-2', group: 'A', matchday: null, kickoff: '2026-06-14T16:00:00Z' }),
    mkMatch({ id: 'a-md3-2', group: 'A', matchday: null, kickoff: '2026-06-25T16:00:00Z' }),
    mkMatch({ id: 'a-md2-1', group: 'A', matchday: null, kickoff: '2026-06-18T16:00:00Z' }),
  ];
}

const md = (out: readonly Match[], id: string) => out.find((m) => m.id === id)?.matchday;

describe('deriveGroupMatchdays', () => {
  it('assigns matchdays in kickoff order, two matches per matchday', () => {
    const out = deriveGroupMatchdays(groupAMatches());
    expect([md(out, 'a-md1-1'), md(out, 'a-md1-2')]).toEqual([1, 1]);
    expect([md(out, 'a-md2-1'), md(out, 'a-md2-2')]).toEqual([2, 2]);
    expect([md(out, 'a-md3-1'), md(out, 'a-md3-2')]).toEqual([3, 3]);
  });

  it('preserves a provider-supplied matchday (only fills nulls)', () => {
    const matches = [
      mkMatch({ id: 'b1', group: 'B', matchday: 2, kickoff: '2026-06-13T00:00:00Z' }),
    ];
    expect(deriveGroupMatchdays(matches)[0].matchday).toBe(2);
  });

  it('numbers each group independently from MD1', () => {
    const matches = [
      mkMatch({ id: 'a1', group: 'A', matchday: null, kickoff: '2026-06-13T00:00:00Z' }),
      mkMatch({ id: 'b1', group: 'B', matchday: null, kickoff: '2026-06-20T00:00:00Z' }),
    ];
    const out = deriveGroupMatchdays(matches);
    expect(md(out, 'a1')).toBe(1);
    expect(md(out, 'b1')).toBe(1);
  });

  it('leaves knockout and groupless matches untouched', () => {
    const ko = mkMatch({
      id: 'final',
      group: null,
      matchday: null,
      kickoff: '2026-07-19T00:00:00Z',
      stage: 'FINAL',
    });
    expect(deriveGroupMatchdays([ko])[0].matchday).toBeNull();
  });

  it('does not mutate the input and is referentially stable when nothing to fill', () => {
    const settled = [
      mkMatch({ id: 'c1', group: 'C', matchday: 1, kickoff: '2026-06-13T00:00:00Z' }),
    ];
    expect(deriveGroupMatchdays(settled)).toBe(settled);

    const input = groupAMatches();
    const snapshot = input.map((m) => m.matchday);
    deriveGroupMatchdays(input);
    expect(input.map((m) => m.matchday)).toEqual(snapshot); // all still null
  });
});
