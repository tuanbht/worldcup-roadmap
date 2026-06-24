// @vitest-environment jsdom
//
// Unit spec for `useFitOnChange` — the RED phase of requirement
// 2026-06-24-0951-preserve-viewport-on-refetch (plan Test Strategy behaviors
// 1–5; Acceptance #1, #2, #3, #7).
//
// THE BUG: `useFitOnChange(key, nodes)` re-runs its top-aligned snap (a
// `setViewport` via `frameTopAlignedWithRetry`, falling back to `fitView`) on
// EVERY `key` change. A TanStack Query refetch mints a new `tournament` ref →
// rebuilt graph → changed `nodes.length` (the call-site key) → the camera snaps
// back to the fit frame, discarding the user's zoom + pan.
//
// THE FIX (under test here): the top-aligned frame must fire EXACTLY ONCE, on
// the first non-empty `nodes` arrival (the 0 → N transition), and NEVER on any
// later call — even when the node set / count changes (a refetch, or a genuinely
// new match node N → N+1).
//
// HARNESS: we mock `@xyflow/react`'s `useReactFlow` (mirroring
// useFocusMatch.test.tsx) so no live React Flow engine is needed, AND we mock the
// sibling `./useFocusCamera` module so we can SPY on `frameTopAlignedWithRetry`
// (the single funnel through which the hook attempts a frame). The spy models the
// real funnel's contract: a frame only LANDS when it is handed non-null bounds —
// with `bounds === null` (an empty node set) the real helper just calls the
// `fallback` and never touches the camera. So `countFrames()` strictly counts
// camera-moving frames, never funnel entries — which keeps the empty-node
// assertion precise instead of an artifact of the spy. `vi.useFakeTimers()`
// drives the internal 60ms scheduling `setTimeout` deterministically.
//
// RED REASON: today `useFitOnChange` has no fit-once guard, so a later
// key/count change re-enters the funnel with non-null bounds → a SECOND frame
// lands. Behaviors 2, 3 (no re-frame on a refetch / new node) FAIL on that
// second frame. They go GREEN once the `hasFramedRef` guard lands. Behaviors 1,
// 4, 5 pin the first-load frame + cleanup that must NOT regress.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Rect } from '@xyflow/react';
import type { RoadmapNode } from '../graph-model';
import { nodeSet } from './__test-support__/camera-nodes';

// ---- Mock @xyflow/react so jsdom needs no live RF instance ------------------
// `useFitOnChange` reads the whole instance (`rf`) plus `fitView`; the real
// `frameTopAlignedWithRetry` is what consumes `rf` — but we mock that helper out
// (below), so a minimal double suffices.
const fitView = vi.fn(() => Promise.resolve(true));
const setViewport = vi.fn(() => Promise.resolve(true));
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ fitView, setViewport }),
}));

// ---- Mock the sibling camera module: spy on the single frame funnel ---------
// `useFitOnChange` imports `boundsOf` + `frameTopAlignedWithRetry` from
// `./useFocusCamera`. We keep `boundsOf` real (pure geometry — so an empty node
// set really does yield `null` bounds), and replace `frameTopAlignedWithRetry`
// with a spy that honours the real null-bounds contract: null bounds → call the
// fallback, record NO frame; non-null bounds → record exactly one landed frame.
const frameSpy =
  vi.fn<(rf: unknown, bounds: Rect | null, duration: number, fallback: () => void) => void>();
const fallbackSpy = vi.fn();
function countFrames(): number {
  return frameSpy.mock.calls.filter(([, bounds]) => bounds !== null).length;
}
vi.mock('./useFocusCamera', async () => {
  const actual = await vi.importActual<typeof import('./useFocusCamera')>('./useFocusCamera');
  return {
    ...actual,
    frameTopAlignedWithRetry: (
      rf: unknown,
      bounds: Rect | null,
      duration: number,
      fallback: () => void,
    ): (() => void) => {
      frameSpy(rf, bounds, duration, fallback);
      if (!bounds) fallbackSpy();
      return () => undefined;
    },
  };
});

// Imported AFTER the mocks are registered so the hook binds to them.
import { useFitOnChange } from './useFitOnChange';

/** Render the hook keyed exactly as the RoadmapCanvas call site does. */
function renderFit(nodes: RoadmapNode[]) {
  return renderHook(({ n }) => useFitOnChange(n.length, n), { initialProps: { n: nodes } });
}

/** Advance past the internal 60ms scheduling timer so a pending frame lands. */
function flushFrame() {
  vi.advanceTimersByTime(60);
}

