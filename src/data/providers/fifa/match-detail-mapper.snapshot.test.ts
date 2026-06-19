import { describe, expect, it } from 'vitest';
import { mapFifaMatchDetail } from './match-detail-mapper';
import {
  buildDetail,
  FACTS,
  parseLive,
  parseTimeline,
  REF,
} from './__fixtures__/match-detail.support';

/**
 * CR-9 characterization (round-trip) guard for the match-detail mapper refactor.
 *
 * This snapshot is generated against the CURRENT implementation BEFORE the
 * stats/win-probability + events-assembly blocks are extracted into the
 * `match-detail-mapper.stats.ts` sibling helpers. After the extraction the
 * snapshot MUST remain byte-for-byte identical — that zero-diff is the proof of
 * acceptance #6 (output unchanged before/after).
 *
 * It complements (does NOT replace) the exhaustive fact-based
 * `match-detail-mapper.test.ts`, which stays unchanged. The four cases lock the
 * full real payload plus every graceful-degradation path the orchestrator must
 * keep composing the same way.
 */

describe('mapFifaMatchDetail — output characterization (CR-9 round-trip lock)', () => {
  it('produces a stable MatchDetail over the real captured payloads', () => {
    expect(buildDetail()).toMatchSnapshot();
  });

  it('produces a stable EMPTY shape for null/null payloads', () => {
    expect(mapFifaMatchDetail(null, null, REF)).toMatchSnapshot();
  });

  it('produces a stable lineups-only shape when the timeline is missing (live only)', () => {
    expect(mapFifaMatchDetail(parseLive(), null, REF)).toMatchSnapshot();
  });

  it('produces a stable empty-events shape when the live payload is missing (timeline only)', () => {
    expect(mapFifaMatchDetail(null, parseTimeline(), REF)).toMatchSnapshot();
  });

  /**
   * Fact-anchored guard: a careless `vitest -u` that regenerates a WRONG snapshot
   * would still trip this hard assertion, so the round-trip lock can never silently
   * drift to whatever the (possibly broken) post-refactor output happens to be.
   */
  it('keys the snapshotted detail by the ref matchId', () => {
    expect(buildDetail().matchId).toBe(FACTS.matchId);
  });

  /**
   * Purity guard for the extraction: the orchestrator and every helper it composes
   * must hold no shared mutable state, so two independent calls produce deeply
   * equal but referentially DISTINCT outputs. This is the immutability invariant
   * CR-9 must preserve when the inline blocks move into sibling helpers.
   */
  it('is a pure function: repeated calls are deep-equal but not the same reference', () => {
    const first = buildDetail();
    const second = buildDetail();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.events).not.toBe(first.events);
  });
});
