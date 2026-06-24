// Shared, deterministic team fixtures for the match-card team-row specs
// (TeamRow.test.tsx + the MatchNode no-mis-tap block). Both surfaces render the
// SAME `TeamRow` control, so the two distinct teams live here once instead of
// being copy-pasted per spec — mirroring `standings-fixtures.ts`.
//
// The two teams are DISTINCT in id, name AND code so a transposed home<->away
// wiring (the no-mis-tap defect this requirement guards) is caught: a test that
// expects `team-arg` but receives `team-fra` fails loudly. `flagUrl: null` keeps
// the render deterministic — the `<Flag>` falls back to the code monogram
// (`ARG`/`FRA`), an `aria-hidden` <span> with no async <img> load. Pure data —
// no DOM, no React, no assertions; kept under __test-support__ so it is excluded
// from coverage and never collected as a test.
import type { Team } from '@/domain/types';

/** Resolved HOME team in the canonical fixture (home=ARG). */
export const ARG: Team = { id: 'team-arg', name: 'Argentina', code: 'ARG', flagUrl: null };

/** Resolved AWAY team in the canonical fixture (away=FRA) — distinct on every field. */
export const FRA: Team = { id: 'team-fra', name: 'France', code: 'FRA', flagUrl: null };

/** The accessible name the focus control preserves for `team` (AT + selector contract). */
export function focusLabel(team: Team): string {
  return `Show matches for ${team.name}`;
}
