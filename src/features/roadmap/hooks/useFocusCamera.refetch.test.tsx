// @vitest-environment jsdom
//
// Effect-level spec for `useFocusCamera`'s framing gate — the RED phase of
// requirement 2026-06-24-0951-preserve-viewport-on-refetch (plan Test Strategy
// behaviors 6–9; Acceptance #3, #5, #6, #7).
//
// `useFocusCamera(focus, nodes)` is the SECOND automatic re-frame source (the
// first is `useFitOnChange`). After its first-run skip, its effect re-runs on any
// dep change — INCLUDING a `nodes`-identity change from a refetch. With
// `focus === 'all'` it schedules `frameTopAlignedWithRetry → setViewport`,
// snapping the camera on every refetch. This is the core of the reported bug
// that `useFitOnChange`'s fix alone does NOT cover.
//
// THE FIX (under test): frame ONLY on an actual `focus` change. A data-only
// refetch (same `focus`, new `nodes`) must be a no-op; a real `focus` change
// (StageToggle: all/groups/knockout) must still frame.
//
// HARNESS: mock `@xyflow/react`'s `useReactFlow` to expose spies for
// `setViewport` / `fitView` / `fitBounds`. We keep the REAL `boundsOf` /
// classification helpers (pure) and let the real `frameTopAlignedWithRetry` run;
// in jsdom there is no `.react-flow` pane, so it exhausts its retry budget and
// calls the `fitView` fallback — so for `focus === 'all'` we assert on `fitView`
// (the observable frame), and for a `groups`/`knockout` change we assert on
// `fitBounds`. `vi.useFakeTimers()` drives the 40ms scheduling timer + the 8×50ms
// retry budget deterministically.
//
// RED REASON: today the effect re-frames on a `nodes`-identity change with an
// unchanged `focus`, so behavior 7 (data-only refetch is a no-op) FAILS —
// `fitView` is called again after the refetch. It goes GREEN once the
// `prevFocusRef` focus-change gate lands. Behaviors 6, 8, 9 pin the first-run
// skip, the focus-change frame, and the empty/subset branches that must NOT
// regress.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, type RenderHookResult } from '@testing-library/react';
import type { RoadmapFocus, RoadmapNode } from '../graph-model';
import { groupOnlyGraph, matchNode, mixedGraph } from './__test-support__/camera-nodes';

// ---- Mock @xyflow/react: spy on every camera entry point -------------------
const setViewport = vi.fn(() => Promise.resolve(true));
const fitView = vi.fn(() => Promise.resolve(true));
const fitBounds = vi.fn(() => Promise.resolve(true));
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ setViewport, fitView, fitBounds }),
}));

// Imported AFTER the mock so the hook binds to it.
import { useFocusCamera } from './useFocusCamera';

interface FocusProps {
  focus: RoadmapFocus;
  n: RoadmapNode[];
}

/** Mount `useFocusCamera` keyed exactly as the RoadmapCanvas call site does. */
function renderFocusCamera(
  focus: RoadmapFocus,
  nodes: RoadmapNode[],
): RenderHookResult<void, FocusProps> {
  return renderHook(({ focus: f, n }) => useFocusCamera(f, n), {
    initialProps: { focus, n: nodes },
  });
}

/** Drains the 40ms scheduling timer + the full 8×50ms retry budget. */
function flushFrame() {
  vi.advanceTimersByTime(40 + 8 * 50 + 1);
}

function clearCameraSpies() {
  setViewport.mockClear();
  fitView.mockClear();
  fitBounds.mockClear();
}

