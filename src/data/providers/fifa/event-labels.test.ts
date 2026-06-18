import { describe, expect, it } from 'vitest';
import { classifyGoalKind, labelToKind } from './event-labels';

// Maps FIFA `TypeLocalized` LABELS (verified/stable) → domain MatchEventKind.
// NEVER maps numeric `Type` codes (undocumented/unstable). Labels below are the
// real ones captured from match 400021443 (docs/fifa-real-payloads/timeline.sample.json).
describe('labelToKind', () => {
  it.each([
    ['Goal!', 'goal'],
    ['Assist', 'assist'],
    ['Yellow card', 'yellow'],
    ['Second yellow card', 'second-yellow'],
    ['Red card', 'red'],
    ['Substitution', 'substitution'],
    ['VAR', 'var'],
    ['Start Time', 'period'],
    ['End Time', 'period'],
  ])('maps the real label %s to kind %s', (label, kind) => {
    expect(labelToKind(label)).toBe(kind);
  });

  // "Match end" (Type 26) is in the real payload but carries no team and adds
  // noise as a chip → mapped to null (must never crash). Deterministic assertion.
  it('maps "Match end" to null (carries no team — kept out of the event list)', () => {
    expect(labelToKind('Match end')).toBeNull();
  });

  // Counting / ignored labels feed stats (or nothing), never the timeline list.
  it.each([
    'Attempt at Goal',
    'Corner',
    'Foul',
    'Offside',
    'Goal Prevention',
    'Coin Toss',
    'Delay',
    'Resume',
  ])('returns null for the counting/ignored label %s', (label) => {
    expect(labelToKind(label)).toBeNull();
  });

  it('returns null for an unrecognized future label (ignored, not crash)', () => {
    expect(labelToKind('Some Future Label')).toBeNull();
  });

  it('returns null for null/undefined/empty input', () => {
    expect(labelToKind(null)).toBeNull();
    expect(labelToKind(undefined)).toBeNull();
    expect(labelToKind('')).toBeNull();
  });
});

describe('classifyGoalKind', () => {
  it('classifies a plain goal as "goal" (the real sample has only plain goals)', () => {
    expect(classifyGoalKind('Goal!')).toBe('goal');
  });

  it.each(['Own Goal', 'own-goal', 'OWN GOAL'])(
    'classifies "%s" as "own-goal" regardless of case/hyphenation',
    (label) => {
      expect(classifyGoalKind(label)).toBe('own-goal');
    },
  );

  it.each(['Goal! (Penalty)', 'Penalty goal', 'Goal (pen.)'])(
    'classifies "%s" as "penalty-goal" from the qualifier text',
    (label) => {
      expect(classifyGoalKind(label)).toBe('penalty-goal');
    },
  );

  it('falls back to plain "goal" for null/undefined/empty (never crashes)', () => {
    expect(classifyGoalKind(null)).toBe('goal');
    expect(classifyGoalKind(undefined)).toBe('goal');
    expect(classifyGoalKind('')).toBe('goal');
  });
});
