// Pure responsive helpers + constants for the mobile gap-fill
// (requirement 2026-06-23-1336-mobile-friendly-small-screens).
//
// Single source of truth for:
//   - the mobile/desktop minZoom floor constants + the pure `mobileZoomFloor`
//     step selector (fed into <ReactFlow minZoom> AND useFocusCamera's clamp so
//     the two never drift),
//   - the relocated `StatColumn` interface + `STAT_COLUMNS` array (moved verbatim
//     out of GroupTableNode.tsx with the `detail` LOD flag intact), and
//   - the pure `pickStandingsColumns(variant)` selector returning the variable
//     middle stat-column subset for the full vs compact standings tables.
//
// No React import here: everything is pure + fully unit-testable.
import type { StandingRow } from '@/domain/types';

/** px — mirrors the `max-[640px]`/`sm` Tailwind cutover used across the UI. */
export const MOBILE_MAX_WIDTH = 640;
/** The current RoadmapCanvas / useFocusCamera floor (kept in sync here). */
export const DESKTOP_MIN_ZOOM = 0.2;
/** Higher floor so a 296px standings card stays legible on a 320px pane. */
export const MOBILE_MIN_ZOOM = 0.32;

/** Which standings column set to render: the full matrix or the compact subset. */
export type StandingsVariant = 'full' | 'compact';

/**
 * A secondary numeric standings column. Moved verbatim from GroupTableNode so
 * there is one source of truth; the `detail` LOD flag drives the always-on
 * node's overview-zoom `data-lod-detail` fade and is preserved per column.
 */
export interface StatColumn {
  readonly key: string;
  readonly label: string;
  readonly value: (row: StandingRow) => string | number;
  /** Hidden at overview zoom (data-lod-detail) when true. */
  readonly detail: boolean;
}

/** Signed goal-difference formatter ("+5", "-1", "0") — moved intact. */
function gd(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

/**
 * The full 7-entry stat set (mp/w/d/l/gf/ga/gd). Keys, labels, value fns and the
 * `detail` flag are unchanged from the previous GroupTableNode declaration:
 * mp/w/d/l/gf/ga carry `detail:true`; gd carries `detail:false`.
 */
export const STAT_COLUMNS: readonly StatColumn[] = [
  { key: 'mp', label: 'MP', value: (r) => r.played, detail: true },
  { key: 'w', label: 'W', value: (r) => r.won, detail: true },
  { key: 'd', label: 'D', value: (r) => r.draw, detail: true },
  { key: 'l', label: 'L', value: (r) => r.lost, detail: true },
  { key: 'gf', label: 'GF', value: (r) => r.goalsFor, detail: true },
  { key: 'ga', label: 'GA', value: (r) => r.goalsAgainst, detail: true },
  { key: 'gd', label: 'GD', value: (r) => gd(r.goalDifference), detail: false },
];

/** The compact stat subset: MP + GD only, framed in the table by #/Team/Pts. */
const COMPACT_KEYS: readonly string[] = ['mp', 'gd'];

/**
 * The variable middle stat columns for a standings table. Returns the SAME
 * column objects as STAT_COLUMNS (reference identity — one source of truth):
 *   'full'    -> the 7-entry STAT_COLUMNS (mp/w/d/l/gf/ga/gd)
 *   'compact' -> STAT_COLUMNS filtered to ['mp','gd'], order preserved
 * So the compact table is `# / Team / MP / GD / Pts` (5 visible columns). There
 * is no `P` key — "played" is key `mp` (label `MP`).
 */
export function pickStandingsColumns(variant: StandingsVariant): readonly StatColumn[] {
  if (variant === 'full') return STAT_COLUMNS;
  return STAT_COLUMNS.filter((column) => COMPACT_KEYS.includes(column.key));
}

/**
 * The `minZoom` floor for a given viewport width — a step function over exactly
 * {MOBILE_MIN_ZOOM, DESKTOP_MIN_ZOOM}. Width <= MOBILE_MAX_WIDTH (inclusive)
 * returns the mobile floor; wider returns the desktop floor. The inclusive seam
 * at 640 mirrors the Tailwind `max-[640px]`/`sm` cutover.
 */
export function mobileZoomFloor(width: number): number {
  return width <= MOBILE_MAX_WIDTH ? MOBILE_MIN_ZOOM : DESKTOP_MIN_ZOOM;
}
