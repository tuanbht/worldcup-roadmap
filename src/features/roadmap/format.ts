/**
 * Compact date/time formatting for match cards (client-side).
 *
 * Thin barrel over the single date/timezone façade (`@/lib/datetime`), so the
 * three consumers (`MatchNode`, `StatusPill`, `MatchDetailPanel`) keep importing
 * from here with zero call-site change. All formatting now routes through
 * `date-fns` + `date-fns-tz` — no hand-rolled `Intl.DateTimeFormat`.
 */
export { formatDate, formatDateTime, formatTime } from '@/lib/datetime';
