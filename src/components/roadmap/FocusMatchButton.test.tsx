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

/** The single control, addressed by its semantic role. */
function getButton(): HTMLElement {
  return screen.getByRole('button');
}

/**
 * The two visible label strings the control swaps between, paired with the
 * `isLive` flag that produces each. Shared by every label-contract case so the
 * "current" and "live" branches stay in lockstep (no copy-paste drift).
 */
const LABEL_CASES = [
  { name: 'current (not live)', isLive: false, text: 'Current match' },
  { name: 'live', isLive: true, text: 'Live match' },
] as const;

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
    await userEvent.click(getButton());
    expect(onActivate).not.toHaveBeenCalled();
  });

  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ])('does NOT invoke onActivate on the %s key while disabled', async (_label, keystroke) => {
    // A disabled native button drops keyboard activation too; guards against a
    // hand-rolled keydown handler that would fire despite `disabled`.
    const onActivate = vi.fn();
    renderButton({ targetMatchId: null, onActivate });
    await userEvent.keyboard(keystroke);
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

// ---------------------------------------------------------------------------
// Mobile bubble responsive contract (req 2026-06-23-1518; plan Acceptance #4, #7).
//
// jsdom cannot measure layout, so geometry (~48px bottom-right bubble vs. wide
// top-center pill) is asserted in the targeted Playwright spec
// `e2e/focus-match-button.spec.ts`. Here we assert the *DOM/class contract* that
// the responsive design depends on and that jsdom CAN see:
//   - the visible text label is kept in the DOM at all sizes but is wrapped in an
//     element that hides it below md (`sr-only` / `max-md:sr-only`) — proving the
//     label is HIDDEN-not-removed for assistive tech (AC #4);
//   - the live pulse carries `animate-livepulse` (so the existing global
//     reduced-motion guard still kills it) AND is corner-positioned below md
//     (`max-md:absolute`) rather than an inline dot (AC #2, #7).
//
// RED until the GREEN stage wraps the label in an sr-only span and moves the
// pulse to the icon corner: today the label is a bare text node (no sr-only
// ancestor) and the pulse has no `max-md:absolute` class.
// ---------------------------------------------------------------------------

/** The button's first lucide icon SVG — the anchor for the icon-only bubble. */
function iconSvg(): SVGElement {
  const svg = getButton().querySelector('svg');
  if (svg === null) throw new Error('expected a lucide icon <svg> inside the button');
  return svg as unknown as SVGElement;
}

/** The live pulse dot — null when the target is not live. */
function pulseEl(): Element | null {
  return getButton().querySelector('.animate-livepulse');
}

/**
 * The smallest element wrapping `text`, asserted to exist and to carry at least
 * one class. Used to prove a label/dot is hidden-not-removed via a class hook.
 */
function classBearingWrapper(text: string): Element {
  const wrapper = screen.getByText(text).closest('[class]');
  expect(wrapper, `"${text}" should sit inside a class-bearing element`).not.toBeNull();
  return wrapper!;
}

/**
 * Matches a responsive `max-md:`-gated utility, e.g. `max-md:sr-only` or the
 * bracketed arbitrary value `max-md:pb-[env(safe-area-inset-bottom)]`.
 *
 * The trailing boundary is a lookahead for whitespace-or-end rather than `\b`:
 * `\b` only sits between a word and a non-word character, so it can never match
 * after a `]` terminator (both `]` and the following space are non-word), which
 * would wrongly reject every bracketed arbitrary-value utility.
 */
function hasMaxMdUtility(className: string, utility: string): boolean {
  return new RegExp(`(?:^|\\s)max-md:${utility}(?=\\s|$)`).test(className);
}

describe('FocusMatchButton — label kept for AT, sr-only below md [Acceptance #4]', () => {
  it.each(LABEL_CASES)('keeps the $name label text node in the DOM (hidden, not removed)', (c) => {
    renderButton({ targetMatchId: 'm1', isLive: c.isLive });
    // The text must still exist in the DOM for assistive tech at every size.
    expect(screen.getByText(c.text)).toBeInTheDocument();
  });

  it.each(LABEL_CASES)('hides the $name label below md but keeps it visible at >=md', (c) => {
    renderButton({ targetMatchId: 'm1', isLive: c.isLive });
    // The label must live inside an ELEMENT (not a bare text node child of the
    // <button>) so it can be visually hidden below md without leaving the a11y
    // tree. The hide MUST be gated to `max-md:` — a bare `sr-only` would wrongly
    // hide the label at the desktop pill too (AC #3 requires it visible at >=md).
    const cls = classBearingWrapper(c.text).className;
    expect(
      hasMaxMdUtility(cls, 'sr-only'),
      `label wrapper should carry "max-md:sr-only" (visible at >=md), got: "${cls}"`,
    ).toBe(true);
  });

  it.each(LABEL_CASES)('keeps the $name label wrapper distinct from the <button>', (c) => {
    // Guards against the regression where the label is a direct text child of the
    // button: there must be an intermediate element to hide.
    renderButton({ targetMatchId: 'm1', isLive: c.isLive });
    expect(classBearingWrapper(c.text)).not.toBe(getButton());
  });

  it('does NOT hide the icon below md — the bubble must still show its glyph', () => {
    // Only the text label is sr-only below md; the lucide icon is the bubble's
    // sole visible content, so it must NOT share the label's sr-only wrapper.
    renderButton({ targetMatchId: 'm1', isLive: false });
    const labelWrapper = classBearingWrapper('Current match');
    expect(labelWrapper.contains(iconSvg())).toBe(false);
  });
});

describe('FocusMatchButton — live pulse rides the icon corner below md [Acceptance #2, #7]', () => {
  it('renders no pulse element when the target is not live', () => {
    renderButton({ targetMatchId: 'm1', isLive: false });
    expect(pulseEl()).toBeNull();
  });

  it('renders no pulse when there is no target (disabled cannot be live)', () => {
    renderButton({ targetMatchId: null, isLive: true });
    expect(pulseEl()).toBeNull();
  });

  it('marks the pulse with animate-livepulse so the global reduced-motion guard kills it', () => {
    // The component does not re-declare the media query; it relies on the shared
    // `.animate-livepulse` rule in global.css (which sets `animation: none` under
    // prefers-reduced-motion). Carrying the class is what wires that guard in.
    renderButton({ targetMatchId: 'm1', isLive: true });
    expect(pulseEl()).toHaveClass('animate-livepulse');
  });

  it('positions the pulse absolutely at the icon corner below md, inline at >=md', () => {
    renderButton({ targetMatchId: 'm1', isLive: true });
    const cls = pulseEl()?.className ?? '';
    // The corner dot is `max-md:absolute` (taken out of the flex row to ride the
    // icon corner) below md while remaining an inline flex child at >=md. A bare
    // `absolute` would wrongly detach it in the desktop pill too.
    expect(
      hasMaxMdUtility(cls, 'absolute'),
      `pulse should carry "max-md:absolute" for the icon corner, got: "${cls}"`,
    ).toBe(true);
  });

  it('keeps the pulse decorative (aria-hidden) so AT is not told about a dot', () => {
    renderButton({ targetMatchId: 'm1', isLive: true });
    expect(pulseEl()).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('FocusMatchButton — bottom-right safe-area anchoring below md [Acceptance #1, #8]', () => {
  it('anchors the panel wrapper bottom-right with !important overrides below md', () => {
    // jsdom cannot measure geometry, but it CAN see the class hooks the bottom-right
    // flip depends on. xyflow hard-pins `.top.center` inline-equivalent rules, so
    // the override must use Tailwind v4 important utilities gated to max-md.
    renderButton({ targetMatchId: 'm1', isLive: false });
    const panel = getButton().closest('.react-flow__panel');
    expect(panel, 'the control should mount inside a react-flow panel').not.toBeNull();
    const cls = panel!.className;
    // Beats xyflow's specific `.top.center` selector to flip to bottom-right.
    expect(hasMaxMdUtility(cls, '!bottom-0'), `panel should pin bottom, got: "${cls}"`).toBe(true);
    expect(hasMaxMdUtility(cls, '!right-0'), `panel should pin right, got: "${cls}"`).toBe(true);
  });

  it('adds bottom safe-area padding so the bubble clears the home indicator', () => {
    // AC #8: env(safe-area-inset-bottom) via an inline Tailwind arbitrary value on
    // the component (global.css is NOT edited). Must be gated to max-md.
    renderButton({ targetMatchId: 'm1', isLive: false });
    const panel = getButton().closest('.react-flow__panel');
    expect(panel).not.toBeNull();
    const cls = panel!.className;
    expect(
      hasMaxMdUtility(cls, 'pb-\\[env\\(safe-area-inset-bottom\\)\\]'),
      `panel should carry max-md:pb-[env(safe-area-inset-bottom)], got: "${cls}"`,
    ).toBe(true);
  });

  it('shapes the button into a ~48px rounded-full square below md', () => {
    // AC #1: h-12 w-12 rounded-full icon bubble below md (geometry is verified for
    // real in the Playwright spec; here we assert the class hooks jsdom can read).
    renderButton({ targetMatchId: 'm1', isLive: false });
    const cls = getButton().className;
    expect(hasMaxMdUtility(cls, 'h-12'), `button should be 48px tall, got: "${cls}"`).toBe(true);
    expect(hasMaxMdUtility(cls, 'w-12'), `button should be 48px wide, got: "${cls}"`).toBe(true);
  });
});

describe('FocusMatchButton — single stable control across breakpoints [Acceptance #6]', () => {
  it('keeps exactly one <button> with one stable aria-label (no per-breakpoint DOM swap)', () => {
    // The responsive change must be class-only: one focus target, one accessible
    // name — never two buttons toggled by `hidden`/`md:hidden`.
    renderButton({ targetMatchId: 'm1', isLive: true });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(getButton()).toHaveAttribute('aria-label', 'Go to live match');
    // The single icon is shared by both layouts.
    expect(iconSvg()).toBeInTheDocument();
  });
});
