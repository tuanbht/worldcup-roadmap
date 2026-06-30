import { describe, expect, it } from 'vitest';
import { GROUP_LETTERS, R32_SEEDING, type SeedPair } from './seeding';

// ---------------------------------------------------------------------------
// R32_SEEDING is the single source of truth for Round-of-32 round-0 seeding.
// It MUST be the OFFICIAL FIFA World Cup 2026 bracket (Matches 73–88 → slots
// 0–15, home = first listed). Source: Wikipedia "2026 FIFA World Cup knockout
// stage". This suite enforces:
//   (a) structural validity invariants — so a future wrong/typo'd edit fails
//       loudly (each 1A..1L once, each 2A..2L once, exactly 8 '3rd', the
//       4 (1v2) + 8 (1v3rd) + 4 (2v2) match-kind split), and
//   (b) the exact official home/away of all 16 slots (table-driven it.each +
//       one whole-array deep-equal).
// Pure + deterministic: no randomness, no I/O, no shared mutable state.
// ---------------------------------------------------------------------------

type Kind = 'winner' | 'runner' | 'third';

/** Classify a seed label: '3rd' → third, '1X' → winner, '2X' → runner. */
function kindOf(label: string): Kind {
  if (label === '3rd') return 'third';
  if (label.startsWith('1')) return 'winner';
  if (label.startsWith('2')) return 'runner';
  throw new Error(`unclassifiable seed label: ${JSON.stringify(label)}`);
}

const expectedWinners = GROUP_LETTERS.map((g) => `1${g}`);
const expectedRunners = GROUP_LETTERS.map((g) => `2${g}`);
const allowedLabels = new Set<string>([...expectedWinners, ...expectedRunners, '3rd']);

/** Flatten every home/away token across all pairs. */
function allLabels(pairs: readonly SeedPair[]): string[] {
  return pairs.flatMap((p) => [p.home, p.away]);
}

/** The unordered match-kind of a pair, keyed canonically (kinds sorted+joined). */
function pairKind(pair: SeedPair): string {
  return [kindOf(pair.home), kindOf(pair.away)].sort().join('+');
}

