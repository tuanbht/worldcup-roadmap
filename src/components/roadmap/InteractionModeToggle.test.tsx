// @vitest-environment jsdom
//
// Component tests for the canvas interaction-mode toggle (plan Test Strategy:
// "Component — InteractionModeToggle.test.tsx"; Acceptance #4, #7).
//
// The toggle is the user-facing control that switches 'zoom' <-> 'pan'. It must:
//   - render both options as an accessible tablist of tabs,
//   - reflect the active mode via aria-selected,
//   - call onChange on click AND keyboard activation,
//   - show a hint describing the ACTIVE zoom affordance,
//   - expose an aria-label.
//
// The component is rendered inside a ReactFlowProvider because it mounts a React
// Flow <Panel>. We assert behaviour + ARIA contract, not Panel markup details.
//
// RED until `src/components/roadmap/InteractionModeToggle.tsx` exists.
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

describe('InteractionModeToggle — ARIA structure', () => {
  it('renders an accessible tablist with a label', () => {
    renderToggle('zoom');
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeInTheDocument();
    expect(tablist).toHaveAccessibleName(/scroll|zoom|pan/i);
  });

  it('renders both Zoom and Pan as tabs', () => {
    renderToggle('zoom');
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(screen.getByRole('tab', { name: /zoom/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /pan/i })).toBeInTheDocument();
  });

  it('marks the active mode with aria-selected (zoom)', () => {
    renderToggle('zoom');
    expect(screen.getByRole('tab', { name: /zoom/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /pan/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the active mode with aria-selected (pan)', () => {
    renderToggle('pan');
    expect(screen.getByRole('tab', { name: /pan/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /zoom/i })).toHaveAttribute('aria-selected', 'false');
  });
});

describe('InteractionModeToggle — switching', () => {
  it('calls onChange("pan") exactly once when the Pan tab is clicked', async () => {
    const onChange = vi.fn();
    renderToggle('zoom', onChange);
    await userEvent.click(screen.getByRole('tab', { name: /pan/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('pan');
  });

  it('calls onChange("zoom") when the Zoom tab is clicked from pan mode', async () => {
    const onChange = vi.fn();
    renderToggle('pan', onChange);
    await userEvent.click(screen.getByRole('tab', { name: /zoom/i }));
    expect(onChange).toHaveBeenCalledWith('zoom');
  });

  // Enter and Space are the WAI-ARIA tab activation keys; both must work.
  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ])('activates a focused tab with the %s key', async (_label, keystroke) => {
    const onChange = vi.fn();
    renderToggle('zoom', onChange);
    screen.getByRole('tab', { name: /pan/i }).focus();

    await userEvent.keyboard(keystroke);

    expect(onChange).toHaveBeenCalledWith('pan');
  });
});

// --- CR-4: roving tabindex + arrow/Home/End keyboard navigation -----------
//
// RED until InteractionModeToggle wires roving tabindex (active tab
// tabIndex=0, the rest tabIndex=-1) and an onKeyDown handler mirroring
// MatchDetailTabs (ArrowLeft/Right + ArrowUp/Down + Home/End, all wrapping)
// into SegmentedControl. The current toggle passes neither getOptionId nor
// onKeyDown, so all tabs share the default tabIndex and arrow keys do nothing.

/** The two interaction modes in tablist order: index 0 = zoom, 1 = pan. */
const MODE_LABELS: Record<InteractionMode, RegExp> = {
  zoom: /zoom/i,
  pan: /pan/i,
};

function tab(mode: InteractionMode): HTMLElement {
  return screen.getByRole('tab', { name: MODE_LABELS[mode] });
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
      expect(tab(active)).toHaveAttribute('tabindex', '0');
      expect(tab(inactive)).toHaveAttribute('tabindex', '-1');
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
  ])('%s: switches mode once and moves focus to the new tab', async (_label, from, key, to) => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderToggle(from, onChange);
    tab(from).focus();

    await user.keyboard(key);

    // Activation switches the interaction mode exactly once...
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(to);
    // ...and roving focus follows the newly active option.
    expect(tab(to)).toHaveFocus();
  });

  it('ignores unrelated keys: a printable key changes neither mode nor focus', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderToggle('zoom', onChange);
    tab('zoom').focus();

    // 'x' is not an arrow/Home/End nav key, so the roving handler must return
    // early (no preventDefault, no onChange, no focus move).
    await user.keyboard('x');

    expect(onChange).not.toHaveBeenCalled();
    expect(tab('zoom')).toHaveFocus();
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
