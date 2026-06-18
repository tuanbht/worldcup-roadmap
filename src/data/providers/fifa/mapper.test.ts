import { describe, expect, it } from 'vitest';
import { mapFifaMatches } from './mapper';
import type { RawMatch } from './schema';

const finishedKo: RawMatch = {
  IdMatch: '400251',
  IdStage: 'st-r16',
  StageName: [{ Locale: 'en-GB', Description: 'Round of 16' }],
  Home: {
    IdTeam: '43946',
    IdCountry: 'FRA',
    TeamName: [{ Locale: 'en-GB', Description: 'France' }],
  },
  Away: {
    IdTeam: '43911',
    IdCountry: 'BRA',
    TeamName: [{ Locale: 'en-GB', Description: 'Brazil' }],
  },
  HomeTeamScore: 2,
  AwayTeamScore: 1,
  Date: '2026-07-04T16:00:00Z',
  MatchStatus: 0,
  Stadium: {
    Name: [{ Locale: 'en-GB', Description: 'SoFi Stadium' }],
    CityName: [{ Locale: 'en-GB', Description: 'Los Angeles' }],
  },
};

const liveGroup: RawMatch = {
  IdMatch: '400100',
  StageName: [{ Locale: 'en-GB', Description: 'First Stage' }],
  GroupName: [{ Locale: 'en-GB', Description: 'Group C' }],
  Home: { IdTeam: '1', IdCountry: 'ESP', TeamName: [{ Locale: 'en-GB', Description: 'Spain' }] },
  Away: { IdTeam: '2', IdCountry: 'GER', TeamName: [{ Locale: 'en-GB', Description: 'Germany' }] },
  HomeTeamScore: 1,
  AwayTeamScore: 1,
  Date: '2026-06-17T19:00:00Z',
  MatchStatus: 3,
  MatchTime: "58'",
};

const scheduledTbd: RawMatch = {
  IdMatch: '400300',
  StageName: [{ Locale: 'en-GB', Description: 'Quarter-finals' }],
  Home: null,
  Away: null,
  PlaceHolderA: 'W49',
  PlaceHolderB: 'W50',
  HomeTeamScore: null,
  AwayTeamScore: null,
  Date: '2026-07-10T16:00:00Z',
  MatchStatus: 1,
};

describe('mapFifaMatches', () => {
  it('maps a finished knockout match', () => {
    const [m] = mapFifaMatches([finishedKo]);
    expect(m.stage).toBe('ROUND_OF_16');
    expect(m.status).toBe('finished');
    expect(m.score.winner).toBe('home');
    expect(m.home).toEqual({
      kind: 'team',
      team: {
        id: 'fifa-43946',
        name: 'France',
        code: 'FRA',
        flagUrl: expect.stringContaining('FRA'),
      },
    });
    expect(m.venue.city).toBe('Los Angeles');
  });

  it('populates providerRef from IdStage + IdMatch + env comp/season when IdStage is present', () => {
    const [m] = mapFifaMatches([finishedKo]);
    expect(m.providerRef).toEqual({
      idCompetition: expect.any(String),
      idSeason: expect.any(String),
      idStage: 'st-r16',
      idMatch: '400251',
    });
  });

  it('leaves providerRef null when IdStage is absent (detail unavailable, no crash)', () => {
    const noStage: RawMatch = { ...finishedKo, IdStage: undefined };
    const [m] = mapFifaMatches([noStage]);
    expect(m.providerRef).toBeNull();
  });

  it('maps a live group match with elapsed minute and no winner yet', () => {
    const [m] = mapFifaMatches([liveGroup]);
    expect(m.stage).toBe('GROUP_STAGE');
    expect(m.group).toBe('C');
    expect(m.status).toBe('live');
    expect(m.minute).toBe(58);
    expect(m.score.winner).toBeNull();
  });

  it('maps a scheduled knockout match with TBD placeholders', () => {
    const [m] = mapFifaMatches([scheduledTbd]);
    expect(m.stage).toBe('QUARTER_FINALS');
    expect(m.status).toBe('scheduled');
    expect(m.home).toEqual({ kind: 'placeholder', label: 'W49' });
    expect(m.away).toEqual({ kind: 'placeholder', label: 'W50' });
  });
});
