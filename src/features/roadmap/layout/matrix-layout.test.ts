// Unit spec for the pure geometry `computeMatrixLayout(tournament)` — one
// `MatrixNodePos` per match, positioned in its chronological stage COLUMN
// (requirement 2026-07-01-1030; plan Test Strategy 8 / Acceptance #3). NO React
// Flow. Asserts RELATIONS (one position per match; x monotonic by column index;
// distinct y per column slot; deterministic) — not absolute pixel values (those
// are tuning tokens). Oracles are FIXTURE-DERIVED from the validated mock. RED on
// MISSING LOGIC (the stub returns an empty map → 0 positions vs 104), not on an
// import error.
import { describe, expect, it } from 'vitest';
import { computeMatrixLayout } from './matrix-layout';
import { expectedStationCount } from '../__test-support__/matrix-fixtures';
import { deepFreeze, loadTournament } from '../__test-support__/roadmap-fixtures';

const tournament = loadTournament();

describe('computeMatrixLayout — one position per match [Test 8]', () => {
  it('returns exactly one MatrixNodePos per match (104, fixture-derived)', () => {
    const layout = computeMatrixLayout(tournament);
    expect(layout.size).toBe(expectedStationCount(tournament));
    expect(layout.size).toBe(104);
  });

  it('keys the layout by real match ids (no phantom / missing stations)', () => {
    const layout = computeMatrixLayout(tournament);
    const matchIds = new Set(tournament.matches.map((m) => m.id));
    for (const m of tournament.matches) {
      const pos = layout.get(m.id);
      expect(pos, `a position for match ${m.id}`).toBeDefined();
      expect(pos!.matchId).toBe(m.id);
      expect(pos!.stage).toBe(m.stage);
    }
    // No stray keys beyond the real matches.
    for (const key of layout.keys()) expect(matchIds.has(key)).toBe(true);
  });
});

describe('computeMatrixLayout — column geometry [Test 8 / Acceptance #3]', () => {
  it('increases x monotonically with column index across the 8 bands', () => {
    const layout = computeMatrixLayout(tournament);
    // Map each colIndex → its shared x; assert the sorted-by-col x sequence is
    // strictly increasing (columns pack left → right).
    const xByCol = new Map<number, number>();
    for (const pos of layout.values()) {
      const prior = xByCol.get(pos.col);
      if (prior === undefined) xByCol.set(pos.col, pos.x);
      else expect(pos.x, `all stations in col ${pos.col} share one x`).toBe(prior);
    }
    const cols = [...xByCol.keys()].sort((a, b) => a - b);
    expect(cols.length, 'the layout spans multiple columns').toBeGreaterThan(1);
    for (let i = 1; i < cols.length; i += 1) {
      expect(xByCol.get(cols[i])!, `x strictly increases at col ${cols[i]}`).toBeGreaterThan(
        xByCol.get(cols[i - 1])!,
      );
    }
  });

  it('gives two stations in the same column distinct y (no overlap)', () => {
    const layout = computeMatrixLayout(tournament);
    const yByCol = new Map<number, number[]>();
    for (const pos of layout.values()) {
      const arr = yByCol.get(pos.col) ?? [];
      arr.push(pos.y);
      yByCol.set(pos.col, arr);
    }
    for (const [col, ys] of yByCol) {
      expect(new Set(ys).size, `column ${col} slots have distinct y`).toBe(ys.length);
    }
  });

  it('assigns 0-based slot indices that are distinct within each column', () => {
    const layout = computeMatrixLayout(tournament);
    const slotsByCol = new Map<number, number[]>();
    for (const pos of layout.values()) {
      const arr = slotsByCol.get(pos.col) ?? [];
      arr.push(pos.slot);
      slotsByCol.set(pos.col, arr);
    }
    for (const [col, slots] of slotsByCol) {
      expect(new Set(slots).size, `column ${col} slot indices are unique`).toBe(slots.length);
      for (const s of slots)
        expect(s, `slot in col ${col} is a non-negative int`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('computeMatrixLayout — pure + deterministic [Test 8]', () => {
  it('does not mutate a deep-frozen input tournament', () => {
    expect(() => computeMatrixLayout(deepFreeze(loadTournament()))).not.toThrow();
  });

  it('returns identical positions across two calls (deterministic)', () => {
    const a = computeMatrixLayout(tournament);
    const b = computeMatrixLayout(tournament);
    expect(a.size).toBe(b.size);
    for (const [id, pa] of a) {
      const pb = b.get(id);
      expect(pb).toBeDefined();
      expect([pb!.col, pb!.slot, pb!.x, pb!.y]).toEqual([pa.col, pa.slot, pa.x, pa.y]);
    }
  });
});
