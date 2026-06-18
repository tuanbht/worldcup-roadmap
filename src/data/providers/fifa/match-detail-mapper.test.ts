import { describe, expect, it } from 'vitest';
import { mapFifaMatchDetail } from './match-detail-mapper';
import {
  buildDetail,
  FACTS,
  parseLive,
  parseTimeline,
  rawLabelCount,
  REF,
} from './__fixtures__/match-detail.support';

/**
 * Asserts the mapper against the REAL captured FIFA payloads
 * (match 400021443 — Mexico v South Africa, 2026-06-11).
 *
 * Ground-truth facts live in `__fixtures__/match-detail.support.ts` (FACTS) so a
 * single edit re-points both this spec and the integration spec. Player names use
 * the FIFA `ShortName` the panel renders — notably 356731 shows "RAÚL" even
 * though its formal `PlayerName` is "Raul JIMENEZ", so the mapper MUST resolve
 * the display ShortName, not the long name.
 *
 * Fixtures are byte-copies of docs/fifa-real-payloads/*. No live FIFA access.
 */

describe('mapFifaMatchDetail (real captured payloads)', () => {
  it('returns a MatchDetail keyed by the ref matchId', () => {
    expect(buildDetail().matchId).toBe(FACTS.matchId);
  });

  describe('events (mapped by TypeLocalized label)', () => {
    it('produces a populated event list far smaller than the raw 80 events', () => {
      const { events } = buildDetail();
      // Some events map (counting labels are stripped), but never all 80.
      expect(events.length).toBeGreaterThan(0);
      expect(events.length).toBeLessThan(FACTS.rawEventCount);
    });

    it('maps both home goals with minute, side and a lineup-resolved ShortName', () => {
      const goals = buildDetail().events.filter((e) => e.kind === 'goal');
      expect(goals).toHaveLength(FACTS.home.goals.length);
      // Both goals belong to Mexico (home).
      expect(goals.every((g) => g.side === 'home')).toBe(true);
      expect(goals.map((g) => g.minute).sort((a, b) => a - b)).toEqual(
        FACTS.home.goals.map((g) => g.minute),
      );
      // Each scorer name resolves from the lineup (real events carry no PlayerName).
      for (const expected of FACTS.home.goals) {
        const goal = goals.find((g) => g.minute === expected.minute);
        expect(goal, `goal at ${expected.minute}'`).toBeDefined();
        expect(goal!.playerName).toContain(expected.name);
      }
    });

    it('maps the home yellow card to GUTIERREZ at the 23rd minute', () => {
      const { minute, name } = FACTS.home.yellowCard;
      const yellow = buildDetail().events.find((e) => e.kind === 'yellow' && e.minute === minute);
      expect(yellow).toBeDefined();
      expect(yellow!.side).toBe('home');
      expect(yellow!.playerName).toContain(name);
    });

    it('parses a stoppage-time minute to its base ("90\'+2\'" → 90) for the Montes red', () => {
      const reds = buildDetail().events.filter((e) => e.kind === 'red');
      const montes = reds.find((e) => e.side === 'home');
      expect(montes).toBeDefined();
      // "90'+2'" must collapse to the base minute 90, not 92.
      expect(montes!.minute).toBe(FACTS.home.secondYellowRed.minute);
      expect(montes!.playerName).toContain(FACTS.home.secondYellowRed.name);
    });

    it("maps both away red cards (SITHOLE 49', ZWANE 84') to the away side", () => {
      const reds = buildDetail().events.filter((e) => e.kind === 'red');
      for (const expected of FACTS.away.reds) {
        const red = reds.find((e) => e.minute === expected.minute);
        expect(red, `red at ${expected.minute}'`).toBeDefined();
        expect(red!.side).toBe('away');
        expect(red!.playerName).toContain(expected.name);
      }
    });

    it('maps a substitution naming the player OFF and the player coming ON', () => {
      const subs = buildDetail().events.filter((e) => e.kind === 'substitution');
      // 9 raw "Substitution" timeline events all map (none are counting labels).
      expect(subs).toHaveLength(rawLabelCount('Substitution'));
      // GUTIERREZ off → Luis CHAVEZ on: the event names the OFF player and points
      // at the ON player via relatedName (from live Substitutions[].PlayerOnName).
      const gutierrezOff = subs.find((e) => e.playerName?.includes(FACTS.home.sub.offName));
      expect(gutierrezOff).toBeDefined();
      expect(gutierrezOff!.side).toBe('home');
      expect(gutierrezOff!.relatedName).toContain(FACTS.home.sub.onName);
    });

    it("maps the single VAR event (82', no team) into the timeline", () => {
      const varEvents = buildDetail().events.filter((e) => e.kind === 'var');
      expect(varEvents).toHaveLength(1);
      expect(varEvents[0]!.minute).toBe(FACTS.varMinute);
    });

    it('maps both assists to home with relatedName = the paired scorer ShortName', () => {
      const assists = buildDetail().events.filter((e) => e.kind === 'assist');
      expect(assists).toHaveLength(FACTS.home.goals.length);
      expect(assists.every((a) => a.side === 'home')).toBe(true);
      // Each assist pairs with the adjacent same-minute, same-side Goal! scorer.
      for (const goal of FACTS.home.goals) {
        const assist = assists.find((a) => a.minute === goal.minute);
        expect(assist, `assist at ${goal.minute}'`).toBeDefined();
        expect(assist!.relatedName).toContain(goal.name);
      }
    });

    it('drops counting/ignored labels — only domain kinds reach the event list', () => {
      const events = buildDetail().events;
      const allowed = new Set([
        'goal',
        'own-goal',
        'penalty-goal',
        'assist',
        'yellow',
        'red',
        'second-yellow',
        'substitution',
        'var',
        'period',
      ]);
      expect(events.every((e) => allowed.has(e.kind))).toBe(true);
      // "Attempt at Goal" exists in the raw payload yet never becomes an event.
      expect(rawLabelCount('Attempt at Goal')).toBeGreaterThan(0);
      expect(events.some((e) => (e.kind as string) === 'attempt')).toBe(false);
    });

    it('orders events chronologically by minute', () => {
      const minutes = buildDetail().events.map((e) => e.minute);
      expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    });
  });

  describe('lineups', () => {
    it('reads the formation (Tactics) for each side', () => {
      const detail = buildDetail();
      expect(detail.home.formation).toBe(FACTS.home.formation);
      expect(detail.away.formation).toBe(FACTS.away.formation);
    });

    it('reads the head coach (Role 0) for each side, not Coaches[0]', () => {
      const detail = buildDetail();
      // Mexico lists assistant Rafael MARQUEZ (Role 1) FIRST — Coaches[0] is wrong.
      expect(detail.home.coach).toBe(FACTS.home.coach);
      expect(detail.away.coach).toBe(FACTS.away.coach);
    });

    it('splits exactly 11 starters from 15 bench by Status === 1', () => {
      const detail = buildDetail();
      expect(detail.home.starters).toHaveLength(FACTS.home.starters);
      expect(detail.away.starters).toHaveLength(FACTS.away.starters);
      expect(detail.home.bench).toHaveLength(FACTS.home.bench);
      expect(detail.away.bench).toHaveLength(FACTS.away.bench);
    });

    it('flags the captain on each side with their shirt number', () => {
      const detail = buildDetail();
      const homeCaptain = detail.home.starters.find((p) => p.isCaptain);
      expect(homeCaptain?.id).toBe(FACTS.home.captain.id);
      expect(homeCaptain?.name).toContain(FACTS.home.captain.name);
      expect(homeCaptain?.shirtNumber).toBe(FACTS.home.captain.shirtNumber);

      const awayCaptain = detail.away.starters.find((p) => p.isCaptain);
      expect(awayCaptain?.id).toBe(FACTS.away.captain.id);
      expect(awayCaptain?.name).toContain(FACTS.away.captain.name);
    });

    it('exposes exactly one captain per side', () => {
      const detail = buildDetail();
      expect(detail.home.starters.filter((p) => p.isCaptain)).toHaveLength(1);
      expect(detail.away.starters.filter((p) => p.isCaptain)).toHaveLength(1);
    });

    it('passes a real digitalhub headshot photoUrl through for the keeper', () => {
      const keeper = buildDetail().home.starters.find((p) => p.id === FACTS.home.keeper.id);
      expect(keeper?.photoUrl).toContain('digitalhub.fifa.com');
    });

    it('orders positionIndex by line so the goalkeeper (Position 0) sorts first', () => {
      const starters = [...buildDetail().home.starters].sort(
        (a, b) => a.positionIndex - b.positionIndex,
      );
      // Raul RANGEL (Position 0, shirt 1) is the keeper → lowest positionIndex,
      // and must sort strictly before every outfield player (line-major order),
      // even where a defender wears a lower shirt number.
      expect(starters[0]?.id).toBe(FACTS.home.keeper.id);
      expect(starters[0]?.name).toContain(FACTS.home.keeper.name);
      expect(starters[0]!.positionIndex).toBeLessThan(starters[10]!.positionIndex);
    });
  });

  describe('player badges (from per-team live Goals/Bookings/Substitutions)', () => {
    it('credits every per-team Goals scorer despite Goal.Type === 2', () => {
      const detail = buildDetail();
      // Both legit Mexico goals carry Type 2 in the live payload — must NOT be
      // treated as own goals and dropped from the scorer tally.
      for (const goal of FACTS.home.goals) {
        const scorer = detail.home.starters.find((p) => p.id === goal.id);
        expect(scorer?.goals, `goals for ${goal.name}`).toBe(1);
      }
    });

    it('flags the yellow card on the booked home player', () => {
      const gutierrez = buildDetail().home.starters.find((p) => p.id === FACTS.home.yellowCard.id);
      expect(gutierrez?.yellow).toBe(true);
    });

    it('flags the captain red (second yellow, Card 2) from the per-team bookings', () => {
      const montes = buildDetail().home.starters.find(
        (p) => p.id === FACTS.home.secondYellowRed.id,
      );
      expect(montes?.red).toBe(true);
    });

    it('records the minute a player was subbed off', () => {
      const gutierrez = buildDetail().home.starters.find((p) => p.id === FACTS.home.sub.offId);
      expect(gutierrez?.subbedOff).toBe(FACTS.home.sub.minute);
    });

    it('leaves every badge empty for an uninvolved player (the keeper)', () => {
      const keeper = buildDetail().home.starters.find((p) => p.id === FACTS.home.keeper.id);
      expect(keeper?.goals).toBe(0);
      expect(keeper?.yellow).toBe(false);
      expect(keeper?.red).toBe(false);
      expect(keeper?.subbedOff).toBeUndefined();
    });
  });

  describe('derived stats + possession', () => {
    it('omits possession (BallPossession null, TerritorialPossesion null) → null', () => {
      const detail = buildDetail();
      expect(detail.homeStats.possession).toBe(FACTS.possession);
      expect(detail.awayStats.possession).toBe(FACTS.possession);
    });

    it('derives shots from "Attempt at Goal" timeline events per side', () => {
      const detail = buildDetail();
      expect(detail.homeStats.shots).toBe(FACTS.home.stats.shots);
      expect(detail.awayStats.shots).toBe(FACTS.away.stats.shots);
    });

    it('counts corners/fouls/offsides from the timeline per side', () => {
      const detail = buildDetail();
      expect(detail.homeStats.corners).toBe(FACTS.home.stats.corners);
      expect(detail.awayStats.corners).toBe(FACTS.away.stats.corners);
      expect(detail.homeStats.fouls).toBe(FACTS.home.stats.fouls);
      expect(detail.awayStats.fouls).toBe(FACTS.away.stats.fouls);
      expect(detail.homeStats.offsides).toBe(FACTS.home.stats.offsides);
      expect(detail.awayStats.offsides).toBe(FACTS.away.stats.offsides);
    });

    it('omits stats with no FIFA source — passes/passAccuracy/shotsOnTarget stay null', () => {
      const detail = buildDetail();
      expect(detail.homeStats.passes).toBeNull();
      expect(detail.homeStats.passAccuracy).toBeNull();
      expect(detail.homeStats.shotsOnTarget).toBeNull();
    });

    it('labels win probability as an estimate summing to 100 (or omits it)', () => {
      const { winProbability } = buildDetail();
      if (winProbability !== null) {
        expect(winProbability.estimated).toBe(true);
        const { home, draw, away } = winProbability;
        expect(home + draw + away).toBe(100);
      }
    });
  });

  describe('graceful degradation', () => {
    it('returns the EMPTY_MATCH_DETAIL shape (no throw) for null payloads', () => {
      const detail = mapFifaMatchDetail(null, null, REF);
      expect(detail.matchId).toBe(FACTS.matchId);
      expect(detail.events).toEqual([]);
      expect(detail.home.starters).toEqual([]);
      expect(detail.away.starters).toEqual([]);
      expect(detail.winProbability).toBeNull();
    });

    it('populates lineups even when the timeline is missing (live only)', () => {
      const detail = mapFifaMatchDetail(parseLive(), null, REF);
      expect(detail.events).toEqual([]);
      expect(detail.home.formation).toBe(FACTS.home.formation);
      expect(detail.home.starters).toHaveLength(FACTS.home.starters);
    });

    it('drops every event when the live payload is missing (no side to resolve)', () => {
      // Timeline events only carry an IdTeam — without the live HomeTeam/AwayTeam
      // ids there is no way to label home/away, so events are degraded to [] (the
      // panel shows no timeline) rather than guessing or crashing.
      const detail = mapFifaMatchDetail(null, parseTimeline(), REF);
      expect(detail.events).toEqual([]);
      expect(detail.home.starters).toEqual([]);
      expect(detail.away.starters).toEqual([]);
    });
  });
});
