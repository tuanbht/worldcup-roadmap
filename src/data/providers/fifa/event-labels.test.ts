import { describe, expect, it } from 'vitest';
import { classifyGoalKind, labelToKind } from './event-labels';

// Maps FIFA `TypeLocalized` LABELS (verified/stable) → domain MatchEventKind.
// NEVER maps numeric `Type` codes (undocumented/unstable). AC8.
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
  ])('maps the label %s to kind %s', (label, kind) => {
    expect(labelToKind(label)).toBe(kind);
  });

  it('returns null for an unrecognized label (ignored, not crash)', () => {
    expect(labelToKind('Attempt at Goal')).toBeNull();
    expect(labelToKind('Corner')).toBeNull();
    expect(labelToKind('Some Future Label')).toBeNull();
  });

  it('returns null for null/undefined/empty input', () => {
    expect(labelToKind(null)).toBeNull();
    expect(labelToKind(undefined)).toBeNull();
    expect(labelToKind('')).toBeNull();
  });
});

describe('classifyGoalKind', () => {
  it('classifies a plain goal as "goal"', () => {
    expect(classifyGoalKind('Goal!')).toBe('goal');
  });

  it('classifies an own goal as "own-goal"', () => {
    expect(classifyGoalKind('Own Goal')).toBe('own-goal');
  });

  it('classifies a penalty goal as "penalty-goal"', () => {
    expect(classifyGoalKind('Goal! (Penalty)')).toBe('penalty-goal');
  });
});
