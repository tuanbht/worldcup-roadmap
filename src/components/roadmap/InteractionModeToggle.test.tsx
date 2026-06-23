// @vitest-environment jsdom
//
// Component tests for the canvas interaction-mode toggle (plan Test Strategy:
// "Component — InteractionModeToggle.test.tsx"; Acceptance #4, #7).
//
// The toggle is the user-facing control that switches 'zoom' <-> 'pan'. It must:
//   - render both options as an accessible radiogroup of radio buttons (AF-5),
//   - reflect the active mode via aria-checked (not aria-selected — no tabpanels),
//   - call onChange on click AND keyboard activation,
//   - show a hint describing the ACTIVE zoom affordance,
//   - expose an aria-label.
//
// AF-5: A mode switch with no tabpanels must use role=radiogroup / role=radio /
// aria-checked instead of role=tablist / role=tab / aria-selected. The roving
// tabindex + ArrowLeft/Right/Home/End keyboard nav (CR-4) is preserved.
//
// The component is rendered inside a ReactFlowProvider because it mounts a React
// Flow <Panel>. We assert behaviour + ARIA contract, not Panel markup details.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import type { InteractionMode } from '@/features/roadmap/interaction-mode';
import { InteractionModeToggle } from './InteractionModeToggle';

function renderToggle(
  mode: InteractionMode = 'zoom',
  onChange: (mode: InteractionMode) => void = vi.fn(),
) {
  return render(
    <ReactFlowProvider>
      <InteractionModeToggle mode={mode} onChange={onChange} />
    </ReactFlowProvider>,
  );
}

