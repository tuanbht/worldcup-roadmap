import type { MatchEventKind } from '@/domain/types';

/**
 * Single source-of-truth mapping from FIFA `TypeLocalized` labels → domain
 * `MatchEventKind`. Map by label (verified/stable), NEVER by numeric `Type`.
 *
 * Only the labels that become first-class timeline events are mapped here;
 * raw counting labels (Attempt at Goal / Corner / Foul / Offside) intentionally
 * return `null` so they feed stats, not the event list.
 */
const LABEL_TO_KIND: Readonly<Record<string, MatchEventKind>> = {
  'goal!': 'goal',
  goal: 'goal',
  'own goal': 'own-goal',
  assist: 'assist',
  'yellow card': 'yellow',
  'second yellow card': 'second-yellow',
  'red card': 'red',
  substitution: 'substitution',
  var: 'var',
  'start time': 'period',
  'end time': 'period',
};

function normalize(label: string | null | undefined): string {
  return (label ?? '').trim().toLowerCase();
}

/** Map a FIFA `TypeLocalized` label to a domain kind, or `null` when ignored. */
export function labelToKind(typeLocalized: string | null | undefined): MatchEventKind | null {
  const key = normalize(typeLocalized);
  if (!key) return null;
  return LABEL_TO_KIND[key] ?? null;
}

/**
 * Refine a `goal` event into `goal` / `own-goal` / `penalty-goal` from the raw
 * label / qualifier text (e.g. "Own Goal", "Goal! (Penalty)").
 */
export function classifyGoalKind(label: string | null | undefined): MatchEventKind {
  const key = normalize(label);
  if (key.includes('own goal') || key.includes('own-goal')) return 'own-goal';
  if (key.includes('penalty') || key.includes('pen.')) return 'penalty-goal';
  return 'goal';
}
