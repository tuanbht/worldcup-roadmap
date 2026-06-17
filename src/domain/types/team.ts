/**
 * Team identity. A bracket slot may not yet have a concrete team (the winner of
 * an unplayed feeder match), so consumers use `TeamRef` rather than `Team` directly.
 */
export interface Team {
  readonly id: string;
  /** Full display name, e.g. "Argentina". */
  readonly name: string;
  /** FIFA 3-letter code, e.g. "ARG". Null when unknown. */
  readonly code: string | null;
  /** Absolute flag image URL. Null when unavailable. */
  readonly flagUrl: string | null;
}

/** A resolved team, or a placeholder label like "Winner M49" / "1A". */
export type TeamRef =
  | { readonly kind: 'team'; readonly team: Team }
  | { readonly kind: 'placeholder'; readonly label: string };

export function teamRef(team: Team): TeamRef {
  return { kind: 'team', team };
}

export function placeholderRef(label: string): TeamRef {
  return { kind: 'placeholder', label };
}

export function isResolved(ref: TeamRef): ref is { kind: 'team'; team: Team } {
  return ref.kind === 'team';
}

/** Short label for a team reference, resolved or not. */
export function refLabel(ref: TeamRef): string {
  return ref.kind === 'team' ? ref.team.name : ref.label;
}