/** Tally pair-kinds across a table, keyed by canonical pairKind. */
function kindSplit(pairs: readonly SeedPair[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pair of pairs) {
    const key = pairKind(pair);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// THE OFFICIAL ORACLE — slot → exact home/away (home listed first), Matches
// 73–88. This single const is the source of truth reused by every assertion
// below (per-slot it.each, the whole-array deep-equal, AND the derived
// invariant counts) so the expectations can never silently drift apart.
// ---------------------------------------------------------------------------
const OFFICIAL: ReadonlyArray<{ slot: number; home: string; away: string }> = [
  { slot: 0, home: '2A', away: '2B' },
  { slot: 1, home: '1E', away: '3rd' },
  { slot: 2, home: '1F', away: '2C' },
  { slot: 3, home: '1C', away: '2F' },
  { slot: 4, home: '1I', away: '3rd' },
  { slot: 5, home: '2E', away: '2I' },
  { slot: 6, home: '1A', away: '3rd' },
  { slot: 7, home: '1L', away: '3rd' },
  { slot: 8, home: '1D', away: '3rd' },
  { slot: 9, home: '1G', away: '3rd' },
  { slot: 10, home: '2K', away: '2L' },
  { slot: 11, home: '1H', away: '2J' },
  { slot: 12, home: '1B', away: '3rd' },
  { slot: 13, home: '1J', away: '2H' },
  { slot: 14, home: '1K', away: '3rd' },
  { slot: 15, home: '2D', away: '2G' },
];

/** The oracle as plain {home, away} pairs, in slot order (for deep-equal). */
const OFFICIAL_PAIRS: readonly SeedPair[] = OFFICIAL.map(({ home, away }) => ({ home, away }));

// Derived invariant counts — computed FROM the oracle, never hardcoded, so the
// invariant suite and the official suite can never disagree by accident.
const OFFICIAL_KIND_SPLIT = kindSplit(OFFICIAL_PAIRS);
const OFFICIAL_THIRD_COUNT = allLabels(OFFICIAL_PAIRS).filter((l) => l === '3rd').length;

describe('R32_SEEDING', () => {
  // The oracle guards production; this block guards the oracle. If the official
  // table above is ever fat-fingered, these fail FIRST — so a wrong oracle can
  // never silently bless a wrong production table.
  describe('OFFICIAL oracle is internally consistent (guard the oracle itself)', () => {
    it('lists all 16 slots once, in 0..15 order', () => {
      expect(OFFICIAL).toHaveLength(16);
      expect(OFFICIAL.map((r) => r.slot)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    });

    it('uses every group winner and runner-up exactly once and exactly 8 thirds', () => {
      const winners = allLabels(OFFICIAL_PAIRS)
        .filter((l) => kindOf(l) === 'winner')
        .sort();
      const runners = allLabels(OFFICIAL_PAIRS)
        .filter((l) => kindOf(l) === 'runner')
        .sort();
      expect(winners).toEqual([...expectedWinners].sort());
      expect(runners).toEqual([...expectedRunners].sort());
      expect(OFFICIAL_THIRD_COUNT).toBe(8);
    });

    it('has the 4 (1v2) + 8 (1v3rd) + 4 (2v2) kind-split with no other kind', () => {
      expect(OFFICIAL_KIND_SPLIT).toEqual({
        'runner+winner': 4,
        'third+winner': 8,
        'runner+runner': 4,
      });
    });
  });

  describe('validity invariants (guard future wrong edits)', () => {
    it('has exactly 16 pairs / 32 seed tokens', () => {
      expect(R32_SEEDING).toHaveLength(OFFICIAL.length);
      expect(allLabels(R32_SEEDING)).toHaveLength(OFFICIAL.length * 2);
    });

    it('uses every group winner 1A..1L exactly once', () => {
      const winners = allLabels(R32_SEEDING)
        .filter((l) => kindOf(l) === 'winner')
        .sort();
      expect(winners).toEqual([...expectedWinners].sort());
    });

    it('uses every group runner-up 2A..2L exactly once', () => {
      const runners = allLabels(R32_SEEDING)
        .filter((l) => kindOf(l) === 'runner')
        .sort();
      expect(runners).toEqual([...expectedRunners].sort());
    });

    it("has exactly 8 tokens equal to '3rd'", () => {
      const thirds = allLabels(R32_SEEDING).filter((l) => l === '3rd');
      expect(thirds).toHaveLength(OFFICIAL_THIRD_COUNT);
    });

    it('contains no stray/typo labels (every token is a known seed)', () => {
      const stray = allLabels(R32_SEEDING).filter((l) => !allowedLabels.has(l));
      expect(stray).toEqual([]);
    });

    it('matches the official 4 (1v2) + 8 (1v3rd) + 4 (2v2) kind-split, with 0 of any other kind', () => {
      const counts = kindSplit(R32_SEEDING);
      // Canonical keys are the two kinds sorted alphabetically then joined:
      //   winner+runner (1v2), third+winner (1v3rd), runner+runner (2v2).
      expect(counts).toEqual(OFFICIAL_KIND_SPLIT);
      expect(counts).toEqual({
        'runner+winner': 4,
        'third+winner': 8,
        'runner+runner': 4,
      });
      // Explicitly: NO runner-up-vs-third, no winner-vs-winner, no two-thirds.
      expect(counts['runner+third'] ?? 0).toBe(0);
      expect(counts['winner+winner'] ?? 0).toBe(0);
      expect(counts['third+third'] ?? 0).toBe(0);
    });

    it('totals 32 tokens as 12 winners + 12 runners + 8 thirds', () => {
      const tokens = allLabels(R32_SEEDING);
      const winners = tokens.filter((l) => kindOf(l) === 'winner').length;
      const runners = tokens.filter((l) => kindOf(l) === 'runner').length;
      const thirds = tokens.filter((l) => l === '3rd').length;
      expect({ winners, runners, thirds }).toEqual({ winners: 12, runners: 12, thirds: 8 });
      expect(winners + runners + thirds).toBe(32);
    });
  });

  describe('exact official matchups (slots 0–15, home listed first)', () => {
    // Strongest single assertion: the entire seeding table, in order, equals the
    // official oracle. Catches a wrong slot AND a wrong ordering in one shot.
    it('deep-equals the official table for every slot in order', () => {
      expect(R32_SEEDING).toEqual(OFFICIAL_PAIRS);
    });

    // Per-slot rows in addition — granular failure messages name the exact bad slot.
    it.each(OFFICIAL)('slot $slot is $home vs $away', ({ slot, home, away }) => {
      expect(R32_SEEDING[slot]).toEqual({ home, away });
    });
  });
});
