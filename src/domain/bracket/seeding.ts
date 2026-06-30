/**
 * Official Round-of-32 bracket for the 2026 FIFA World Cup (48-team format,
 * 12 groups A–L).
 *
 * Qualifiers = 12 group winners (1A–1L) + 12 runners-up (2A–2L) + the 8 best
 * third-placed teams — exactly 32 teams across 16 matches, structured as the
 * official 4 (winner-vs-runner-up) + 8 (winner-vs-3rd) + 4 (runner-up-vs-
 * runner-up) split.
 *
 * Source: Wikipedia "2026 FIFA World Cup knockout stage" — Matches 73–88 map
 * to R32 slots 0–15 in order, with the home side listed first.
 *
 * The `'3rd'` token is a generic placeholder: which concrete third-placed team
 * fills each of the eight `1X vs 3rd` slots is resolved at runtime from the API
 * (or, offline, from the mock's best-thirds), per FIFA's third-place allocation
 * table — that allocation is intentionally NOT encoded here.
 *
 * Index i is Round-of-32 slot i (0..15). The R16-and-up topology is derived in
 * `build-bracket.ts`: slots i and i+1 feed Round-of-16 slot floor(i/2), and so
 * on up the tree (73&74 → R16-1, … 87&88 → R16-8).
 */
export interface SeedPair {
  readonly home: string;
  readonly away: string;
}

/** "3rd" marks one of the eight best third-placed qualifiers. */
export const R32_SEEDING: readonly SeedPair[] = [
  { home: '2A', away: '2B' },
  { home: '1E', away: '3rd' },
  { home: '1F', away: '2C' },
  { home: '1C', away: '2F' },
  { home: '1I', away: '3rd' },
  { home: '2E', away: '2I' },
  { home: '1A', away: '3rd' },
  { home: '1L', away: '3rd' },
  { home: '1D', away: '3rd' },
  { home: '1G', away: '3rd' },
  { home: '2K', away: '2L' },
  { home: '1H', away: '2J' },
  { home: '1B', away: '3rd' },
  { home: '1J', away: '2H' },
  { home: '1K', away: '3rd' },
  { home: '2D', away: '2G' },
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
