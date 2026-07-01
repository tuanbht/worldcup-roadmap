// @vitest-environment jsdom
//
// Component / a11y spec for `LayoutToggle` — the layout-mode segmented switch
// (requirement 2026-07-01-1030; plan Test Strategy 11 / Acceptance #2). This is
// the FIRST LayoutToggle spec: it drives the THIRD "Matrix" option alongside Grid
// and Circle, in the existing `role="group"` "Switch the bracket layout" with the
// same button + `aria-pressed` a11y pattern.
//
// RED until `LayoutToggle.tsx` adds `{ value:'matrix', label:'Matrix' }` to
// OPTIONS: today only Grid + Circle render, so "Matrix" is absent — the assertions
// fail on the MISSING option (a real render gap), not a typo/import error. The
// toggle renders inside a React Flow `<Panel>`, so it is wrapped in a
// `ReactFlowProvider`.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import { LayoutToggle } from './LayoutToggle';
import type { LayoutMode } from '@/features/roadmap/graph-model';

function renderToggle(mode: LayoutMode, onChange = vi.fn()) {
  const view = render(
    <ReactFlowProvider>
      <LayoutToggle mode={mode} onChange={onChange} />
    </ReactFlowProvider>,
  );
  return { ...view, onChange };
}

describe('LayoutToggle — the three layout options [Test 11 / Acceptance #2]', () => {
  it('renders Grid, Circle AND Matrix buttons in the "Switch the bracket layout" group', () => {
    renderToggle('grid');
    const group = screen.getByRole('group', { name: 'Switch the bracket layout' });
    expect(group).toBeTruthy();
    // The existing two...
    expect(screen.getByRole('button', { name: 'Grid' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Circle' })).toBeTruthy();
    // ...plus the NEW third. RED: the toggle only has Grid + Circle today.
    expect(screen.getByRole('button', { name: 'Matrix' })).toBeTruthy();
    // Exactly three options, no more.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('marks the active Matrix option with aria-pressed="true" and the others false', () => {
    renderToggle('matrix');
    const matrix = screen.getByRole('button', { name: 'Matrix' });
    const grid = screen.getByRole('button', { name: 'Grid' });
    const circle = screen.getByRole('button', { name: 'Circle' });
    // The active mode drives aria-pressed — same a11y contract as Grid/Circle. RED:
    // the Matrix button does not exist yet (getByRole throws), so this fails on the
    // missing option, not a wrong attribute.
    expect(matrix.getAttribute('aria-pressed')).toBe('true');
    expect(grid.getAttribute('aria-pressed')).toBe('false');
    expect(circle.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onChange("matrix") when the Matrix option is activated', async () => {
    const user = userEvent.setup();
    const { onChange } = renderToggle('grid');
    await user.click(screen.getByRole('button', { name: 'Matrix' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('matrix');
  });

  it('does not perturb the existing Grid → onChange contract', () => {
    // Regression guard: adding Matrix must not break selecting Grid/Circle. The
    // active-state + accessible names for the original two options stay intact.
    renderToggle('grid');
    expect(screen.getByRole('button', { name: 'Grid' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Circle' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});
