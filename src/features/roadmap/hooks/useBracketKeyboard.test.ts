// @vitest-environment jsdom
//
// Regression spec for the explicit "F"-key fit — requirement
// 2026-06-24-0951-preserve-viewport-on-refetch (plan Test Strategy behaviors
// 10–11; Acceptance #5). The requirement removes only the AUTOMATIC,
// refetch-driven re-frame; the EXPLICIT fits ("F" key / fit control /
// FocusMatchButton) must still re-frame on demand.
//
// `useBracketKeyboard` owns the "F" key (`fitView`), "0" (reset zoom via
// `zoomTo`), and "Escape" (clear selection). It calls `fitView` DIRECTLY off
// `useReactFlow` — NOT via the two guarded hooks (`useFitOnChange` /
// `useFocusCamera`) — so the viewport-preservation fix is structurally unable to
// regress it. Its only callers (RoadmapCanvas.test.tsx) mock the hook out, so it
// had 0% coverage; this spec closes that gap and proves the explicit fit the
// requirement names still works.
//
// HARNESS: mock `@xyflow/react`'s `useReactFlow` to expose `fitView` / `zoomTo`
// spies (mirroring useFocusMatch.test.tsx), `renderHook` the hook, then dispatch
// real `window` keydown events.
//
// NOTE: unlike the other three specs in this requirement, the behavior here
// ALREADY exists, so these cases pass today — they are a regression guard
// asserting the fix did not break the explicit fit, not a RED-then-GREEN driver.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';

const fitView = vi.fn(() => Promise.resolve(true));
const zoomTo = vi.fn(() => Promise.resolve(true));
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ fitView, zoomTo }),
}));

// Imported AFTER the mock so the hook binds to it.
import { useBracketKeyboard } from './useBracketKeyboard';

const FIT_ARGS = { padding: 0.12, duration: 300 };

/** Mount the hook with an optional onEscape spy (defaults to a no-op spy). */
function mountKeyboard(onEscape: () => void = vi.fn()) {
  renderHook(() => useBracketKeyboard(onEscape));
}

/** Dispatch a real keydown on `window`, optionally from a specific target. */
function pressKey(key: string, target?: EventTarget) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true });
  if (target) Object.defineProperty(event, 'target', { value: target, configurable: true });
  window.dispatchEvent(event);
}

/** Run `fn` with a freshly appended element, removing it afterward. */
function withElement<T extends HTMLElement>(el: T, fn: (el: T) => void) {
  document.body.appendChild(el);
  try {
    fn(el);
  } finally {
    el.remove();
  }
}

beforeEach(() => {
  fitView.mockClear();
  zoomTo.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('useBracketKeyboard — the "F" key re-frames on demand [Behavior 10, AC-5]', () => {
  it('a lowercase "f" calls fitView with { padding: 0.12, duration: 300 }', () => {
    mountKeyboard();
    pressKey('f');
    expect(fitView).toHaveBeenCalledTimes(1);
    expect(fitView).toHaveBeenCalledWith(FIT_ARGS);
  });

  it('an uppercase "F" (shift held) also calls fitView', () => {
    mountKeyboard();
    pressKey('F');
    expect(fitView).toHaveBeenCalledTimes(1);
    expect(fitView).toHaveBeenCalledWith(FIT_ARGS);
  });
});

describe('useBracketKeyboard — the other shortcuts stay correct [Behavior 11]', () => {
  it('"0" resets the zoom via zoomTo(1, { duration: 300 }) and does not fit', () => {
    mountKeyboard();
    pressKey('0');
    expect(zoomTo).toHaveBeenCalledTimes(1);
    expect(zoomTo).toHaveBeenCalledWith(1, { duration: 300 });
    expect(fitView).not.toHaveBeenCalled();
  });

  it('"Escape" invokes the onEscape callback and does not fit', () => {
    const onEscape = vi.fn();
    mountKeyboard(onEscape);
    pressKey('Escape');
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(fitView).not.toHaveBeenCalled();
  });

  it('an unrelated key (ArrowDown) touches neither the fit nor the zoom', () => {
    const onEscape = vi.fn();
    mountKeyboard(onEscape);
    pressKey('ArrowDown');
    expect(fitView).not.toHaveBeenCalled();
    expect(zoomTo).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });
});

describe('useBracketKeyboard — typing in a field is not a fit (input guard) [Behavior 11]', () => {
  it('an "f" originating from an INPUT element does not call fitView', () => {
    mountKeyboard();
    withElement(document.createElement('input'), (input) => {
      pressKey('f', input);
      expect(fitView).not.toHaveBeenCalled();
    });
  });

  it('an "f" originating from a contentEditable element does not call fitView', () => {
    mountKeyboard();
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom does not derive `isContentEditable` from the attribute — force it on
    // the target the handler reads.
    Object.defineProperty(editable, 'isContentEditable', { value: true, configurable: true });
    withElement(editable, (el) => {
      pressKey('f', el);
      expect(fitView).not.toHaveBeenCalled();
    });
  });
});

describe('useBracketKeyboard — cleanup [Behavior 11]', () => {
  it('removes its keydown listener on unmount (a later "f" does not fit)', () => {
    const { unmount } = renderHook(() => useBracketKeyboard(vi.fn()));
    unmount();
    pressKey('f');
    expect(fitView).not.toHaveBeenCalled();
  });
});