beforeEach(() => {
  vi.useFakeTimers();
  fitView.mockClear();
  setViewport.mockClear();
  frameSpy.mockClear();
  fallbackSpy.mockClear();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('useFitOnChange — frames once on first non-empty arrival [Behavior 1, AC-1]', () => {
  it('invokes the top-aligned frame exactly once when mounted with a non-empty node set', () => {
    renderFit(nodeSet(['m1', 'm2', 'm3']));

    // Nothing fires until the internal 60ms scheduling timer elapses.
    expect(countFrames()).toBe(0);
    flushFrame();

    expect(countFrames()).toBe(1);
  });
});

describe('useFitOnChange — does NOT re-frame on a refetch [Behavior 2, AC-2]', () => {
  it('a refetch that resolves a placeholder (count 3 → 4, new identity) fires no second frame', () => {
    const { rerender } = renderFit(nodeSet(['m1', 'm2', 'm3']));
    flushFrame();
    expect(countFrames()).toBe(1);

    // A new tournament ref rebuilds the graph; live results resolve a placeholder
    // so the count changes (3 → 4) AND every node identity is brand new — exactly
    // the call-site key change that snaps the camera today.
    rerender({ n: nodeSet(['m1', 'm2', 'm3', 'm4']) });
    flushFrame();

    expect(countFrames()).toBe(1);
  });

  it('a refetch that changes contents but NOT the count (scores update in place) fires no second frame', () => {
    const { rerender } = renderFit(nodeSet(['m1', 'm2', 'm3']));
    flushFrame();
    expect(countFrames()).toBe(1);

    // New identity, SAME ids/length — the in-place score/status update case.
    rerender({ n: nodeSet(['m1', 'm2', 'm3']) });
    flushFrame();

    expect(countFrames()).toBe(1);
  });

  it('repeated identical refetches (same ids, same count, each a fresh array) never re-frame', () => {
    const { rerender } = renderFit(nodeSet(['m1', 'm2', 'm3']));
    flushFrame();
    expect(countFrames()).toBe(1);

    // Window-focus refetches can fire many times with no real data delta. Each
    // mints a fresh array; not one of them may re-frame.
    for (let i = 0; i < 5; i += 1) {
      rerender({ n: nodeSet(['m1', 'm2', 'm3']) });
      flushFrame();
    }

    expect(countFrames()).toBe(1);
  });
});

describe('useFitOnChange — a new structural node does not yank the camera [Behavior 3, AC-3]', () => {
  it('an N → N+1 node-count growth after the first frame fires no additional frame', () => {
    const { rerender } = renderFit(nodeSet(['m1', 'm2']));
    flushFrame();
    expect(countFrames()).toBe(1);

    // A genuinely new match node appears (a newly scheduled match). The camera
    // must stay put — the user re-fits manually if they want.
    rerender({ n: nodeSet(['m1', 'm2', 'm3']) });
    flushFrame();

    expect(countFrames()).toBe(1);
  });
});

describe('useFitOnChange — empty-first then populate frames on the populate [Behavior 4, AC-1]', () => {
  it('does NOT frame while nodes is empty, then frames exactly once when data lands', () => {
    const { rerender } = renderFit([]);

    // Initial empty render: no camera-moving frame may land — the guard must NOT
    // be spent on the 0-node render (it would otherwise skip the real first frame).
    flushFrame();
    expect(countFrames()).toBe(0);

    // Data arrives (the 0 → N transition).
    rerender({ n: nodeSet(['m1', 'm2', 'm3']) });
    flushFrame();
    expect(countFrames()).toBe(1);

    // A subsequent refetch after the populate still must not re-frame.
    rerender({ n: nodeSet(['m1', 'm2', 'm3', 'm4']) });
    flushFrame();
    expect(countFrames()).toBe(1);
  });
});

describe('useFitOnChange — cleanup cancels a pending frame on unmount [Behavior 5]', () => {
  it('unmounting before the 60ms scheduling timer fires never frames (no late setViewport)', () => {
    const { unmount } = renderFit(nodeSet(['m1', 'm2', 'm3']));

    // Unmount BEFORE the 60ms timer elapses — the framing-branch cleanup
    // (clearTimeout) must cancel the scheduled frame.
    unmount();
    flushFrame();

    expect(countFrames()).toBe(0);
    expect(setViewport).not.toHaveBeenCalled();
    expect(fitView).not.toHaveBeenCalled();
  });
});
