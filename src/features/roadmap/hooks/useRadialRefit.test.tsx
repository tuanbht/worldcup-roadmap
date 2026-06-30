// @vitest-environment jsdom
//
// Unit spec for `useRadialRefit(mode)` — the dedicated re-fit-on-layout-flip
// camera effect (requirement 2026-06-30-1104; plan Interaction wiring [H3] /
// Acceptance #8). It fires `fitView` when `mode` CHANGES, SKIPS the first run
// (the initial frame is owned elsewhere), and is guarded on `mode` (NOT a node
// array) so a refetch never re-frames.
//
// HARNESS: mock `@xyflow/react`'s `useReactFlow` so jsdom needs no live RF engine
// (mirroring useFitOnChange.test.tsx); `vi.useFakeTimers()` drives any internal
// scheduling deterministically. RED until useRadialRefit fires fitView on a mode
// change (today the stub is a no-op), so the change-fires-fit assertions fail on
// a MISSING call, not an import error.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { LayoutMode } from '../graph-model';

/** Models React Flow's `fitView(options?)` — typed so `.mock.calls[0][0]` reads
 *  the options arg the hook passes (e.g. `{ duration: 0 }`). */
const fitView = vi.fn((_options?: { duration?: number; padding?: number }) =>
  Promise.resolve(true),
);
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ fitView }),
}));

import { useRadialRefit } from './useRadialRefit';

function renderRefit(initial: LayoutMode) {
  return renderHook(({ mode }) => useRadialRefit(mode), { initialProps: { mode: initial } });
}

/** Flush any internal scheduling timer so a pending fit lands. */
function flush() {
  vi.advanceTimersByTime(120);
}

beforeEach(() => {
  vi.useFakeTimers();
  fitView.mockClear();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('useRadialRefit — skips the first run [H3]', () => {
  it('does NOT fit on mount (the initial frame is owned by the cold-load fitter)', () => {
    renderRefit('grid');
    flush();
    expect(fitView).not.toHaveBeenCalled();
  });
});

describe('useRadialRefit — fits on a mode change [H3 / Acceptance #8]', () => {
  it('fires fitView when the mode flips grid -> circle', () => {
    const { rerender } = renderRefit('grid');
    flush();
    expect(fitView).not.toHaveBeenCalled();

    rerender({ mode: 'circle' });
    flush();
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it('snaps with duration 0 (no pan flake) on the mode flip', () => {
    const { rerender } = renderRefit('grid');
    flush();
    rerender({ mode: 'circle' });
    flush();

    expect(fitView).toHaveBeenCalledTimes(1);
    const arg = fitView.mock.calls[0]?.[0];
    expect(arg?.duration).toBe(0);
  });

  it('fits again when the mode flips back circle -> grid', () => {
    const { rerender } = renderRefit('grid');
    flush();
    rerender({ mode: 'circle' });
    flush();
    expect(fitView).toHaveBeenCalledTimes(1);

    rerender({ mode: 'grid' });
    flush();
    expect(fitView).toHaveBeenCalledTimes(2);
  });
});

describe('useRadialRefit — guarded on mode, not nodes [H3]', () => {
  it('does NOT re-fit when the SAME mode re-renders (a refetch never re-frames)', () => {
    const { rerender } = renderRefit('circle');
    flush();
    expect(fitView).not.toHaveBeenCalled(); // first run skipped

    // Several same-mode re-renders model refetch churn — none may fit.
    for (let i = 0; i < 4; i += 1) {
      rerender({ mode: 'circle' });
      flush();
    }
    expect(fitView).not.toHaveBeenCalled();
  });
});
