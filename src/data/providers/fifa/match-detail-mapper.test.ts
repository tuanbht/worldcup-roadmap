import { describe, expect, it } from 'vitest';
import type { ProviderRef } from '@/domain/types';
import { mapFifaMatchDetail } from './match-detail-mapper';
import { rawMatchLiveSchema, rawTimelineSchema } from './match-detail-schema';
import liveFixture from './__fixtures__/match-detail.live.json';
import timelineFixture from './__fixtures__/match-detail.timeline.json';

const REF: ProviderRef = {
  idCompetition: '17',
  idSeason: '285023',
  idStage: 'st-1',
  idMatch: '400251',
};

// Validate the captured fixtures through the boundary schema first, exactly as
// the production fetch path does. Never hits live FIFA.
const live = rawMatchLiveSchema.parse(liveFixture);
const timeline = rawTimelineSchema.parse(timelineFixture);

describe('mapFifaMatchDetail', () => {
  it('returns a MatchDetail keyed by the ref matchId', () => {
    const detail = mapFifaMatchDetail(live, timeline, REF);
    expect(detail.matchId).toBe('400251');
  });

  describe('events (mapped by TypeLocalized label)', () => {
    it('maps the home goal with correct minute, side and player name', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const goal = detail.events.find((e) => e.kind === 'goal' && e.side === 'home');
      expect(goal).toBeDefined();
      expect(goal!.minute).toBe(23);
      expect(goal!.playerName).toBe('Kylian Mbappe');
    });

    it('maps the away goal to the away side', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const goals = detail.events.filter((e) => e.kind === 'goal');
      expect(goals.map((g) => g.side).sort()).toEqual(['away', 'home']);
    });

    it('maps a yellow card to its player and side', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const yellow = detail.events.find((e) => e.kind === 'yellow');
      expect(yellow).toBeDefined();
      expect(yellow!.side).toBe('away');
      expect(yellow!.playerName).toBe('Vinicius Junior');
      expect(yellow!.minute).toBe(31);
    });

    it('maps a substitution and a VAR event', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      expect(detail.events.some((e) => e.kind === 'substitution')).toBe(true);
      expect(detail.events.some((e) => e.kind === 'var')).toBe(true);
    });

    it('maps an Assist event to its own player and the same (home) side as the goal', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const assist = detail.events.find((e) => e.kind === 'assist');
      expect(assist).toBeDefined();
      expect(assist!.side).toBe('home');
      expect(assist!.playerName).toBe('Mike Maignan');
      expect(assist!.minute).toBe(23);
    });

    it('emits exactly two goal events (one per side) and no duplicate kinds for them', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const goals = detail.events.filter((e) => e.kind === 'goal');
      expect(goals).toHaveLength(2);
    });

    it('does not emit domain events for non-domain labels (Attempt/Corner/Foul/Offside)', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const names = detail.events.map((e) => e.kind);
      expect(names).not.toContain('shot');
      // Those raw labels feed stats, not the timeline event list.
      expect(detail.events.every((e) => e.kind !== ('attempt' as never))).toBe(true);
    });

    it('orders events chronologically by minute', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const minutes = detail.events.map((e) => e.minute);
      expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    });
  });

  describe('lineups', () => {
    it('reads the formation (Tactics) for each side', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      expect(detail.home.formation).toBe('4-3-3');
      expect(detail.away.formation).toBe('4-2-3-1');
    });

    it('reads the coach for each side', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      expect(detail.home.coach).toBe('Didier Deschamps');
      expect(detail.away.coach).toBe('Dorival Junior');
    });

    it('splits starters from bench by player status', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      expect(detail.home.starters.map((p) => p.shortName).sort()).toEqual(['Maignan', 'Mbappe']);
      expect(detail.home.bench.map((p) => p.shortName)).toEqual(['Camavinga']);
    });

    it('flags the captain', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const captain = detail.home.starters.find((p) => p.isCaptain);
      expect(captain?.shortName).toBe('Mbappe');
    });

    it('passes the headshot photoUrl through (and null when absent)', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const maignan = detail.home.starters.find((p) => p.shortName === 'Maignan');
      expect(maignan?.photoUrl).toContain('digitalhub.fifa.com');
      const camavinga = detail.home.bench.find((p) => p.shortName === 'Camavinga');
      expect(camavinga?.photoUrl).toBeNull();
    });

    it('reads the shirt number', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const mbappe = detail.home.starters.find((p) => p.shortName === 'Mbappe');
      expect(mbappe?.shirtNumber).toBe(10);
    });
  });

  describe('player badges (from live Goals/Bookings/Substitutions)', () => {
    it('counts a scorer goal on the player', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const mbappe = detail.home.starters.find((p) => p.shortName === 'Mbappe');
      expect(mbappe?.goals).toBe(1);
      const vinicius = detail.away.starters.find((p) => p.shortName === 'Vinicius');
      expect(vinicius?.goals).toBe(1);
    });

    it('flags a yellow card on the booked player', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const vinicius = detail.away.starters.find((p) => p.shortName === 'Vinicius');
      expect(vinicius?.yellow).toBe(true);
      expect(vinicius?.red).toBe(false);
    });

    it('records the minute a player was subbed off / on', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const mbappe = detail.home.starters.find((p) => p.shortName === 'Mbappe');
      expect(mbappe?.subbedOff).toBe(70);
      const camavinga = detail.home.bench.find((p) => p.shortName === 'Camavinga');
      expect(camavinga?.subbedOn).toBe(70);
    });

    it('leaves badges empty for players with no events', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const maignan = detail.home.starters.find((p) => p.shortName === 'Maignan');
      expect(maignan?.goals).toBe(0);
      expect(maignan?.yellow).toBe(false);
      expect(maignan?.red).toBe(false);
      expect(maignan?.subbedOff).toBeUndefined();
    });
  });

  describe('event relatedName', () => {
    it('sets the substitution relatedName to the player coming on', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const sub = detail.events.find((e) => e.kind === 'substitution');
      expect(sub?.relatedName).toBe('Eduardo Camavinga');
    });

    it('sets the assist relatedName to the scorer it set up', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      const assist = detail.events.find((e) => e.kind === 'assist');
      expect(assist?.relatedName).toBe('Kylian Mbappe');
    });
  });

  describe('derived stats + win probability', () => {
    it('passes BallPossession through to each side', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      expect(detail.homeStats.possession).toBe(58);
      expect(detail.awayStats.possession).toBe(42);
    });

    it('derives shots from "Attempt at Goal" timeline events per side', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      // Fixture timeline: one home attempt (e4); zero away attempts.
      expect(detail.homeStats.shots).toBe(1);
      expect(detail.awayStats.shots).toBe(0);
    });

    it('counts corners/fouls/offsides from the timeline per side', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      // Home: 1 corner (e5), 1 offside (e10). Away: 1 foul (e9).
      expect(detail.homeStats.corners).toBe(1);
      expect(detail.homeStats.offsides).toBe(1);
      expect(detail.awayStats.fouls).toBe(1);
    });

    it('omits stats with no FIFA source — passes/passAccuracy/shotsOnTarget stay null', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      expect(detail.homeStats.passes).toBeNull();
      expect(detail.homeStats.passAccuracy).toBeNull();
      expect(detail.homeStats.shotsOnTarget).toBeNull();
    });

    it('labels the win probability as an estimate (never an unlabeled FIFA figure) when present', () => {
      const detail = mapFifaMatchDetail(live, timeline, REF);
      if (detail.winProbability !== null) {
        expect(detail.winProbability.estimated).toBe(true);
        const { home, draw, away } = detail.winProbability;
        expect(home + draw + away).toBe(100);
      }
    });
  });

  describe('graceful degradation', () => {
    it('returns the EMPTY_MATCH_DETAIL shape (no throw) for null payloads', () => {
      const detail = mapFifaMatchDetail(null, null, REF);
      expect(detail.matchId).toBe('400251');
      expect(detail.events).toEqual([]);
      expect(detail.home.starters).toEqual([]);
      expect(detail.away.starters).toEqual([]);
      expect(detail.winProbability).toBeNull();
    });

    it('tolerates a present live payload with an empty timeline', () => {
      const detail = mapFifaMatchDetail(live, null, REF);
      expect(detail.events).toEqual([]);
      // Lineups still come from the live payload.
      expect(detail.home.formation).toBe('4-3-3');
    });
  });
});
