// @vitest-environment jsdom
//
// Component spec for the canvas "focus current match" control (plan Test Strategy:
// "Component — FocusMatchButton.test.tsx"; Acceptance #7, #8, #9). The button must:
//   - be a single real <button> with an accessible name (semantic HTML),
//   - read aria-label "Go to live match" when isLive, else "Go to current match",
//   - be `disabled` when targetMatchId is null (no dead click),
//   - invoke onActivate(targetMatchId) exactly once on pointer AND keyboard,
//   - NOT invoke onActivate while disabled,
//   - expose a "live" affordance (data attribute) when the target is live.
//
// Rendered inside ReactFlowProvider because the control mounts a React Flow
// <Panel>. We assert behaviour + ARIA contract, not Panel/pixel markup.
//
// RED until `FocusMatchButton` is implemented — the stub renders no button, so
// `getByRole('button')` and the activation assertions fail.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import { FocusMatchButton } from './FocusMatchButton';

function renderButton(
  props: Partial<{
    targetMatchId: string | null;
    isLive: boolean;
    onActivate: (matchId: string) => void;
  }> = {},
) {
  const resolved = {
    targetMatchId: 'm1' as string | null,
    isLive: false,
    onActivate: vi.fn(),
    ...props,
  };
  render(
    <ReactFlowProvider>
      <FocusMatchButton
        targetMatchId={resolved.targetMatchId}
        isLive={resolved.isLive}
        onActivate={resolved.onActivate}
      />
    </ReactFlowProvider>,
  );
  return resolved;
}

describe('FocusMatchButton — semantic structure [Acceptance #7]', () => {
  it('renders exactly one real <button>', () => {
    renderButton();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].tagName).toBe('BUTTON');
  });

  it('the button has an accessible name', () => {
    renderButton();
    expect(screen.getByRole('button')).toHaveAccessibleName(/match/i);
  });

  it('renders a lucide SVG icon inside the button', () => {
    renderButton();
    // lucide icons render an inline <svg>; the control is icon-led per the plan.
    expect(screen.getByRole('button').querySelector('svg')).not.toBeNull();
  });

  it('an enabled button is keyboard-focusable (no negative tabindex)', () => {
    renderButton({ targetMatchId: 'm1' });
    const button = screen.getByRole('button');
    button.focus();
    expect(button).toHaveFocus();
    expect(button).not.toHaveAttribute('tabindex', '-1');
  });
});

describe('FocusMatchButton — aria-label reflects live state [Acceptance #8]', () => {
  it('reads "Go to current match" when the target is not live', () => {
    renderButton({ isLive: false });
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Go to current match');
  });

  it('reads "Go to live match" when the target is live', () => {
    renderButton({ isLive: true });
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Go to live match');
  });
});

describe('FocusMatchButton — disabled when there is no target [Acceptance #9]', () => {
  it('is disabled when targetMatchId is null', () => {
    renderButton({ targetMatchId: null });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is enabled when a target exists', () => {
    renderButton({ targetMatchId: 'm1' });
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('does NOT invoke onActivate when clicked while disabled', async () => {
    const onActivate = vi.fn();
    renderButton({ targetMatchId: null, onActivate });
    await userEvent.click(screen.getByRole('button'));
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe('FocusMatchButton — activation invokes onActivate with the resolved id [Acceptance #9]', () => {
  it('calls onActivate(targetMatchId) exactly once on click', async () => {
    const onActivate = vi.fn();
    renderButton({ targetMatchId: 'm42', onActivate });
    await userEvent.click(screen.getByRole('button'));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith('m42');
  });

  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ])('calls onActivate when activated with the %s key', async (_label, keystroke) => {
    const onActivate = vi.fn();
    renderButton({ targetMatchId: 'm9', onActivate });
    screen.getByRole('button').focus();
    await userEvent.keyboard(keystroke);
    expect(onActivate).toHaveBeenCalledWith('m9');
  });
});

describe('FocusMatchButton — activation fires once, never doubles [Acceptance #9]', () => {
  it('fires exactly once per keypress (no double-activation on Enter)', async () => {
    const onActivate = vi.fn();
    renderButton({ targetMatchId: 'm5', onActivate });
    screen.getByRole('button').focus();
    await userEvent.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});

describe('FocusMatchButton — live affordance', () => {
  it('exposes a live affordance via data-live="true" when the target is live', () => {
    renderButton({ targetMatchId: 'm1', isLive: true });
    expect(screen.getByRole('button')).toHaveAttribute('data-live', 'true');
  });

  it('does not advertise the live affordance when the target is not live', () => {
    renderButton({ targetMatchId: 'm1', isLive: false });
    expect(screen.getByRole('button')).toHaveAttribute('data-live', 'false');
  });

  it('never claims to be live when there is no target (disabled state)', () => {
    // A null target cannot be "live"; the affordance must not mislead.
    renderButton({ targetMatchId: null, isLive: false });
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-live', 'false');
  });
});
