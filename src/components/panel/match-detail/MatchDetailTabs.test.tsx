// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { MatchDetail } from '@/domain/types';
import { makeMatchDetail, makeTeamStats } from './__test-support__/match-detail-fixtures';
import { MatchDetailTabs } from './MatchDetailTabs';

afterEach(() => cleanup());

function renderTabs(detail: MatchDetail = makeMatchDetail()) {
  return render(<MatchDetailTabs detail={detail} homeName="France" awayName="Brazil" />);
}

/**
 * Activate a tab by its accessible name and return the now-visible tabpanel.
 * Renders the default fixture first when the widget isn't already mounted, so a
 * test can open a tab without an explicit `renderTabs()` (setup convenience —
 * the assertions, the real contract, are unchanged).
 */
async function openTab(name: RegExp): Promise<HTMLElement> {
  if (screen.queryByRole('tablist') === null) renderTabs();
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name }));
  return screen.getByRole('tabpanel');
}

// --- ARIA tabs pattern (AC14) ---------------------------------------------

describe('MatchDetailTabs — ARIA tabs pattern', () => {
  it('renders a tablist with exactly the three Timeline/Lineups/Stats tabs', () => {
    renderTabs();
    const tablist = screen.getByRole('tablist');
    const tabNames = within(tablist)
      .getAllByRole('tab')
      .map((t) => t.textContent?.toLowerCase().trim());
    expect(tabNames).toEqual(['timeline', 'lineups', 'stats']);
  });

  it('defaults to the Timeline tab selected with the others unselected', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: /timeline/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /lineups/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /stats/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('exposes exactly one visible tabpanel wired to its tab via aria-controls/labelledby', () => {
    renderTabs();
    const tab = screen.getByRole('tab', { name: /timeline/i });
    const panels = screen.getAllByRole('tabpanel');
    expect(panels).toHaveLength(1);
    const [panel] = panels;
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
  });

  it('selects Lineups (and deselects Timeline) when its tab is clicked', async () => {
    renderTabs();
    await openTab(/lineups/i);
    expect(screen.getByRole('tab', { name: /lineups/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /timeline/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('selects Stats when its tab is clicked', async () => {
    renderTabs();
    await openTab(/stats/i);
    expect(screen.getByRole('tab', { name: /stats/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves the active tab with ArrowRight (roving tabindex / keyboard nav)', async () => {
    const user = userEvent.setup();
    renderTabs();
    screen.getByRole('tab', { name: /timeline/i }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /lineups/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to the last tab with End', async () => {
    const user = userEvent.setup();
    renderTabs();
    screen.getByRole('tab', { name: /timeline/i }).focus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: /stats/i })).toHaveAttribute('aria-selected', 'true');
  });
});

// --- Timeline tab (AC3) ----------------------------------------------------

describe('MatchDetailTabs — Timeline', () => {
  it("lists the goal with its scorer and the '23 minute together", () => {
    renderTabs();
    const panel = screen.getByRole('tabpanel');
    // Scope to the single row that names the scorer, then assert the minute is in
    // that same row — a bare /23/ could match a shirt number elsewhere.
    const goalRow = within(panel).getByText('Kylian Mbappe').closest('li');
    expect(goalRow).not.toBeNull();
    expect(within(goalRow as HTMLElement).getByText(/\b23\b/)).toBeInTheDocument();
  });

  it('renders the substitution and yellow-card events with their players', () => {
    renderTabs();
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('Camavinga')).toBeInTheDocument();
    expect(within(panel).getByText('Vinicius Junior')).toBeInTheDocument();
  });

  it('shows the empty-timeline copy when there are no events', () => {
    renderTabs(makeMatchDetail({ events: [] }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).queryByText('Kylian Mbappe')).toBeNull();
    expect(within(panel).getByText(/not available/i)).toBeInTheDocument();
  });
});

// --- Lineups tab (AC5) -----------------------------------------------------

describe('MatchDetailTabs — Lineups', () => {
  it('renders the FIFA headshot with lazy loading + explicit dimensions', async () => {
    const panel = await openTab(/lineups/i);
    const img = within(panel)
      .getAllByRole('img', { hidden: true })
      .find((el) => el.getAttribute('src')?.includes('digitalhub.fifa.com'));
    expect(img).toBeDefined();
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('width');
    expect(img).toHaveAttribute('height');
  });

  it('shows the captain by short name and the shirt number 10', async () => {
    const panel = await openTab(/lineups/i);
    expect(within(panel).getAllByText('Mbappe').length).toBeGreaterThan(0);
    expect(within(panel).getAllByText('10').length).toBeGreaterThan(0);
  });

  it('falls back to initials (no img) for a player without a photoUrl', async () => {
    const panel = await openTab(/lineups/i);
    // Maignan has photoUrl: null in the fixture → rendered as initials, not <img>.
    const maignanRow = within(panel).getByText('Maignan').closest('li');
    expect(maignanRow).not.toBeNull();
    expect(within(maignanRow as HTMLElement).queryByRole('img', { hidden: true })).toBeNull();
  });
});

// --- Stats tab (AC6 / AC7) -------------------------------------------------

describe('MatchDetailTabs — Stats', () => {
  it('renders the available stat rows (possession, shots, corners) with both values', async () => {
    const panel = await openTab(/stats/i);
    expect(within(panel).getByText(/possession/i)).toBeInTheDocument();
    expect(within(panel).getByText(/shots/i)).toBeInTheDocument();
    expect(within(panel).getByText(/corners/i)).toBeInTheDocument();
    // The home/away values for shots (12 vs 4) are both shown.
    expect(within(panel).getByText('12')).toBeInTheDocument();
    expect(within(panel).getByText('4')).toBeInTheDocument();
  });

  it('omits unavailable stat rows (passes / pass accuracy / shots on target) — never shows 0', async () => {
    const panel = await openTab(/stats/i);
    expect(within(panel).queryByText(/^passes$/i)).toBeNull();
    expect(within(panel).queryByText(/pass accuracy/i)).toBeNull();
    expect(within(panel).queryByText(/shots on target/i)).toBeNull();
  });

  it('renders an em-dash (not a fabricated 0) for the missing side of a one-sided stat', async () => {
    // Possession present for home only → the away cell must show "–", never "0".
    renderTabs(
      makeMatchDetail({
        homeStats: makeTeamStats({ possession: 55 }),
        awayStats: makeTeamStats({ possession: null }),
        winProbability: null,
      }),
    );
    const panel = await openTab(/stats/i);
    const row = within(panel)
      .getByText(/possession/i)
      .closest('li') as HTMLElement;
    expect(within(row).getByText('55')).toBeInTheDocument();
    expect(within(row).getByText('–')).toBeInTheDocument();
    expect(within(row).queryByText('0')).toBeNull();
  });

  it('labels the win-probability bar as an estimate when present', async () => {
    const panel = await openTab(/stats/i);
    expect(within(panel).getByText(/estimate/i)).toBeInTheDocument();
  });

  it('hides the win-probability bar entirely when it is null (no unlabeled figure)', async () => {
    renderTabs(makeMatchDetail({ winProbability: null }));
    const panel = await openTab(/stats/i);
    expect(within(panel).queryByText(/estimate/i)).toBeNull();
  });
});
