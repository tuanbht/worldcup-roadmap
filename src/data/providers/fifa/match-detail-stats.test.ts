import { describe, expect, it } from 'vitest';
import { deriveTeamStats, type StatEvent } from './match-detail-stats';

// Synthetic timeline (raw TypeLocalized labels + resolved side). Home gets 3
// attempts, 2 corners, 1 foul, 1 offside, 1 yellow; away gets 1 attempt, 1 red.
const EVENTS: readonly StatEvent[] = [
  { label: 'Attempt at Goal', side: 'home' },
  { label: 'Attempt at Goal', side: 'home' },
  { label: 'Attempt at Goal', side: 'home' },
  { label: 'Corner', side: 'home' },
  { label: 'Corner', side: 'home' },
  { label: 'Foul', side: 'home' },
  { label: 'Offside', side: 'home' },
  { label: 'Yellow card', side: 'home' },
  { label: 'Attempt at Goal', side: 'away' },
  { label: 'Red card', side: 'away' },
];

describe('deriveTeamStats', () => {
  it('counts shots from "Attempt at Goal" events per side', () => {
    expect(deriveTeamStats(EVENTS, 58, 'home').shots).toBe(3);
    expect(deriveTeamStats(EVENTS, 42, 'away').shots).toBe(1);
  });

  it('counts corners, fouls, offsides per side', () => {
    const home = deriveTeamStats(EVENTS, 58, 'home');
    expect(home.corners).toBe(2);
    expect(home.fouls).toBe(1);
    expect(home.offsides).toBe(1);
  });

  it('counts yellow and red cards per side', () => {
    expect(deriveTeamStats(EVENTS, 58, 'home').yellowCards).toBe(1);
    expect(deriveTeamStats(EVENTS, 58, 'home').redCards).toBe(0);
    expect(deriveTeamStats(EVENTS, 42, 'away').yellowCards).toBe(0);
    expect(deriveTeamStats(EVENTS, 42, 'away').redCards).toBe(1);
  });

  it('passes BallPossession straight through', () => {
    expect(deriveTeamStats(EVENTS, 58, 'home').possession).toBe(58);
    expect(deriveTeamStats(EVENTS, 42, 'away').possession).toBe(42);
  });

  it('omits (null) stats with no FIFA source — never fakes 0', () => {
    const home = deriveTeamStats(EVENTS, 58, 'home');
    expect(home.passes).toBeNull();
    expect(home.passAccuracy).toBeNull();
    expect(home.shotsOnTarget).toBeNull();
  });

  it('leaves possession null when none is provided', () => {
    expect(deriveTeamStats(EVENTS, null, 'home').possession).toBeNull();
  });

  it('counts only the requested side, ignoring the other side’s events', () => {
    // Away has 1 attempt + 1 red in the fixture; home counts must not leak them.
    const home = deriveTeamStats(EVENTS, 58, 'home');
    expect(home.shots).toBe(3);
    expect(home.redCards).toBe(0);
  });

  it('returns zeroed counts (not null) for countable stats on an empty timeline', () => {
    const empty = deriveTeamStats([], 50, 'home');
    expect(empty.shots).toBe(0);
    expect(empty.corners).toBe(0);
    expect(empty.fouls).toBe(0);
    expect(empty.offsides).toBe(0);
    expect(empty.yellowCards).toBe(0);
    expect(empty.redCards).toBe(0);
    // Possession is a direct source, still passed through.
    expect(empty.possession).toBe(50);
    // Unsourced stats remain omitted, never faked as 0.
    expect(empty.passes).toBeNull();
    expect(empty.shotsOnTarget).toBeNull();
  });
});
