// @vitest-environment jsdom
//
// Integration spec — the transform-level proof for requirement
// 2026-06-24-0951-preserve-viewport-on-refetch (plan Test Strategy behavior 12;
// Acceptance #4, the PRIMARY acceptance criterion). The other three specs assert
// "no frame call" on each hook in isolation; this one asserts the OBSERVABLE
// outcome the user cares about: the React Flow viewport transform (x, y, zoom) is
// UNCHANGED across a real refetch driven through BOTH camera hooks together.
//
// HARNESS RATIONALE: the existing RoadmapCanvas.test.tsx mocks out
// `useFitOnChange` / `useFocusCamera` / `useRoadmapGraph`, so it cannot exercise
// the real camera behavior. Per the plan's stated fallback ("a focused harness
// component that calls useFitOnChange + useFocusCamera against the same swappable
// graph — still a transform-level assertion across both hooks"), this file mounts
// a lean harness that runs the REAL `useFitOnChange` + `useFocusCamera` against a
// swappable node set, with a mocked `useReactFlow` that maintains a real viewport
// STORE. `setViewport`/`fitView`/`fitBounds` mutate the store (modelling React
// Flow's transform), so we read the actual (x, y, zoom) before and after a
// refetch and assert equality — not a single-hook "spy not called" proxy.
//
// A refetch is modelled exactly as production does it: a NEW tournament ref →
// rebuilt graph → a brand-new `nodes` array identity (run once WITHOUT and once
// WITH a node-count change). The user's zoom/pan is seeded by writing a
// non-default viewport AFTER the first auto-frame settles.
//
// RED REASON: today both hooks re-frame when the rebuilt `nodes` identity / count
// changes on a refetch, overwriting the seeded viewport — so the captured
// (x, y, zoom) DIFFERS after the refetch and the assertion FAILS. It goes GREEN
// once the fit-once guard + the focus-change gate land.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { RoadmapFocus, RoadmapNode } from '@/features/roadmap/graph-model';
import { matchNode } from '@/features/roadmap/hooks/__test-support__/camera-nodes';

// ---- A live viewport STORE the mocked useReactFlow reads/writes ------------
// This models React Flow's transform: the first auto-frame writes it, the user's
// zoom/pan overwrites it, and a refetch-driven re-frame (the bug) would overwrite
// it AGAIN. We read the store before/after the refetch to assert preservation.
interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };
// Distinct sentinels so a stray fallback fit is detectable as a SPECIFIC change.
const FIT_VIEW_SENTINEL: Viewport = { x: -1, y: -1, zoom: 0.2 };
const FIT_BOUNDS_SENTINEL: Viewport = { x: -2, y: -2, zoom: 0.3 };
/** The arbitrary spot the user zooms/pans to before the refetch. */
const SEEDED_VIEWPORT: Viewport = { x: -812.5, y: -1337.25, zoom: 0.74 };

let viewport: Viewport = { ...DEFAULT_VIEWPORT };

const setViewport = vi.fn((vp: Viewport) => {
  viewport = { ...vp };
  return Promise.resolve(true);
});
const fitView = vi.fn(() => {
  viewport = { ...FIT_VIEW_SENTINEL };
  return Promise.resolve(true);
});
const fitBounds = vi.fn(() => {
  viewport = { ...FIT_BOUNDS_SENTINEL };
  return Promise.resolve(true);
});
const getViewport = vi.fn(() => viewport);

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ setViewport, fitView, fitBounds, getViewport }),
}));

// Real hooks bind to the mocked module above.
import { useFitOnChange } from '@/features/roadmap/hooks/useFitOnChange';
import { useFocusCamera } from '@/features/roadmap/hooks/useFocusCamera';

// ---- A measurable .react-flow pane so frameTopAligned can settle ----------
// `frameTopAligned` reads `.react-flow`'s getBoundingClientRect; jsdom returns
// zeros by default. We mount a sized stand-in so the FIRST frame uses the
// deterministic top-aligned setViewport (not the centered fitView fallback),
// matching production's first-load frame.
function installMeasurablePane(): () => void {
  const el = document.createElement('div');
  el.className = 'react-flow';
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 1440,
      height: 900,
      top: 0,
      left: 0,
      right: 1440,
      bottom: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  document.body.appendChild(el);
  return () => el.remove();
}

// ---- Fixtures --------------------------------------------------------------
/**
 * A fresh-identity graph. `live` flips a match's status (the kind of in-place
 * content change a refetch brings) and `extra` adds a structural node so the
 * count-change case is covered. Positions are stable (no relayout on refetch).
 */
