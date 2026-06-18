import { describe, expect, it } from 'vitest';
import {
  buildDetail,
  FACTS,
  liveFixture,
  parseLive,
  parseTimeline,
  timelineFixture,
} from './__fixtures__/match-detail.support';

/**
 * END-TO-END proof that the match-detail sidebar FILLS from the REAL FIFA
 * payloads. Regression guard for the root cause: the schema USED to reject the
 * live shape (parse threw → section null → empty panel). Here the captured
 * payloads must (a) validate at the lenient zod boundary without throwing and
 * (b) map to a POPULATED MatchDetail.
 *
 * Per-field correctness lives in match-detail-mapper.test.ts; this spec is the
 * coarse "does the sidebar fill end-to-end" contract over the production path.
 * Fixtures are byte-copies of docs/fifa-real-payloads/* (match 400021443). No
 * live FIFA network access.
 */

describe('match-detail integration (real captured payloads → populated MatchDetail)', () => {
  describe('schema accepts the real payload (the core regression fix)', () => {
    it('parses the real /live/football payload without throwing', () => {
      expect(() => parseLive()).not.toThrow();
    });

    it('parses the real /timelines payload without throwing', () => {
      expect(() => parseTimeline()).not.toThrow();
    });

    it('keeps both BallPossession and TerritorialPossesion null (no faked figure)', () => {
      const parsed = parseLive();
      expect(parsed.BallPossession).toBeNull();
      // TerritorialPossesion (FIFA's one-'s' spelling) survives via passthrough.
      expect((parsed as { TerritorialPossesion?: unknown }).TerritorialPossesion).toBeNull();
    });

    it('preserves unknown/extra real top-level fields via passthrough', () => {
      // These appear in the real /live payload and must never cause a rejection.
      const live = parseLive() as Record<string, unknown>;
      expect(live.Officials).toBeDefined();
      expect(live.Stadium).toBeDefined();
      expect(live.Weather).toBeDefined();
    });

    it('preserves unknown/extra real per-event fields via passthrough', () => {
      const timeline = parseTimeline() as { Event?: Record<string, unknown>[] };
      const firstEvent = timeline.Event?.[0] ?? {};
      // PositionX/Y, IdSubTeam, Qualifiers etc. survive on each event.
      expect(firstEvent.Qualifiers).toBeDefined();
    });

    it('parses without mutating the raw imported fixtures', () => {
      // zod returns a fresh object; the shared JSON imports stay byte-identical so
      // other specs reading the raw fixtures see the original payload.
      expect((liveFixture as { IdMatch: string }).IdMatch).toBe(FACTS.matchId);
      expect((timelineFixture as { Event: unknown[] }).Event).toHaveLength(FACTS.rawEventCount);
    });
  });

  describe('mapper yields a populated MatchDetail (the sidebar-fills proof)', () => {
    it('keys the detail by the real matchId', () => {
      expect(buildDetail().matchId).toBe(FACTS.matchId);
    });

    it('fills the three sidebar tabs at once: events, lineups and stats', () => {
      const detail = buildDetail();
      // Timeline tab.
      expect(detail.events.length).toBeGreaterThan(0);
      // Lineups tab.
      expect(detail.home.starters).toHaveLength(FACTS.home.starters);
      expect(detail.away.starters).toHaveLength(FACTS.away.starters);
      expect(detail.home.formation).toBe(FACTS.home.formation);
      expect(detail.away.formation).toBe(FACTS.away.formation);
      // Stats tab (derived numbers, not null).
      expect(detail.homeStats.shots).toBe(FACTS.home.stats.shots);
      expect(detail.homeStats.fouls).toBe(FACTS.home.stats.fouls);
    });

    it('maps at least one goal AND at least one card with a resolved scorer name', () => {
      const detail = buildDetail();
      const goal = detail.events.find((e) => e.kind === 'goal');
      const card = detail.events.find((e) => e.kind === 'yellow' || e.kind === 'red');
      expect(goal, 'a goal event').toBeDefined();
      expect(card, 'a card event').toBeDefined();
      // The scorer name resolves from the lineup map (events carry no PlayerName).
      expect(goal!.playerName).not.toBeNull();
      expect(goal!.playerName!.length).toBeGreaterThan(0);
    });

    it('reads both head coaches (Role 0) — never Coaches[0]', () => {
      const detail = buildDetail();
      expect(detail.home.coach).toBe(FACTS.home.coach);
      expect(detail.away.coach).toBe(FACTS.away.coach);
    });

    it('omits possession (null) rather than faking it (both raw sources null)', () => {
      const detail = buildDetail();
      expect(detail.homeStats.possession).toBe(FACTS.possession);
      expect(detail.awayStats.possession).toBe(FACTS.possession);
    });
  });
});
