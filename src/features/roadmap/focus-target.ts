// Pure target-resolution for the "focus current match" canvas control.
//
// The owner's rule, verbatim: "the match with ended estimate time nearest in
// the future". We model each match's wall-clock end as
//   estimatedEnd = kickoffMs + MATCH_DURATION_MS
// keep only candidates that have NOT yet ended (estimatedEnd > now), and pick the
// one whose estimatedEnd is smallest (nearest in the future). A LIVE match's end
// sits just ahead of `now`, so it naturally beats any not-yet-kicked match; when
// nothing is live the next kickoff wins; when every match has ended we return
// null and the button is disabled.
//
// This is the single home for the temporal selection logic — pure, O(n), no clock
// read, no input mutation. The component passes `Date.now()`; tests pass a fixed
// `now`. Kept inside the roadmap feature (domain-specific, not library-ized).
import type { Match } from '@/domain/types';

/**
 * A full match's wall-clock span: 2 x 45' regulation + 15' half-time + a
 * stoppage/cushion allowance, rounded to ~115 minutes. Chosen so a LIVE match's
 * estimatedEnd sits just ahead of `now` (and thus ahead of any not-yet-kicked
 * match), making "live ends soonest" fall out of the minimum-estimatedEnd rule.
 * Any value in the ~100-130 min range yields identical selection for the
 * non-overlapping fixture cadence; the constant keeps it from being a magic number.
 */
export const MATCH_DURATION_MS = 115 * 60 * 1000;

/** Readable single-card zoom and the camera glide duration for a focus click. */
export const FOCUS_ZOOM = 1.1; // within minZoom 0.2 / maxZoom 1.8
export const FOCUS_DURATION_MS = 500; // matches the existing camera DURATION

/**
 * Target = the not-yet-ended match whose estimated end is nearest in the future.
 *
 * estimatedEnd = kickoffMs + MATCH_DURATION_MS; candidates have estimatedEnd > now.
 * Pick the minimum estimatedEnd; tiebreak by kickoff then matchId (lexicographic).
 * Returns the matchId, or null when every match has ended (or the list is empty).
 *
 * Pure: O(n) single pass, never mutates `matches`, never reads the clock itself.
 */
export function pickFocusMatchId(matches: readonly Match[], nowMs: number): string | null {
  let bestId: string | null = null;
  let bestEnd = Infinity;
  let bestKickoff = Infinity;

  for (const match of matches) {
    const kickoffMs = Date.parse(match.kickoff);
    if (Number.isNaN(kickoffMs)) continue; // skip un-parseable kickoffs defensively

    const estimatedEnd = kickoffMs + MATCH_DURATION_MS;
    if (estimatedEnd <= nowMs) continue; // already ended — not a candidate

    if (isBetterCandidate(estimatedEnd, kickoffMs, match.id, bestEnd, bestKickoff, bestId)) {
      bestId = match.id;
      bestEnd = estimatedEnd;
      bestKickoff = kickoffMs;
    }
  }

  return bestId;
}

/**
 * True when `(end, kickoff, id)` should replace the running best. Ordering:
 * smaller estimatedEnd wins; on a tie, earlier kickoff; on a further tie, the
 * lexicographically smaller id. (Same kickoff implies same end, so the id tiebreak
 * only fires when both end and kickoff already match.)
 */
function isBetterCandidate(
  end: number,
  kickoff: number,
  id: string,
  bestEnd: number,
  bestKickoff: number,
  bestId: string | null,
): boolean {
  if (bestId === null) return true;
  if (end !== bestEnd) return end < bestEnd;
  if (kickoff !== bestKickoff) return kickoff < bestKickoff;
  return id < bestId;
}
