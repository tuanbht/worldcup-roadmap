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
import {
  distinctZoneGraph,
  matchNode,
  mixedGraph,
  nodeSet,
  standingsNode,
} from './__test-support__/camera-nodes';
import { readColdLoadFocusParam } from '../focus-target';

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

// Imported AFTER the mocks are registered so the hook binds to them. The mock
// above spreads `...actual`, so `boundsOf` / `isGroupZoneNode` / `isKnockoutNode`
// remain the REAL pure geometry — the same functions the cold-load resolver
// composes with — letting the cold-load specs assert the EXACT subset envelope.
import { useFitOnChange } from './useFitOnChange';
import { boundsOf, isGroupZoneNode, isKnockoutNode } from './useFocusCamera';

/** The bounds (the 2nd arg) of the single LANDED frame, or null if none landed. */
function framedBounds(): Rect | null {
  const landed = frameSpy.mock.calls.filter(([, bounds]) => bounds !== null);
  if (landed.length === 0) return null;
  return landed[0][1] as Rect;
}

/**
 * Set (or clear) the cold-load `?focus=` URL param in jsdom via
 * `history.replaceState`, so the hook's one-time `readColdLoadFocusParam()` read
 * sees it — exactly how a real deep-linked cold load arrives. Reset per test.
 */
function setFocusParam(value: string | null) {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete('focus');
  else url.searchParams.set('focus', value);
  window.history.replaceState(null, '', url);
}

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
  // No `?focus=` param by default — the regression cases must see the bare URL.
  setFocusParam(null);
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

// ===========================================================================
// Cold-load `?focus=` framing (requirement 2026-06-24-1032; plan Test Strategy
// hook cases 7-10, Acceptance #1, #2, #3, #4). The single fit-once frame must
// target the resolved `?focus=` subset on a cold load, fall back to the whole
// graph with no param / garbage, and STILL fire only once (a refetch never
// re-frames). We drive the param through the real jsdom URL and assert the
// `bounds` arg the frame funnel receives equals the EXACT resolved envelope.
// ===========================================================================
//
// `mixedFitGraph(suffix)` is the shared `distinctZoneGraph` fixture flattened to
// the bare node array the call sites expect — three nodes whose zone envelopes
// (all / groups / knockout / match-id) are GENUINELY DISTINCT (knockout card far
// south-east), so a focus frame can't pass by coinciding with the whole-graph box.
function mixedFitGraph(suffix = ''): RoadmapNode[] {
  return distinctZoneGraph(suffix).nodes;
}

describe('useFitOnChange — cold-load ?focus= frames the requested subset [hook case 7, AC-1]', () => {
  it('?focus=knockout frames the knockout subset bounds (NOT the whole-graph fit)', () => {
    setFocusParam('knockout');
    const nodes = mixedFitGraph();
    renderFit(nodes);
    flushFrame();

    const koBounds = boundsOf(nodes.filter(isKnockoutNode));
    expect(countFrames()).toBe(1);
    expect(framedBounds()).toEqual(koBounds);
    // Proves the cold-load frame is NOT the default whole-graph fit.
    expect(framedBounds()).not.toEqual(boundsOf([...nodes]));
  });

  it('?focus=groups frames the group-zone subset bounds', () => {
    setFocusParam('groups');
    const nodes = mixedFitGraph();
    renderFit(nodes);
    flushFrame();

    expect(countFrames()).toBe(1);
    expect(framedBounds()).toEqual(boundsOf(nodes.filter(isGroupZoneNode)));
    expect(framedBounds()).not.toEqual(boundsOf([...nodes]));
  });

  it('?focus=<match id> frames that single card footprint', () => {
    setFocusParam('ko1');
    const nodes = mixedFitGraph();
    renderFit(nodes);
    flushFrame();

    const single = boundsOf(nodes.filter((n) => n.id === 'ko1'));
    expect(countFrames()).toBe(1);
    expect(framedBounds()).toEqual(single);
    expect(framedBounds()).not.toEqual(boundsOf([...nodes]));
  });

  it('?focus=all frames the whole-graph bounds (the all view == default envelope)', () => {
    setFocusParam('all');
    const nodes = mixedFitGraph();
    renderFit(nodes);
    flushFrame();

    expect(countFrames()).toBe(1);
    expect(framedBounds()).toEqual(boundsOf([...nodes]));
  });
});

describe('useFitOnChange — no ?focus= param frames the whole graph [hook case 8, AC-2 regression]', () => {
  it('with NO param the one-time frame uses the whole-graph bounds (byte-identical default fit)', () => {
    // `beforeEach` clears the param; the default first-load fit must be unchanged.
    const nodes = mixedFitGraph();
    renderFit(nodes);
    flushFrame();

    expect(countFrames()).toBe(1);
    expect(framedBounds()).toEqual(boundsOf([...nodes]));
  });
});

