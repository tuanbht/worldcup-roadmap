// @vitest-environment jsdom
//
// Unit contract for TeamRow's row-as-tap-target focus control (requirement
// 2026-06-24-1421; plan Test Strategy 1–5 / Acceptance #1, #3, #4, #5). TeamRow
// is canvas-only (imported solely by MatchNode); the component had no test until
// now.
//
// THE PIVOT (mirrors the shipped 1030 standings fix): the resolved-team row's
// focus-team control is no longer a tiny per-flag <button> wrapping the 22px
// glyph (~7px on-screen at the 0.32 zoom floor — far below the 44px touch
// minimum). Instead the TeamRow grid <div> becomes the SOLE `position: relative`
// containing block and holds a single transparent full-row
// `<button type="button" class="nopan absolute inset-0 …">` as its FIRST child;
// the flag glyph + name + score become DECORATIVE content rendered UNDER that
// button. `inset-0` resolves against the grid <div> → the full ~236px interior
// row → ~75px on-screen at 0.32 (≈1.7× the 44px minimum). Exactly ONE control per
// resolved row. Placeholder / no-handler rows stay decorative (bare <Flag>, no
// `relative`, no button) — byte-identical to today.
//
// jsdom can't measure the post-transform box (the e2e width assertion does that),
// but it CAN pin the structural DOM contract that produces the full-row span: a
// `relative` grid <div> as the sole containing block + a single `absolute inset-0`
// focus-team <button> as its FIRST child. RED at the baseline, where the control
// is a static `shrink-0` per-flag <button> with neither `absolute`/`inset-0` nor a
// `relative` grid parent, and the glyph is wrapped INSIDE the button.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { teamRef, placeholderRef } from '@/domain/types';
import type { Team } from '@/domain/types';
import { ARG, FRA, focusLabel } from './__test-support__/team-row-fixtures';
import { TeamRow } from './TeamRow';

type TeamRowProps = Parameters<typeof TeamRow>[0];

/** The resolved + onFocusTeam (interactive canvas) path. Returns the focus spy. */
function renderResolved(
  team: Team = ARG,
  overrides: Partial<TeamRowProps> = {},
): { onFocusTeam: ReturnType<typeof vi.fn>; container: HTMLElement } {
  const onFocusTeam = vi.fn();
  const { container } = render(
    <TeamRow
      team={teamRef(team)}
      goals={2}
      penalty={null}
      isWinner={false}
      dim={false}
      showScore
      onFocusTeam={onFocusTeam}
      {...overrides}
    />,
  );
  return { onFocusTeam, container };
}

/** A decorative (placeholder OR no-handler) row. Defaults to a placeholder ref. */
function renderDecorative(overrides: Partial<TeamRowProps> = {}): { container: HTMLElement } {
  const { container } = render(
    <TeamRow
      team={placeholderRef('Runner-up B')}
      goals={null}
      penalty={null}
      isWinner={false}
      dim={false}
      showScore={false}
      onFocusTeam={vi.fn()}
      {...overrides}
    />,
  );
  return { container };
}

/** The single full-row focus-team control for `team`, by its accessible name. */
function focusButtonFor(team: Team): HTMLElement {
  return screen.getByRole('button', { name: focusLabel(team) });
}

/** The TeamRow grid <div> — the focus button's parent (the sole containing block). */
function gridFor(button: HTMLElement): HTMLElement {
  const grid = button.parentElement;
  if (!grid) throw new Error('focus button has no parent grid <div>');
  return grid;
}

