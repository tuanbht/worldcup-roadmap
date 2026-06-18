/**
 * Single date/timezone façade for the app. All kickoff/timezone rendering routes
 * through here (per the library-first stack policy: one date lib, no hand-rolled
 * `Intl.DateTimeFormat`). Wraps `date-fns` `parseISO` + `date-fns-tz`
 * `formatInTimeZone`. By default it renders in the viewer's LOCAL zone (their
 * browser timezone); pass an explicit `tz` to pin a zone (tests/E2E do this for
 * determinism).
 *
 * Pure formatting (no React, no ambient clock, no `new Date()`); the only ambient
 * read is the runtime's local IANA zone, used as the default.
 */
import { parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';

/** Fallback IANA zone when the runtime can't resolve a local one (non-browser or
 *  locked-down environment). */
const FALLBACK_TZ = 'UTC';

/** The viewer's own IANA time zone (their browser/runtime local zone), so each
 *  match's kickoff renders in the user's timezone. Degrades to `FALLBACK_TZ` when
 *  the runtime can't resolve one. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TZ;
  } catch {
    return FALLBACK_TZ;
  }
}

/** Display shapes mirroring the prior `Intl` output (`dd MMM, HH:mm`, etc.). */
const FMT_DATETIME = 'dd MMM, HH:mm'; // e.g. "02 Jun, 14:30"
const FMT_TIME = 'HH:mm'; // e.g. "14:30"
const FMT_DATE = 'dd MMM'; // e.g. "02 Jun"

/** Per-shape fallback when the ISO input is missing or unparseable. */
const FALLBACK_DATETIME = 'Date TBD';
const FALLBACK_TIME = '--:--';
const FALLBACK_DATE = 'TBD';

/** Resolve the effective IANA zone: an explicit value wins, else the viewer's
 *  local zone. */
export function resolveTimeZone(explicit?: string): string {
  return explicit ?? localTimeZone();
}

/**
 * Format an ISO-UTC instant in the resolved zone with the given token, or return
 * `fallback` when the input is null/empty/whitespace/unparseable. Explicit error
 * handling: every boundary failure degrades to the human-readable fallback
 * instead of throwing into the render tree.
 */
function formatIso(
  iso: string | null,
  tz: string | undefined,
  fmt: string,
  fallback: string,
): string {
  if (!iso || !iso.trim()) return fallback;
  const instant = parseISO(iso);
  if (Number.isNaN(instant.getTime())) return fallback;
  return formatInTimeZone(instant, resolveTimeZone(tz), fmt, { locale: enUS });
}

/** Compact date + time, e.g. `"02 Jun, 14:30"`. Null/invalid → `"Date TBD"`. */
export function formatDateTime(iso: string | null, tz?: string): string {
  return formatIso(iso, tz, FMT_DATETIME, FALLBACK_DATETIME);
}

/** Time only, e.g. `"14:30"`. Null/invalid → `"--:--"`. */
export function formatTime(iso: string | null, tz?: string): string {
  return formatIso(iso, tz, FMT_TIME, FALLBACK_TIME);
}

/** Date only, e.g. `"02 Jun"`. Null/invalid → `"TBD"`. */
export function formatDate(iso: string | null, tz?: string): string {
  return formatIso(iso, tz, FMT_DATE, FALLBACK_DATE);
}