describe('useFitOnChange — garbage ?focus= falls back to default fit [hook case 9, AC-4]', () => {
  it('?focus=%%%garbage%%% frames the whole-graph bounds with no throw', () => {
    setFocusParam('%%%garbage%%%');
    const nodes = mixedFitGraph();
    expect(() => {
      renderFit(nodes);
      flushFrame();
    }).not.toThrow();

    expect(countFrames()).toBe(1);
    expect(framedBounds()).toEqual(boundsOf([...nodes]));
  });

  it('?focus=<unmatched id> falls back to the whole-graph bounds (no such rendered node)', () => {
    setFocusParam('no-such-match');
    const nodes = mixedFitGraph();
    renderFit(nodes);
    flushFrame();

    expect(countFrames()).toBe(1);
    expect(framedBounds()).toEqual(boundsOf([...nodes]));
  });

  it("?focus=knockout on a group-only graph (empty subset) falls back to the whole-graph fit", () => {
    setFocusParam('knockout');
    // group-only: standings + a single group match, no knockout node.
    const nodes: RoadmapNode[] = [
      standingsNode({ id: 's1', x: 0, y: 0 }),
      matchNode({ id: 'gm1', x: 300, y: 200, stage: 'GROUP_STAGE' }),
    ];
    renderFit(nodes);
    flushFrame();

    expect(countFrames()).toBe(1);
    expect(framedBounds()).toEqual(boundsOf([...nodes]));
  });
});

describe('useFitOnChange — cold-load focus frame is ONE-TIME [hook case 10, AC-3]', () => {
  it('a refetch after a ?focus=knockout cold-load frame fires NO second frame (fit-once holds)', () => {
    setFocusParam('knockout');
    const nodes = mixedFitGraph();
    const { rerender } = renderHook(({ n }) => useFitOnChange(n.length, n), {
      initialProps: { n: nodes },
    });
    flushFrame();
    expect(countFrames()).toBe(1);
    expect(framedBounds()).toEqual(boundsOf(nodes.filter(isKnockoutNode)));

    // A refetch mints a brand-new graph (new identities, +1 node). The param is
    // STILL present — it must NOT reopen the fit-once guard.
    rerender({ n: mixedFitGraph('-v2') });
    flushFrame();

    expect(countFrames()).toBe(1);
  });

  it('repeated focus-param refetches never re-frame (the param does not reopen the guard)', () => {
    setFocusParam('groups');
    const { rerender } = renderHook(({ n }) => useFitOnChange(n.length, n), {
      initialProps: { n: mixedFitGraph() },
    });
    flushFrame();
    expect(countFrames()).toBe(1);

    for (let i = 0; i < 4; i += 1) {
      rerender({ n: mixedFitGraph(`-r${i}`) });
      flushFrame();
    }

    expect(countFrames()).toBe(1);
  });
});

describe('useFitOnChange — empty-first then populate with a param present [hook case 10 timing, AC-1]', () => {
  it('an empty initial render with ?focus=knockout does NOT spend the guard; the populate frames the subset', () => {
    setFocusParam('knockout');
    const nodes = mixedFitGraph();
    const { rerender } = renderHook(({ n }) => useFitOnChange(n.length, n), {
      initialProps: { n: [] as RoadmapNode[] },
    });

    // Empty render: the guard must not be spent (no camera-moving frame).
    flushFrame();
    expect(countFrames()).toBe(0);

    // Data lands → the one-time frame targets the resolved knockout subset.
    rerender({ n: nodes });
    flushFrame();
    expect(countFrames()).toBe(1);
    expect(framedBounds()).toEqual(boundsOf(nodes.filter(isKnockoutNode)));
  });
});

describe('useFitOnChange — fixture mixed graph cold-load smoke [AC-1]', () => {
  it('frames the knockout subset of the shared mixedGraph() fixture on a ?focus=knockout cold load', () => {
    setFocusParam('knockout');
    const nodes = mixedGraph();
    renderFit(nodes);
    flushFrame();

    expect(countFrames()).toBe(1);
    expect(framedBounds()).toEqual(boundsOf(nodes.filter(isKnockoutNode)));
    expect(framedBounds()).not.toEqual(boundsOf([...nodes]));
  });
});

// ===========================================================================
// readColdLoadFocusParam — the WITH-window extraction branch [Acceptance #5].
// This file runs under jsdom (real `window.location`), so it is the correct home
// for the URL-reading branch: the reader must return the EXACT raw `?focus=`
// value the cold load arrived with. The NO-window branch (SSR/node → null) is
// covered in `focus-target.test.ts` (node env). `setFocusParam` drives the real
// jsdom URL, reset to bare by `beforeEach`, so each case is isolated.
// ===========================================================================

describe('readColdLoadFocusParam — reads the raw `?focus=` value from the URL [Acceptance #5]', () => {
  it('returns null when no `?focus=` param is present (bare cold load)', () => {
    // `beforeEach` clears the param; the bare URL must read as null, not "".
    expect(readColdLoadFocusParam()).toBeNull();
  });

  it('returns the verbatim view token for `?focus=knockout`', () => {
    setFocusParam('knockout');
    expect(readColdLoadFocusParam()).toBe('knockout');
  });

  it('returns a raw match id verbatim (NOT validated against the RoadmapFocus union)', () => {
    setFocusParam('ko1');
    expect(readColdLoadFocusParam()).toBe('ko1');
  });

  it('returns an unknown garbage token verbatim (validation is the resolver\'s job, not the reader\'s)', () => {
    setFocusParam('%%%garbage%%%');
    // The reader is a thin URL reader: it surfaces the decoded raw value and lets
    // `resolveColdLoadFocusBounds` decide it is unresolvable (→ default fit).
    expect(readColdLoadFocusParam()).toBe('%%%garbage%%%');
  });

  it('reads only the LATEST value after the URL changes (no stale capture)', () => {
    setFocusParam('groups');
    expect(readColdLoadFocusParam()).toBe('groups');
    setFocusParam('knockout');
    expect(readColdLoadFocusParam()).toBe('knockout');
  });
});