describe('TeamRow — resolved row exposes a single full-row focus-team control [AC #3]', () => {
  it('renders the focus control as a real <button type="button"> with the team accessible name', () => {
    renderResolved(ARG);
    const button = focusButtonFor(ARG);
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('CSS-stretches the focus button across the full row (absolute inset-0) — the ≥44px-wide mechanism', () => {
    // The full-row span is produced by `position: absolute; inset: 0` resolving
    // against the `position: relative` grid <div>. jsdom can't measure the box,
    // but the className IS the layout contract: an `absolute inset-0` button is the
    // ONLY shape that spans the row. The baseline per-flag button is a static
    // `shrink-0` chip with neither class → RED here.
    renderResolved(ARG);
    const button = focusButtonFor(ARG);
    expect(button.className).toMatch(/(^|\s)absolute(\s|$)/);
    expect(button.className).toMatch(/(^|\s)inset-0(\s|$)/);
    // The full-row mechanism is incompatible with the baseline `shrink-0` flag
    // chip: a stretched overlay must not also flex-shrink. Pins that the pivot
    // actually REPLACED the chip rather than layering `absolute inset-0` on top of
    // the old per-flag sizing.
    expect(button.className).not.toMatch(/(^|\s)shrink-0(\s|$)/);
  });

  it('makes the TeamRow grid <div> the SOLE positioned containing block (relative grid div)', () => {
    // AC #3 / the 1030 H3 lesson: the grid <div> must be `position: relative` so
    // `inset-0` resolves against the full ~236px row. The cells are static <span>s,
    // so there is no nested positioned cell to mis-resolve against. At the baseline
    // the grid <div> is NOT `relative` at all → RED.
    renderResolved(ARG);
    const grid = gridFor(focusButtonFor(ARG));
    expect(grid.className).toMatch(/(^|\s)relative(\s|$)/);
    // The grid keeps its existing layout classes (no relayout from going relative).
    expect(grid.className).toMatch(/grid-cols-\[auto_1fr_auto\]/);
    expect(grid.className).toMatch(/(^|\s)grid(\s|$)/);
    expect(grid.className).toMatch(/(^|\s)items-center(\s|$)/);
  });

  it("renders the focus button as the grid's FIRST child so decorative content sits UNDER it [AC #3]", () => {
    // Plan DOM contract: the transparent overlay is the grid's FIRST child, BEFORE
    // the flag/name/score. An overlay rendered after the content would not change
    // which element receives the tap (z-order), but the plan pins first-child order
    // so the decorative content reads as "beneath" and the markup matches 1030.
    // Non-tautological: at the baseline the flag-wrapping <button> is also first,
    // so this passes there and GREEN must preserve it.
    renderResolved(ARG);
    const grid = gridFor(focusButtonFor(ARG));
    expect(grid.firstElementChild).toBe(focusButtonFor(ARG));
  });

  it('does NOT promote the grid <div> to role="button" (the control stays a real <button> child) [AC #3]', () => {
    // Mirror the 1030 a11y decision: no `role="button"` on the structural grid
    // element (which would make its text presentational); the focus control is a
    // real <button> child whose accessible name is preserved.
    renderResolved(ARG);
    const grid = gridFor(focusButtonFor(ARG));
    expect(grid.tagName).toBe('DIV');
    expect(grid.getAttribute('role')).not.toBe('button');
  });

  it('keeps `nopan` on the focus button so a row tap never starts a React Flow pan', () => {
    renderResolved(ARG);
    expect(focusButtonFor(ARG).className).toMatch(/(^|\s)nopan(\s|$)/);
  });
});

describe('TeamRow — exactly ONE control per resolved row (flag-is-decorative) [AC #4]', () => {
  it('exposes EXACTLY ONE button in the row (no nested/double tab stop)', () => {
    // The only interactive control in an interactive row is the row-spanning focus
    // button — never a second nested button on the flag. At the baseline the
    // per-flag button is also the only button, so this passes there; the
    // span/relative tests above are the ones still RED. Kept as the AC #4 pin.
    const { container } = renderResolved(ARG);
    const buttons = within(container).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe(focusLabel(ARG));
  });

  it('renders the flag as a decorative aria-hidden glyph that is NEVER its own button [AC #4]', () => {
    // The per-flag <button> is removed: the flag is a bare `aria-hidden` glyph.
    // Mirroring the shipped 1030 contract, the decorative DOM SHAPE is intentionally
    // not over-pinned — the proven full-row control is the sibling-overlay (a
    // content-less `absolute inset-0` button that is a SIBLING of the in-flow
    // flag/name/score), so the glyph's `closest('button')` is null. A nesting shape
    // would also be acceptable; EITHER way the glyph is never a button of its OWN,
    // and the ONLY button it could ever be inside is the single full-row focus
    // control. The real guarantees (single full-row `absolute inset-0` control,
    // correct-team-per-row, glyph decorative) stay pinned by the other cases + the
    // transform-aware e2e width assertion.
    const { container } = renderResolved(ARG);
    const glyph = within(container).getByText('ARG'); // the monogram (flagUrl is null)
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(glyph.tagName).toBe('SPAN');
    const buttonAncestor = glyph.closest('button');
    if (buttonAncestor) {
      expect(buttonAncestor).toBe(focusButtonFor(ARG));
    }
  });

  it('keeps exactly one decorative glyph per row at the default 22px size (visually unchanged) [AC #4]', () => {
    // The glyph stays the bare decorative <Flag> at its default size=22 (width 22 /
    // height 15) — the row-as-target pivot changes only the invisible hit area, not
    // the glyph. Exactly one decorative glyph per row; no extra hidden affordance.
    const { container } = renderResolved(ARG);
    const glyphs = container.querySelectorAll('[aria-hidden="true"]');
    expect(glyphs).toHaveLength(1);
    expect((glyphs[0] as HTMLElement).style.width).toBe('22px');
    expect((glyphs[0] as HTMLElement).style.height).toBe('15px');
  });
});

describe('TeamRow — activation calls onFocusTeam(team.id) on click + Enter + Space [AC #2/#3]', () => {
  it.each([
    { label: 'pointer click', method: 'click' as const, key: null },
    { label: 'keyboard Enter', method: 'keyboard' as const, key: '{Enter}' },
    { label: 'keyboard Space', method: 'keyboard' as const, key: ' ' },
  ])(
    '$label calls onFocusTeam exactly once with the row team id (native <button>)',
    async ({ method, key }) => {
      const { onFocusTeam } = renderResolved(ARG);
      const user = userEvent.setup();
      const button = focusButtonFor(ARG);
      if (method === 'click') {
        await user.click(button);
      } else {
        button.focus();
        await user.keyboard(key!);
      }
      expect(onFocusTeam).toHaveBeenCalledTimes(1);
      expect(onFocusTeam).toHaveBeenCalledWith(ARG.id);
    },
  );

  it('focuses THIS row team, never a neighbour id (no transposed mapping)', async () => {
    const { onFocusTeam } = renderResolved(FRA);
    const user = userEvent.setup();
    await user.click(focusButtonFor(FRA));
    expect(onFocusTeam).toHaveBeenCalledTimes(1);
    expect(onFocusTeam).toHaveBeenCalledWith(FRA.id);
    expect(onFocusTeam).not.toHaveBeenCalledWith(ARG.id);
  });
});

describe('TeamRow — placeholder + no-handler rows stay decorative [AC #5]', () => {
  it('renders NO "Show matches for" button for a placeholder ref (even with onFocusTeam)', () => {
    renderDecorative();
    expect(screen.queryByRole('button', { name: /Show matches for/ })).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does NOT make the placeholder grid <div> a positioned containing block (no relative)', () => {
    // No focus control → no `position: relative` grid needed; placeholder rows stay
    // plain static grid <div>s, byte-identical to today.
    const { container } = renderDecorative();
    const grid = container.querySelector('div')!;
    expect(grid.className).not.toMatch(/(^|\s)relative(\s|$)/);
  });

  it('still renders the decorative placeholder glyph (the "··" fallback monogram)', () => {
    // Edge case the plan's "byte-identical placeholder" clause implies: an
    // unresolved ref has no code, so the <Flag> falls back to the "··" monogram —
    // still an `aria-hidden` decorative <span>, never a button. Guards that the
    // pivot did not strip the placeholder glyph along with the per-flag button.
    const { container } = renderDecorative();
    const glyph = within(container).getByText('··');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(glyph.closest('button')).toBeNull();
  });

  it('renders NO button and a NON-relative grid for a resolved team when onFocusTeam is absent', () => {
    // The same row shipped WITHOUT a focus handler (e.g. outside the focus-enabled
    // canvas) keeps the flag decorative — no button, no `relative` grid.
    const { container } = renderResolved(ARG, { onFocusTeam: undefined });
    expect(screen.queryByRole('button', { name: /Show matches for/ })).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    const grid = container.querySelector('div')!;
    expect(grid.className).not.toMatch(/(^|\s)relative(\s|$)/);
    // The decorative glyph still renders (visually unchanged) and is not a button.
    const glyph = within(container).getByText('ARG');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(glyph.closest('button')).toBeNull();
  });
});
