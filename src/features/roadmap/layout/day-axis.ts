import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { resolveTimeZone } from '@/lib/datetime';
import type { Match } from '@/domain/types';

/**
 * Shared day axis for the timeline grid. Every node (group + knockout) reads its
 * row from here, so group and knockout sit on ONE continuous chronological axis.
 *
 * The day key is a `'yyyy-MM-dd'` string computed in the resolved zone — the SAME
 * zone the `lib/datetime` façade renders the card time + date pill in (default:
 * the viewer's local zone; an explicit `tz` overrides). Lexically ==
 * chronologically sortable WITHIN one zone, so grouping == label == card time.
 * It uses `date-fns-tz`'s `formatInTimeZone` (not `lib/datetime`'s `formatDate`,
 * whose `'dd MMM'` shape is NOT sortable), routing the zone through the façade's
 * `resolveTimeZone` so no hand-rolled offset math is introduced. Pure, O(n) + one
 * sort.
 */

const DAY_FMT = 'yyyy-MM-dd';

/**
 * Sortable `'yyyy-MM-dd'` calendar key in the resolved zone. With no `tz` the
 * zone defaults to the viewer's local zone via `resolveTimeZone(undefined)`,
 * mirroring the `lib/datetime` façade so the grouping day matches the card's
 * rendered kickoff date; an explicit `tz` (e.g. `'UTC'`, `'Asia/Bangkok'`)
 * overrides. The conversion is `formatInTimeZone` only — no `iso.slice(0, 10)`,
 * no offset arithmetic.
 */
export function dayKey(iso: string, tz?: string): string {
  return formatInTimeZone(parseISO(iso), resolveTimeZone(tz), DAY_FMT);
}

/** Distinct calendar days across all matches, ascending. */
export function orderedDays(matches: readonly Match[], tz?: string): readonly string[] {
  const days = new Set<string>();
  for (const match of matches) days.add(dayKey(match.kickoff, tz));
  return [...days].sort();
}

/** Distinct calendar days sorted ascending -> 0-based row index per dayKey. */
export function computeDayIndex(
  matches: readonly Match[],
  tz?: string,
): ReadonlyMap<string, number> {
  const index = new Map<string, number>();
  orderedDays(matches, tz).forEach((day, i) => index.set(day, i));
  return index;
}
