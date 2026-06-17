/**
 * Round-of-32 seeding template for the 48-team format (12 groups A–L).
 *
 * Qualifiers = 12 group winners (1A–1L) + 12 runners-up (2A–2L) + the 8 best
 * third-placed teams. That is exactly 32 teams across 16 matches.
 *
 * The pairings below are a well-formed, internally-consistent template: every
 * group-position label is used exactly once, so the bracket topology is valid.
 * FIFA's official pairing of *which* winner meets *which* runner-up/third is
 * fixed by regulation and differs in detail; for live data those concrete teams
 * come straight from the API. This template only drives (a) placeholder labels
 * shown before teams are known and (b) the offline mock fixture.
 *
 * Index i is Round-of-32 slot i (0..15). Slots i and i+1 feed Round-of-16 slot
 * floor(i/2), and so on up the tree.
 */
export interface SeedPair {
  readonly home: string;
  readonly away: string;
}

/** "3rd" marks one of the eight best third-placed qualifiers. */
export const R32_SEEDING: readonly SeedPair[] = [
  { home: '1A', away: '2B' },
  { home: '1C', away: '2D' },
  { home: '1E', away: '2F' },
  { home: '1G', away: '2H' },
  { home: '1I', away: '2J' },
  { home: '1K', away: '2L' },
  { home: '2A', away: '1J' },
  { home: '2C', away: '1L' },
  { home: '2E', away: '3rd' },
  { home: '2G', away: '3rd' },
  { home: '2I', away: '3rd' },
  { home: '2K', away: '3rd' },
  { home: '1B', away: '3rd' },
  { home: '1D', away: '3rd' },
  { home: '1F', away: '3rd' },
  { home: '1H', away: '3rd' },
];

/** Group letters A..L for the 12 groups. */
export const GROUP_LETTERS: readonly string[] = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
];
