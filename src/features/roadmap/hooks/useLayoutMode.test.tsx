// @vitest-environment jsdom
//
// Hook spec for `useLayoutMode` — the `?layout=` URL-state store behind the
// layout-mode switch (requirement 2026-06-30-1104; plan Test Strategy 17-20 /
// Acceptance #4). Mirrors useStageView/useFocusedTeam's client-only hydrate
// pattern:
//   - default to `grid` on a clean URL / SSR (no window),
//   - hydrate `circle` from `?layout=circle` after mount; unknown value -> grid,
//   - `setMode('circle')` updates state AND writes `?layout=circle`; `grid` writes grid,
//   - writing `?layout=` PRESERVES a co-existing `?focus=`/`?team=` (fresh-URL write).
//
// The URL is driven via jsdom's history API; we assert the `?layout=` param
// round-trips and the sibling params survive. RED until useLayoutMode.ts is
// implemented (today the stub throws "not implemented"), so each assertion fails
// for the right reason — not a typo/import error.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLayoutMode } from './useLayoutMode';
import type { LayoutMode } from '../graph-model';

/** Set the URL search (e.g. '?layout=circle') before mounting. */
function setSearch(search: string): void {
  window.history.replaceState(null, '', `${window.location.pathname}${search}`);
}

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

/** Mount the hook and wait for it to settle on `expected` after client hydrate —
 *  the single mount path every test shares (no per-block copies). */
async function mountSettledOn(expected: LayoutMode) {
  const view = renderHook(() => useLayoutMode());
  await waitFor(() => expect(view.result.current.mode).toBe(expected));
  return view;
}

beforeEach(() => setSearch(''));
afterEach(() => setSearch(''));

describe('useLayoutMode — default (clean URL) [Test 17]', () => {
  it('defaults to grid when ?layout= is absent', async () => {
    await mountSettledOn('grid');
    // The default is NOT written back to the URL — a clean URL stays clean.
    expect(param('layout')).toBeNull();
  });
});

describe('useLayoutMode — hydrate from ?layout= [Test 18]', () => {
  it('hydrates circle from ?layout=circle after mount', async () => {
    setSearch('?layout=circle');
    await mountSettledOn('circle');
  });

  it('falls back to grid for an unknown ?layout= value (allow-list with default)', async () => {
    setSearch('?layout=spiral');
    // It must settle on grid, never the garbage token, and never throw.
    await mountSettledOn('grid');
  });

  it('hydrates the explicit ?layout=grid value as grid', async () => {
    setSearch('?layout=grid');
    await mountSettledOn('grid');
  });
});

describe('useLayoutMode — setMode writes the URL [Test 19]', () => {
  it('setMode(circle) updates state AND writes ?layout=circle', async () => {
    const { result } = await mountSettledOn('grid');
    act(() => result.current.setMode('circle'));
    expect(result.current.mode).toBe('circle');
    expect(param('layout')).toBe('circle');
  });

  it('setMode(grid) writes ?layout=grid', async () => {
    setSearch('?layout=circle');
    const { result } = await mountSettledOn('circle');
    act(() => result.current.setMode('grid'));
    expect(result.current.mode).toBe('grid');
    expect(param('layout')).toBe('grid');
  });
});

describe('useLayoutMode — preserves co-existing params [Test 20]', () => {
  it('writing ?layout= keeps a co-existing ?focus= and ?team= (fresh-URL write)', async () => {
    setSearch('?focus=knockout&team=ARG');
    const { result } = await mountSettledOn('grid');

    act(() => result.current.setMode('circle'));

    expect(param('layout')).toBe('circle');
    // The sibling params written by useStageView/useFocusedTeam must survive.
    expect(param('focus')).toBe('knockout');
    expect(param('team')).toBe('ARG');
  });

  it('keeps setMode stable across re-renders (stable identity)', async () => {
    const { result, rerender } = await mountSettledOn('grid');
    const set = result.current.setMode;
    rerender();
    expect(result.current.setMode).toBe(set);
  });
});

// --- Matrix journey-lanes mode (2026-07-01-1030) ----------------------------
//
// The THIRD layout mode `matrix` joins `grid`/`circle` in the allow-list. These
// mirror the circle blocks above. RED until `useLayoutMode.ts` widens VALID to
// `['grid','circle','matrix']`: today `matrix` is NOT in VALID, so `?layout=matrix`
// falls back to `grid` and `setMode('matrix')` still WRITES the param but hydration
// rejects it — the round-trip assertion fails behaviorally (rejected token), not a
// typo/import error.
describe('useLayoutMode — matrix mode [Acceptance #1]', () => {
  it('hydrates matrix from ?layout=matrix after mount', async () => {
    setSearch('?layout=matrix');
    // RED: VALID excludes 'matrix' → readMode() returns the default 'grid'.
    await mountSettledOn('matrix');
  });

  it('setMode(matrix) updates state AND writes ?layout=matrix', async () => {
    const { result } = await mountSettledOn('grid');
    act(() => result.current.setMode('matrix'));
    expect(result.current.mode).toBe('matrix');
    expect(param('layout')).toBe('matrix');
  });

  it('round-trips ?layout=matrix (write then re-hydrate) preserving ?focus= and ?team=', async () => {
    setSearch('?focus=knockout&team=BRA');
    const { result } = await mountSettledOn('grid');

    // Write matrix on a URL that already carries the sibling params.
    act(() => result.current.setMode('matrix'));
    expect(param('layout')).toBe('matrix');
    // The sibling params written by useStageView/useFocusedTeam must survive.
    expect(param('focus')).toBe('knockout');
    expect(param('team')).toBe('BRA');

    // Re-mount against the freshly-written URL → the value must hydrate back to
    // matrix (a genuine round-trip through the allow-list). RED: VALID rejects it.
    await mountSettledOn('matrix');
  });
});