// AF-5: InteractionModeToggle must use radiogroup/radio/aria-checked (no panels)
describe('InteractionModeToggle — ARIA structure (AF-5: radiogroup)', () => {
  it('renders an accessible radiogroup with a label', () => {
    renderToggle('zoom');
    const group = screen.getByRole('radiogroup');
    expect(group).toBeInTheDocument();
    expect(group).toHaveAccessibleName(/scroll|zoom|pan/i);
  });

  it('renders both Zoom and Pan as radio buttons', () => {
    renderToggle('zoom');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /zoom/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /pan/i })).toBeInTheDocument();
  });

  it('marks the active mode with aria-checked (zoom)', () => {
    renderToggle('zoom');
    expect(screen.getByRole('radio', { name: /zoom/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /pan/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('marks the active mode with aria-checked (pan)', () => {
    renderToggle('pan');
    expect(screen.getByRole('radio', { name: /pan/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /zoom/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('does NOT render a tablist or tab roles', () => {
    renderToggle('zoom');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });
});

describe('InteractionModeToggle — switching', () => {
  it('calls onChange("pan") exactly once when the Pan radio is clicked', async () => {
    const onChange = vi.fn();
    renderToggle('zoom', onChange);
    await userEvent.click(screen.getByRole('radio', { name: /pan/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('pan');
  });

  it('calls onChange("zoom") when the Zoom radio is clicked from pan mode', async () => {
    const onChange = vi.fn();
    renderToggle('pan', onChange);
    await userEvent.click(screen.getByRole('radio', { name: /zoom/i }));
    expect(onChange).toHaveBeenCalledWith('zoom');
  });

  // Enter and Space activate radio buttons; both must work.
  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ])('activates a focused radio with the %s key', async (_label, keystroke) => {
    const onChange = vi.fn();
    renderToggle('zoom', onChange);
    screen.getByRole('radio', { name: /pan/i }).focus();

    await userEvent.keyboard(keystroke);

    expect(onChange).toHaveBeenCalledWith('pan');
  });
});

// --- CR-4: roving tabindex + arrow/Home/End keyboard navigation -----------
//
// The roving-tabindex pattern is preserved for the radiogroup variant: the
// active radio carries tabIndex=0; the rest carry tabIndex=-1. ArrowLeft/Right
// + ArrowUp/Down + Home/End all navigate and switch the mode (wrapping).

/** The two interaction modes in radiogroup order: index 0 = zoom, 1 = pan. */
const MODE_LABELS: Record<InteractionMode, RegExp> = {
  zoom: /zoom/i,
  pan: /pan/i,
};

function radio(mode: InteractionMode): HTMLElement {
  return screen.getByRole('radio', { name: MODE_LABELS[mode] });
}

describe('InteractionModeToggle — CR-4 roving tabindex', () => {
  // Exactly one option carries tabIndex=0 (the active mode); the other is
  // removed from the tab order with tabIndex=-1 (AC4). Parametrized over both
  // modes so the invariant is asserted for whichever option is active.
  it.each<[InteractionMode, InteractionMode]>([
    ['zoom', 'pan'],
    ['pan', 'zoom'],
  ])(
    'puts only the active "%s" option in the tab order (other tabIndex=-1)',
    (active, inactive) => {
      renderToggle(active);
      expect(radio(active)).toHaveAttribute('tabindex', '0');
      expect(radio(inactive)).toHaveAttribute('tabindex', '-1');
    },
  );
});

describe('InteractionModeToggle — CR-4 arrow / Home / End navigation', () => {
  // Each row: a starting mode, the key pressed, and the mode it must move to.
  // Covers Left/Right + Up/Down (the handler mirrors MatchDetailTabs, which
  // treats vertical arrows as horizontal) and Home/End, including the
  // wrap-around boundaries (zoom←→pan in both directions).
  it.each<[string, InteractionMode, string, InteractionMode]>([
    ['ArrowRight advances zoom -> pan', 'zoom', '{ArrowRight}', 'pan'],
    ['ArrowDown advances zoom -> pan (vertical mirror)', 'zoom', '{ArrowDown}', 'pan'],
    ['ArrowLeft wraps zoom -> pan', 'zoom', '{ArrowLeft}', 'pan'],
    ['ArrowUp wraps zoom -> pan (vertical mirror)', 'zoom', '{ArrowUp}', 'pan'],
    ['ArrowRight wraps pan -> zoom', 'pan', '{ArrowRight}', 'zoom'],
    ['ArrowLeft retreats pan -> zoom', 'pan', '{ArrowLeft}', 'zoom'],
    ['End jumps to last (pan)', 'zoom', '{End}', 'pan'],
    ['Home jumps to first (zoom)', 'pan', '{Home}', 'zoom'],
  ])('%s: switches mode once and moves focus to the new radio', async (_label, from, key, to) => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderToggle(from, onChange);
    radio(from).focus();

    await user.keyboard(key);

    // Activation switches the interaction mode exactly once...
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(to);
    // ...and roving focus follows the newly active option.
    expect(radio(to)).toHaveFocus();
  });

  it('ignores unrelated keys: a printable key changes neither mode nor focus', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderToggle('zoom', onChange);
    radio('zoom').focus();

    // 'x' is not an arrow/Home/End nav key, so the roving handler must return
    // early (no preventDefault, no onChange, no focus move).
    await user.keyboard('x');

    expect(onChange).not.toHaveBeenCalled();
    expect(radio('zoom')).toHaveFocus();
  });
});

describe('InteractionModeToggle — active-affordance hint', () => {
  it('shows only the "Scroll to zoom" affordance in zoom mode', () => {
    renderToggle('zoom');
    expect(screen.getByText(/scroll to zoom/i)).toBeInTheDocument();
    // The zoom hint must not also advertise the pan affordance.
    expect(screen.queryByText(/scroll to pan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/⌘-scroll to zoom/i)).not.toBeInTheDocument();
  });

  it('shows the scroll-to-pan plus ⌘-scroll-to-zoom affordance in pan mode', () => {
    renderToggle('pan');
    // Both affordances must be advertised; `{ exact: false }` tolerates the
    // phrases sharing a node (e.g. "Scroll to pan · ⌘-scroll to zoom").
    expect(screen.getByText(/scroll to pan/i, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/⌘-scroll to zoom/i, { exact: false })).toBeInTheDocument();
  });

  it('switches the hint when the active mode flips zoom -> pan', () => {
    const { rerender } = renderToggle('zoom');
    expect(screen.getByText(/scroll to zoom/i)).toBeInTheDocument();

    rerender(
      <ReactFlowProvider>
        <InteractionModeToggle mode="pan" onChange={vi.fn()} />
      </ReactFlowProvider>,
    );

    expect(screen.getByText(/scroll to pan/i)).toBeInTheDocument();
  });
});