function buildGraph(opts: { live?: boolean; extra?: boolean } = {}): RoadmapNode[] {
  const base: RoadmapNode[] = [
    matchNode({ id: 'm1', x: 0, y: 0, status: opts.live ? 'live' : 'scheduled' }),
    matchNode({ id: 'm2', x: 320, y: 0 }),
    matchNode({ id: 'm3', x: 640, y: 400, stage: 'ROUND_OF_16' }),
  ];
  if (opts.extra) base.push(matchNode({ id: 'm4', x: 960, y: 800, stage: 'QUARTER_FINALS' }));
  return base;
}

// ---- Harness: runs BOTH real camera hooks against a swappable graph --------
function CameraHarness({ nodes, focus }: { nodes: RoadmapNode[]; focus: RoadmapFocus }) {
  // The call signatures mirror RoadmapCanvas.tsx:125,132 exactly.
  useFitOnChange(nodes.length, nodes);
  useFocusCamera(focus, nodes);
  return null;
}

/** Advance past every internal timer: useFitOnChange (60ms) + useFocusCamera
 *  (40ms) + the 8×50ms retry budget, with margin. */
function flushAllFrames() {
  act(() => {
    vi.advanceTimersByTime(60 + 40 + 8 * 50 + 10);
  });
}

/** Render the canvas, let the first auto-frame settle, then seed the user's zoom/pan. */
function renderWithSeededViewport(nodes: RoadmapNode[], focus: RoadmapFocus = 'all') {
  const utils = render(<CameraHarness nodes={nodes} focus={focus} />);
  flushAllFrames();
  act(() => {
    setViewport(SEEDED_VIEWPORT);
  });
  expect(getViewport()).toEqual(SEEDED_VIEWPORT);
  return utils;
}

let removePane: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  viewport = { ...DEFAULT_VIEWPORT };
  setViewport.mockClear();
  fitView.mockClear();
  fitBounds.mockClear();
  getViewport.mockClear();
  removePane = installMeasurablePane();
});

afterEach(() => {
  removePane();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('RoadmapCanvas refetch — viewport transform is preserved [Behavior 12, AC-4]', () => {
  it('a same-count refetch (scores/status update in place) leaves (x, y, zoom) unchanged', () => {
    const { rerender } = renderWithSeededViewport(buildGraph());

    // A refetch mints a new tournament → rebuilt graph (new identity, SAME count,
    // m1 now "live"). Re-render the harness with the fresh graph.
    rerender(<CameraHarness nodes={buildGraph({ live: true })} focus="all" />);
    flushAllFrames();

    // The seeded zoom/pan MUST survive the refetch.
    expect(getViewport()).toEqual(SEEDED_VIEWPORT);
  });

  it('a refetch that adds a new match node (count change) also leaves the transform unchanged', () => {
    const { rerender } = renderWithSeededViewport(buildGraph());

    // Refetch returns a genuinely new match node (3 → 4) — a structural change
    // that must NOT yank the camera.
    rerender(<CameraHarness nodes={buildGraph({ live: true, extra: true })} focus="all" />);
    flushAllFrames();

    expect(getViewport()).toEqual(SEEDED_VIEWPORT);
  });

  it('repeated refetches (a burst of focus-driven refetches) keep the seeded transform', () => {
    const { rerender } = renderWithSeededViewport(buildGraph());

    for (let i = 0; i < 4; i += 1) {
      rerender(<CameraHarness nodes={buildGraph({ live: i % 2 === 0 })} focus="all" />);
      flushAllFrames();
    }

    expect(getViewport()).toEqual(SEEDED_VIEWPORT);
  });

  it('an explicit focus change AFTER a refetch still re-frames (the gate does not over-block)', () => {
    // AC-5 at the integration level: the no-op gate must not swallow a real
    // StageToggle. After a refetch, switching focus to "groups" must move the
    // camera (here: the fitBounds sentinel), proving on-demand fit still works.
    const { rerender } = renderWithSeededViewport(buildGraph());

    rerender(<CameraHarness nodes={buildGraph({ live: true })} focus="all" />);
    flushAllFrames();
    expect(getViewport()).toEqual(SEEDED_VIEWPORT);

    rerender(<CameraHarness nodes={buildGraph({ live: true })} focus="groups" />);
    flushAllFrames();

    expect(fitBounds).toHaveBeenCalled();
    expect(getViewport()).toEqual(FIT_BOUNDS_SENTINEL);
  });

  it('the FIRST load still frames the bracket (a top-aligned setViewport runs once)', () => {
    // Regression guard for AC-2: removing the AUTOMATIC refetch re-frame must not
    // remove the first-load frame. The deterministic top-aligned path is
    // setViewport (the measurable pane keeps it off the centered fallback).
    render(<CameraHarness nodes={buildGraph()} focus="all" />);
    flushAllFrames();

    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(fitView).not.toHaveBeenCalled();
  });
});
