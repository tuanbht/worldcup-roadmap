// @vitest-environment jsdom
//
// Hook spec for `useFocusMatch` (plan Test Strategy: "Hook — useFocusMatch.test.tsx";
// Acceptance #10). The hook turns a matchId into an imperative camera center:
//   const node = getNode(matchId); if (!node) return;
//   setCenter(node.x + NODE_W/2, node.y + NODE_H/2, { zoom: FOCUS_ZOOM, duration: FOCUS_DURATION_MS });
//   onFocused?.(matchId);
//
// We mock `@xyflow/react`'s `useReactFlow` so the test asserts the contract
// (setCenter args + onFocused) WITHOUT a live React Flow instance — no DOM
// geometry, fully deterministic.
//
// RED until `useFocusMatch` is implemented — the stub's `focusMatch` throws, so
// the "centers on the node" assertions fail as "not implemented".
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NODE_W, NODE_H } from '../layout/layout-constants';
import { FOCUS_ZOOM, FOCUS_DURATION_MS } from '../focus-target';

// Mutable test doubles the mocked `useReactFlow` closes over, reset per test.
const setCenter = vi.fn();
const getNode = vi.fn();

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ setCenter, getNode }),
}));

// Imported AFTER the mock is registered so the hook binds to the mocked module.
import { useFocusMatch } from './useFocusMatch';

beforeEach(() => {
  setCenter.mockReset();
  getNode.mockReset();
});

describe('useFocusMatch — centers the camera on a found node [Acceptance #10]', () => {
  it('calls setCenter with the node center and the named focus constants', () => {
    const NODE_X = 400;
    const NODE_Y = 250;
    getNode.mockReturnValue({ id: 'm1', position: { x: NODE_X, y: NODE_Y } });

    const onFocused = vi.fn();
    const { result } = renderHook(() => useFocusMatch({ onFocused }));
    result.current.focusMatch('m1');

    expect(getNode).toHaveBeenCalledWith('m1');
    expect(setCenter).toHaveBeenCalledTimes(1);
    expect(setCenter).toHaveBeenCalledWith(
      NODE_X + NODE_W / 2,
      NODE_Y + NODE_H / 2,
      { zoom: FOCUS_ZOOM, duration: FOCUS_DURATION_MS },
    );
  });

  it('invokes onFocused with the focused matchId for selection/highlight', () => {
    getNode.mockReturnValue({ id: 'm7', position: { x: 0, y: 0 } });
    const onFocused = vi.fn();

    const { result } = renderHook(() => useFocusMatch({ onFocused }));
    result.current.focusMatch('m7');

    expect(onFocused).toHaveBeenCalledTimes(1);
    expect(onFocused).toHaveBeenCalledWith('m7');
  });
});

describe('useFocusMatch — missing node is a safe no-op [Acceptance #10]', () => {
  it('does NOT move the camera or fire onFocused when getNode returns undefined', () => {
    getNode.mockReturnValue(undefined);
    const onFocused = vi.fn();

    const { result } = renderHook(() => useFocusMatch({ onFocused }));
    result.current.focusMatch('missing');

    // It DID look the node up — the no-op is a deliberate guard, not an early skip.
    expect(getNode).toHaveBeenCalledWith('missing');
    expect(setCenter).not.toHaveBeenCalled();
    expect(onFocused).not.toHaveBeenCalled();
  });
});

describe('useFocusMatch — stable identity', () => {
  it('returns the same focusMatch reference across re-renders with the same options', () => {
    getNode.mockReturnValue({ id: 'm1', position: { x: 10, y: 20 } });
    const onFocused = vi.fn();
    const { result, rerender } = renderHook(() => useFocusMatch({ onFocused }));
    const first = result.current.focusMatch;
    rerender();
    expect(result.current.focusMatch).toBe(first);
  });

  it('a focusMatch captured before a re-render still centers using the latest onFocused', () => {
    // Guards against a stale-closure impl: a handle taken from an earlier render
    // must remain callable AND route to the current onFocused (not a dead one).
    getNode.mockReturnValue({ id: 'm3', position: { x: 5, y: 5 } });
    const firstFocused = vi.fn();
    const { result, rerender } = renderHook(
      ({ onFocused }) => useFocusMatch({ onFocused }),
      { initialProps: { onFocused: firstFocused } },
    );
    const capturedHandle = result.current.focusMatch;

    const secondFocused = vi.fn();
    rerender({ onFocused: secondFocused });
    capturedHandle('m3');

    expect(setCenter).toHaveBeenCalledTimes(1);
    expect(secondFocused).toHaveBeenCalledWith('m3');
    expect(firstFocused).not.toHaveBeenCalled();
  });

  it('works without options (no onFocused) and still centers the node', () => {
    getNode.mockReturnValue({ id: 'm2', position: { x: 100, y: 200 } });
    const { result } = renderHook(() => useFocusMatch());
    result.current.focusMatch('m2');
    expect(setCenter).toHaveBeenCalledWith(
      100 + NODE_W / 2,
      200 + NODE_H / 2,
      { zoom: FOCUS_ZOOM, duration: FOCUS_DURATION_MS },
    );
  });
});
