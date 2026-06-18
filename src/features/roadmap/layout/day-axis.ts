import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import type { Match } from '@/domain/types';

/**
 * Shared day axis for the timeline grid. Every node (group + knockout) reads its
 * row from here, so group and knockout sit on ONE continuous chronological axis.
 *
 * The day key is a UTC `'yyyy-MM-dd'` string, which is lexically == chronologically
 * sortable. It is derived locally (date-fns-tz against 'UTC') rather than via
 * `lib/datetime`'s `formatDate` (whose `'dd MMM'` shape is NOT sortable), keeping
 * `lib/datetime.ts` untouched. Pure, O(n) + one sort.
 */

/** Zone the calendar day is computed against — matches `lib/datetime`'s zone. */
const DAY_ZONE = 'UTC';
const DAY_FMT = 'yyyy-MM-dd';

/** UTC 'yyyy-MM-dd' calendar key — lexically == chronologically sortable. */
export function dayKey(iso: string): string {
  return formatInTimeZone(parseISO(iso), DAY_ZONE, DAY_FMT);
}

/** Distinct calendar days across all matches, ascending. */
export function orderedDays(matches: readonly Match[]): readonly string[] {
  const days = new Set<string>();
  for (const match of matches) days.add(dayKey(match.kickoff));
  return [...days].sort();
}

/** Distinct calendar days sorted ascending -> 0-based row index per dayKey. */
export function computeDayIndex(matches: readonly Match[]): ReadonlyMap<string, number> {
  const index = new Map<string, number>();
  orderedDays(matches).forEach((day, i) => index.set(day, i));
  return index;
}
