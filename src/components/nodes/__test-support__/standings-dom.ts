// Shared DOM readers for the standings-table specs (GroupTableNode +
// StandingsOverlay). Both render the SAME `<table>` of column headers, so the
// header-label reader lives here once instead of being copy-pasted per spec.
//
// Pure DOM querying via Testing Library — no fixtures, no assertions. Kept under
// __test-support__ so it is excluded from coverage and not collected as a test.
import { screen, within } from '@testing-library/react';

/**
 * The visible stat-column header labels, in DOM order, for the standings table
 * currently in the document.
 *
 * The full set reads `# / Team / MP / W / D / L / GF / GA / GD / Pts`; the compact
 * (mobile/overlay) set collapses the variable middle to `# / Team / MP / GD / Pts`.
 * Returns trimmed text so a test can deep-equal against the expected literal set.
 */
export function getStatHeaderLabels(): string[] {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('columnheader')
    .map((th) => th.textContent?.trim() ?? '');
}

/** The full 7-stat header matrix: `# / Team` + the 7 STAT_COLUMNS + `Pts`. */
export const FULL_HEADER_LABELS = [
  '#',
  'Team',
  'MP',
  'W',
  'D',
  'L',
  'GF',
  'GA',
  'GD',
  'Pts',
] as const;

/** The compact (≤640px overlay) header matrix: `# / Team / MP / GD / Pts`. */
export const COMPACT_HEADER_LABELS = ['#', 'Team', 'MP', 'GD', 'Pts'] as const;

/** The stat headers DROPPED from the full set when compact (must be absent ≤640px). */
export const COMPACT_DROPPED_LABELS = ['W', 'D', 'L', 'GF', 'GA'] as const;
