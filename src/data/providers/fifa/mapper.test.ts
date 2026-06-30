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

  // build-bracket slots real KO fixtures by FIFA MatchNumber (R16 = 89–96, so the
  // R16 fixture fed by R32 slots 2 & 3 is matchNumber 90). The mapper must SURFACE
  // raw.MatchNumber onto the domain Match — it is currently dropped. The slot key
  // is the SINGLE point of truth for placement, so each surfacing case is pinned.
  it('surfaces a present raw MatchNumber onto the domain Match unchanged', () => {
    const r16WithNumber: RawMatch = { ...finishedKo, MatchNumber: 90 };
    const [m] = mapFifaMatches([r16WithNumber]);
    expect(m.matchNumber).toBe(90);
  });

  it('coalesces an explicit null raw MatchNumber to null (not undefined)', () => {
    // schema.ts types MatchNumber as nullable; an explicit null must surface as a
    // strict null so build-bracket's `n == null` kickoff fallback fires cleanly.
    const r16WithNull: RawMatch = { ...finishedKo, MatchNumber: null };
    const [m] = mapFifaMatches([r16WithNull]);
    expect(m.matchNumber).toBeNull();
  });

  it('defaults matchNumber to null when raw MatchNumber is absent', () => {
    // liveGroup carries no MatchNumber (group-stage row) → must surface as null,
    // NOT undefined, so the field is always present for build-bracket to read.
    const [m] = mapFifaMatches([liveGroup]);
    expect(m.matchNumber).toBeNull();
  });

  it('surfaces matchNumber per row across a mixed batch (no cross-contamination)', () => {
    // A batch mixing a numbered KO row with an unnumbered group row must map each
    // independently — the numbered fixture keeps its number, the other stays null.
    const r32WithNumber: RawMatch = { ...finishedKo, MatchNumber: 76 };
    const [ko, group] = mapFifaMatches([r32WithNumber, liveGroup]);
    expect(ko.matchNumber).toBe(76);
    expect(group.matchNumber).toBeNull();
  });

  // ==========================================================================
  // PlaceHolder feeder refs · structured "W##"/"L##" parse onto Match.feeders
  // ==========================================================================
  // build-bracket wires R16+ feeder edges from FIFA's PlaceHolderA/B ("W74" =
  // winner of MatchNumber 74), NOT from adjacent-pair topology. The mapper must
  // parse those strings into structured KoFeederRef and surface them on
  // Match.feeders. It currently uses PlaceHolder only as a cosmetic label, so
  // these are RED until the parse lands. Group-position / non-match placeholders
  // ("1A", "RU-B", "3rd Place", "Winner Group A") must yield a null ref.
  describe('PlaceHolder feeder refs → Match.feeders', () => {
    // DRY: one builder for an unresolved KO shell (no IdTeam) carrying the given
    // PlaceHolderA/B. Every parse case states its intent through the placeholder
    // pair alone — no copy-pasted RawMatch literals. `null`/`undefined` model the
    // "PlaceHolder absent" wire shape exactly.
    function koShellWith(
      placeHolderA: string | null | undefined,
      placeHolderB: string | null | undefined,
    ): RawMatch {
      return {
        ...scheduledTbd,
        Home: null,
        Away: null,
        PlaceHolderA: placeHolderA,
        PlaceHolderB: placeHolderB,
      };
    }

    /** Map a single KO shell and return its feeders object. */
    function feedersOf(
      placeHolderA: string | null | undefined,
      placeHolderB: string | null | undefined,
    ) {
      return mapFifaMatches([koShellWith(placeHolderA, placeHolderB)])[0].feeders;
    }

    it('parses "W##" PlaceHolders into winnerOf feeder refs (the real FIFA pairing)', () => {
      // R16 fixture 89: PlaceHolderA="W74" PlaceHolderB="W77" → pairs the winner
      // of match 74 with the winner of match 77 (the true FIFA pairing).
      const feeders = feedersOf('W74', 'W77');
      expect(feeders?.home).toEqual({ kind: 'winnerOf', matchNumber: 74 });
      expect(feeders?.away).toEqual({ kind: 'winnerOf', matchNumber: 77 });
    });

    it('parses "L##" PlaceHolders into loserOf feeder refs (third-place row)', () => {
      // The third-place play-off pairs the two semifinal LOSERS: "L101"/"L102".
      const feeders = feedersOf('L101', 'L102');
      expect(feeders?.home).toEqual({ kind: 'loserOf', matchNumber: 101 });
      expect(feeders?.away).toEqual({ kind: 'loserOf', matchNumber: 102 });
    });

    it('parses an asymmetric "W##"/"L##" pair into the matching kinds', () => {
      // Each side is parsed independently: a winnerOf on one side and a loserOf on
      // the other must not bleed into a single shared kind.
      const feeders = feedersOf('W88', 'L96');
      expect(feeders?.home).toEqual({ kind: 'winnerOf', matchNumber: 88 });
      expect(feeders?.away).toEqual({ kind: 'loserOf', matchNumber: 96 });
    });

    it('yields null refs for group-position / non-match placeholders', () => {
      // R32 PlaceHolders name group positions, not match winners. These are NOT
      // feeder refs — the ref must be null so build-bracket keeps R32's
      // group-seeding sources untouched.
      const groupPositions = feedersOf('1A', 'RU-B');
      expect(groupPositions).toBeDefined();
      expect(groupPositions?.home).toBeNull();
      expect(groupPositions?.away).toBeNull();

      // Wordy non-match placeholders ("3rd Place", "Winner Group A") must also
      // yield null — the regex must anchor strictly on "W##"/"L##".
      const wordy = feedersOf('3rd Place', 'Winner Group A');
      expect(wordy?.home).toBeNull();
      expect(wordy?.away).toBeNull();
    });

    // Boundary / malformed-input table: every shape that LOOKS like a feeder ref
    // but is not a strict "W##"/"L##" must parse to null. These guard the anchored
    // regex + positive-integer rule against off-by-one acceptance, so a malformed
    // ref can never index build-bracket's child array. One declarative row each.
    it.each([
      ['empty string', ''],
      ['whitespace only', '   '],
      ['letter with no digits', 'W'],
      ['zero match number', 'W0'],
      ['leading-zero-only number', 'L00'],
      ['lowercase letter', 'w74'],
      ['wrong letter', 'X74'],
      ['trailing junk', 'W74x'],
      ['leading junk', 'xW74'],
      ['decimal number', 'W7.4'],
      ['negative-looking', 'W-3'],
      ['inner whitespace', 'W 74'],
    ])(
      'parses a non-"W##"/"L##" placeholder (%s) to a null ref on both sides',
      (_label, placeholder) => {
        const feeders = feedersOf(placeholder, placeholder);
        expect(feeders).toBeDefined();
        expect(feeders?.home).toBeNull();
        expect(feeders?.away).toBeNull();
      },
    );

    it('trims surrounding whitespace before parsing a valid ref', () => {
      // FIFA pads some placeholder strings; a leading/trailing space must not
      // defeat the strict anchor — the ref still resolves to the inner "W##".
      const feeders = feedersOf('  W74  ', '\tL101\n');
      expect(feeders?.home).toEqual({ kind: 'winnerOf', matchNumber: 74 });
      expect(feeders?.away).toEqual({ kind: 'loserOf', matchNumber: 101 });
    });

    it('parses a large multi-digit match number without truncation', () => {
      // Defensive boundary: a 3-digit ref (third-place/final range) parses whole.
      const feeders = feedersOf('W104', 'L103');
      expect(feeders?.home).toEqual({ kind: 'winnerOf', matchNumber: 104 });
      expect(feeders?.away).toEqual({ kind: 'loserOf', matchNumber: 103 });
    });

    it('yields null refs when PlaceHolders are absent (resolved KO / group row)', () => {
      // A finished KO row with real IdTeams carries no PlaceHolder → both sides
      // null, but the feeders object is still present (consistently shaped) so
      // build-bracket can read `feeders.home`/`away` without an undefined guard.
      const [m] = mapFifaMatches([finishedKo]);
      expect(m.feeders).toBeDefined();
      expect(m.feeders?.home).toBeNull();
      expect(m.feeders?.away).toBeNull();
    });

    it('yields a feeder ref on only the side that carries a "W##" (single-feed)', () => {
      // A partially-known fixture: one side already resolved (no PlaceHolder), the
      // other a "W##" shell. Each side parses independently — the feed side keeps
      // its ref, the resolved side stays null.
      const feeders = feedersOf(null, 'W77');
      expect(feeders?.home).toBeNull();
      expect(feeders?.away).toEqual({ kind: 'winnerOf', matchNumber: 77 });
    });

    it('parses feeders per row across a mixed batch (no cross-contamination)', () => {
      // One "W##" KO row + one group row → the KO row gets winnerOf refs, the
      // group row gets nulls. Each row maps independently.
      const [ko, group] = mapFifaMatches([koShellWith('W74', 'W77'), liveGroup]);
      expect(ko.feeders?.home).toEqual({ kind: 'winnerOf', matchNumber: 74 });
      expect(ko.feeders?.away).toEqual({ kind: 'winnerOf', matchNumber: 77 });
      expect(group.feeders?.home).toBeNull();
      expect(group.feeders?.away).toBeNull();
    });

    it('keeps cosmetic placeholder labels unchanged when parsing feeders', () => {
      // Regression: parsing the structured feeder ref must NOT change the
      // displayed home/away placeholder label. The QF shell still shows W49/W50…
      const [m] = mapFifaMatches([scheduledTbd]);
      expect(m.home).toEqual({ kind: 'placeholder', label: 'W49' });
      expect(m.away).toEqual({ kind: 'placeholder', label: 'W50' });
      // …and the structured feeders parse alongside the cosmetic labels.
      expect(m.feeders?.home).toEqual({ kind: 'winnerOf', matchNumber: 49 });
      expect(m.feeders?.away).toEqual({ kind: 'winnerOf', matchNumber: 50 });
    });
  });
});
