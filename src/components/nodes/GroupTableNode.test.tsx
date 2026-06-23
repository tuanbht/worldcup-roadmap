// @vitest-environment jsdom
//
// Component spec for GroupTableNode's re-homed overlay opener (C1). When the
// deleted group-header pill went away, its `aria-label="Open Group X standings"`
// button moved onto the always-on table's <header>. The plan (Scope → "Decided
// here") commits to: GroupTableNode renders its <header> as a
// `<button type="button" aria-label="Open Group ${name} standings">` calling
// `onOpenStandings(group.name)` WHEN an `onOpenStandings` handler is supplied,
// and a plain non-interactive <header> when it is absent (the overlay path).
//
// The row flag buttons (onFocusTeam) are SEPARATE controls with their own
// `aria-label="Show matches for {team}"` and must `stopPropagation`, so a flag
// click sets the focused team WITHOUT also opening the overlay.
//
// Asserted directly on GroupTableNode (not the contended RoadmapCanvas.test.tsx),
// per the concurrency guardrail. RED until GroupTableNode renders the header
// button. Counts/values come from a tiny explicit Group fixture.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupTableNode } from './GroupTableNode';
import { GROUP_A_PAIR } from './__test-support__/standings-fixtures';

// Argentina(1) + Poland(2), both qualified — the minimal two-row fixture; the
// full column matrix is exercised by GroupStandingsNode.test.tsx.
const GROUP = GROUP_A_PAIR;

describe('GroupTableNode — header opens the standings overlay [C1 / Acceptance #12]', () => {
  it('renders the header as a button labelled "Open Group A standings" when onOpenStandings is supplied', () => {
    render(<GroupTableNode group={GROUP} onOpenStandings={vi.fn()} />);
    const opener = screen.getByRole('button', { name: 'Open Group A standings' });
    expect(opener).toBeInTheDocument();
    // It is a real button (Enter/Space native), not a div with a click handler.
    expect(opener.tagName).toBe('BUTTON');
    expect(opener).toHaveAttribute('type', 'button');
  });

  it('calls onOpenStandings(group.name) when the header button is clicked', async () => {
    const onOpenStandings = vi.fn();
    const user = userEvent.setup();
    render(<GroupTableNode group={GROUP} onOpenStandings={onOpenStandings} />);
    await user.click(screen.getByRole('button', { name: 'Open Group A standings' }));
    expect(onOpenStandings).toHaveBeenCalledTimes(1);
    expect(onOpenStandings).toHaveBeenCalledWith('A');
  });

  it.each(['{Enter}', ' '])(
    'activates the header button by keyboard (%s) for accessibility — native <button> semantics',
    async (key) => {
      // A native <button> fires its click on BOTH Enter and Space; a div+onClick
      // would not. Parametrising both keys pins that the opener is a real button.
      const onOpenStandings = vi.fn();
      const user = userEvent.setup();
      render(<GroupTableNode group={GROUP} onOpenStandings={onOpenStandings} />);
      screen.getByRole('button', { name: 'Open Group A standings' }).focus();
      await user.keyboard(key);
      expect(onOpenStandings).toHaveBeenCalledWith('A');
    },
  );

  it('does NOT open the overlay when a row flag is clicked (flag fires only onFocusTeam)', async () => {
    const onOpenStandings = vi.fn();
    const onFocusTeam = vi.fn();
    const user = userEvent.setup();
    render(
      <GroupTableNode group={GROUP} onOpenStandings={onOpenStandings} onFocusTeam={onFocusTeam} />,
    );
    // The flag button carries its own "Show matches for {team}" label and must
    // stopPropagation so the click never bubbles to the header opener.
    const flag = screen.getByRole('button', { name: 'Show matches for Argentina' });
    await user.click(flag);
    expect(onFocusTeam).toHaveBeenCalledTimes(1);
    expect(onFocusTeam).toHaveBeenCalledWith('team-arg');
    expect(onOpenStandings).not.toHaveBeenCalled();
  });

  it('exposes the opener and the flags as SIBLING controls (the opener fires no onFocusTeam)', async () => {
    // The header button and the row flags are independent siblings inside the
    // table, never nested: activating the opener must NOT also set a focused team.
    const onOpenStandings = vi.fn();
    const onFocusTeam = vi.fn();
    const user = userEvent.setup();
    render(
      <GroupTableNode group={GROUP} onOpenStandings={onOpenStandings} onFocusTeam={onFocusTeam} />,
    );
    await user.click(screen.getByRole('button', { name: 'Open Group A standings' }));
    expect(onOpenStandings).toHaveBeenCalledWith('A');
    expect(onFocusTeam).not.toHaveBeenCalled();
  });
});

describe('GroupTableNode — overlay path renders a non-interactive header [C1]', () => {
  it('renders NO "Open Group … standings" button when onOpenStandings is absent', () => {
    // The on-demand StandingsOverlay reuses GroupTableNode WITHOUT an opener, so
    // its header stays a plain non-interactive <header> (no nested open button).
    render(<GroupTableNode group={GROUP} />);
    expect(screen.queryByRole('button', { name: /Open Group .* standings/ })).toBeNull();
    // The labelled section + title still render (the table's accessible name).
    expect(screen.getByRole('table')).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Group A standings' });
    expect(within(section).getByText('Group A')).toBeInTheDocument();
  });
});
