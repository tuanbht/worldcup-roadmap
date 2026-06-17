/**
 * Single date/timezone façade for the app. All kickoff/timezone rendering routes
 * through here (per the library-first stack policy: one date lib, no hand-rolled
 * `Intl.DateTimeFormat`). Wraps `date-fns` `parseISO` + `date-fns-tz`
 * `formatInTimeZone` against an explicit default IANA zone so output is
 * deterministic regardless of the viewer's machine zone or locale.
 *
 * Pure module — no React, no ambient clock, no machine-zone/locale dependency.
 */
import { parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';

/** Fixed broadcast zone. The model has no per-venue tz; a fixed zone keeps both
 *  production output and E2E visual snapshots reproducible. Overridable per call
 *  via the optional `tz` argument when a future task adds user/venue zones. */
const DEFAULT_TZ = 'UTC';

/** Display shapes mirroring the prior `Intl` output (`dd MMM, HH:mm`, etc.). */
const FMT_DATETIME = 'dd MMM, HH:mm'; // e.g. "02 Jun, 14:30"
const FMT_TIME = 'HH:mm'; // e.g. "14:30"
const FMT_DATE = 'dd MMM'; // e.g. "02 Jun"

/** Per-shape fallback when the ISO input is missing or unparseable. */
const FALLBACK_DATETIME = 'Date TBD';
const FALLBACK_TIME = '--:--';
const FALLBACK_DATE = 'TBD';

/** Resolve the effective IANA zone: an explicit value wins, else the default. */
export function resolveTimeZone(explicit?: string): string {
  return explicit ?? DEFAULT_TZ;
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