/** Assert NO camera entry point was touched — no frame of any kind landed. */
function expectNoFrame() {
  expect(setViewport).not.toHaveBeenCalled();
  expect(fitView).not.toHaveBeenCalled();
  expect(fitBounds).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.useFakeTimers();
  clearCameraSpies();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('useFocusCamera — first run is skipped [Behavior 6, AC-2]', () => {
  it('mounting with data and focus="all" frames nothing (useFitOnChange owns the first frame)', () => {
    renderFocusCamera('all', mixedGraph());
    flushFrame();

    expectNoFrame();
  });

  it('an empty → populated mount (focus="all") still treats the populate as the skipped first run', () => {
    // The first-run skip is set INSIDE the `nodes.length > 0` branch, so an
    // initial empty mount must not "spend" it — otherwise the populate would be
    // wrongly treated as a focus change and frame. Mirrors useFitOnChange behavior 4.
    const { rerender } = renderFocusCamera('all', []);
    flushFrame();
    expectNoFrame();

    rerender({ focus: 'all', n: mixedGraph() });
    flushFrame();

    expectNoFrame();
  });
});

describe('useFocusCamera — a data-only refetch is a no-op [Behavior 7, AC-3, AC-6]', () => {
  it('a NEW nodes identity with the SAME focus fires no frame after the first run', () => {
    const { rerender } = renderFocusCamera('all', mixedGraph());
    flushFrame(); // first-run skip
    clearCameraSpies();

    // Simulate a refetch: a brand-new node array identity, focus unchanged.
    rerender({ focus: 'all', n: mixedGraph('-v2') });
    flushFrame();

    expectNoFrame();
  });

  it('a refetch that also changes the node count (N → N+1) still fires no frame', () => {
    const { rerender } = renderFocusCamera('all', mixedGraph());
    flushFrame();
    clearCameraSpies();

    const grown = [...mixedGraph('-v2'), matchNode({ id: 'new', x: 900, y: 1200, stage: 'FINAL' })];
    rerender({ focus: 'all', n: grown });
    flushFrame();

    expectNoFrame();
  });

  it('repeated refetches (many new identities, focus unchanged) never re-frame', () => {
    const { rerender } = renderFocusCamera('all', mixedGraph());
    flushFrame();
    clearCameraSpies();

    // A burst of window-focus refetches; each mints a fresh graph. None may frame.
    for (let i = 0; i < 4; i += 1) {
      rerender({ focus: 'all', n: mixedGraph(`-r${i}`) });
      flushFrame();
    }

    expectNoFrame();
  });
});

describe('useFocusCamera — a real focus change still frames [Behavior 8, AC-4, AC-5]', () => {
  it('all → groups frames the group subset via fitBounds', () => {
    const nodes = mixedGraph();
    const { rerender } = renderFocusCamera('all', nodes);
    flushFrame();
    clearCameraSpies();

    rerender({ focus: 'groups', n: nodes });
    flushFrame();

    expect(fitBounds).toHaveBeenCalledTimes(1);
  });

  it('all → knockout frames the knockout subset via fitBounds', () => {
    const nodes = mixedGraph();
    const { rerender } = renderFocusCamera('all', nodes);
    flushFrame();
    clearCameraSpies();

    rerender({ focus: 'knockout', n: nodes });
    flushFrame();

    expect(fitBounds).toHaveBeenCalledTimes(1);
  });

  it('groups → all re-frames everything (top-aligned fitView fallback in jsdom)', () => {
    const nodes = mixedGraph();
    const { rerender } = renderFocusCamera('groups', nodes);
    flushFrame(); // first-run skip records focus="groups"
    clearCameraSpies();

    rerender({ focus: 'all', n: nodes });
    flushFrame();

    // focus="all" routes through frameTopAlignedWithRetry; with no measurable
    // pane in jsdom it falls back to fitView — the observable re-frame.
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it('a focus change still frames even when the nodes identity ALSO changed (a refetch + a tab switch at once)', () => {
    // Guards the gate against over-blocking: the no-op branch must key on `focus`
    // being unchanged, NOT on `nodes` being unchanged. A simultaneous refetch +
    // StageToggle (new nodes AND new focus) must still frame.
    const { rerender } = renderFocusCamera('all', mixedGraph());
    flushFrame();
    clearCameraSpies();

    rerender({ focus: 'groups', n: mixedGraph('-v2') });
    flushFrame();

    expect(fitBounds).toHaveBeenCalledTimes(1);
  });
});

describe('useFocusCamera — empty-nodes + null-bounds branches [Behavior 9, AC-7]', () => {
  it('mounting with an empty node set frames nothing (empty-nodes early return)', () => {
    renderFocusCamera('all', []);
    flushFrame();

    expectNoFrame();
  });

  it('a focus change to a zone with NO matching nodes does not call fitBounds (null-bounds guard)', () => {
    // A group-only graph: switching to "knockout" yields an empty subset →
    // boundsOf([]) === null → fitBounds must NOT be called (graceful no-op).
    const groupOnly = groupOnlyGraph();
    const { rerender } = renderFocusCamera('all', groupOnly);
    flushFrame();
    clearCameraSpies();

    rerender({ focus: 'knockout', n: groupOnly });
    flushFrame();

    expect(fitBounds).not.toHaveBeenCalled();
  });
});
