import { describe, expect, it } from 'vitest';
// AF-7: the event-assembly pipeline must move OUT of match-detail-mapper.stats.ts
// into a single-responsibility match-detail-mapper.events.ts (each module <=200
// lines). `buildMatchEvents` is the events pipeline's only export and must be
// importable from the NEW module after the split.
//
// RED until match-detail-mapper.events.ts exists and exports buildMatchEvents.
// This is a STRUCTURAL guard that pins WHERE the function lives so the split is
// real, not a copy. Byte-for-byte BEHAVIOUR identity is locked separately by the
// untouched match-detail-mapper.snapshot.test.ts round-trip snapshot + the
// exhaustive match-detail-mapper.test.ts fact suite, both of which must stay
// green UNCHANGED through the move.
import { buildMatchEvents } from './match-detail-mapper.events';
import { makeSideResolver } from './match-detail-mapper.shared';
import { parseLive, parseTimeline, FACTS } from './__fixtures__/match-detail.support';
import type { RawEvent } from './match-detail-mapper.shared';

describe('match-detail-mapper.events (AF-7 module split)', () => {
  it('exposes buildMatchEvents from the new events module', () => {
    expect(typeof buildMatchEvents).toBe('function');
  });

  it('builds the same chronologically-ordered, side-resolved events from the real payload', () => {
    // Drive the extracted pipeline directly (not through the orchestrator) so the
    // move is proven to carry its full behaviour, identical to before the split.
    const live = parseLive();
    const timeline = parseTimeline();
    const resolveSide = makeSideResolver(live);
    const lineupNames = new Map<string, string>();
    for (const squad of [live.HomeTeam, live.AwayTeam]) {
      for (const p of squad?.Players ?? []) {
        const id = p?.IdPlayer;
        const name = p?.ShortName?.[0]?.Description ?? p?.PlayerName?.[0]?.Description;
        if (id && name) lineupNames.set(id, name);
      }
    }
    const rawEvents = (timeline.Event ?? []).filter((e): e is RawEvent => e != null);
    const hasSides = live.HomeTeam?.IdTeam != null || live.AwayTeam?.IdTeam != null;

    const events = buildMatchEvents(rawEvents, resolveSide, lineupNames, live, hasSides);

    // Real domain events are produced, fewer than the raw 80, ordered by minute.
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThan(FACTS.rawEventCount);
    const minutes = events.map((e) => e.minute);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    // Both home goals surface with the home side resolved (the side resolver
    // wiring survived the extraction).
    const goals = events.filter((e) => e.kind === 'goal');
    expect(goals).toHaveLength(FACTS.home.goals.length);
    expect(goals.every((g) => g.side === 'home')).toBe(true);
  });
});
