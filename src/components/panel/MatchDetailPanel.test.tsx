// @vitest-environment jsdom
//
// Per-file jsdom pragma, matching the existing useTournamentQuery.test.tsx
// pattern; the global `node` environment (which the domain/data suites rely on)
// is untouched.
//
// Contract guards (stay GREEN): panel role / aria-hidden + inert toggle, the
// close-button accessible name + onClose wiring, venue rendering.
// RED signal for this phase (fails until implemented): the close affordance must
// become an accessible lucide <X aria-hidden /> SVG instead of the literal "✕"
// glyph, and the Kick-off row must render deterministic explicit-UTC text from
// the date-fns-tz façade (not the machine-zone Intl output).
//
// jest-dom matchers are imported here (not via a shared setup file) so the test
// is self-contained; the implementer later centralizes this + `afterEach(cleanup)`
// into vitest.setup.ts (`setupFiles`) per the plan, after which these two lines
// can be removed.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bracket, Group, Match, Team, Tournament, TournamentMeta } from '@/domain/types';
import { EMPTY_SCORE, teamRef } from '@/domain/types';
import { MatchDetailPanel } from '@/components/panel/MatchDetailPanel';

// --- Fixtures -------------------------------------------------------------

// Deterministic kickoff: 14:30 UTC. The façade renders against an explicit 'UTC'
// default, so the assertion never depends on the runner's machine zone.
const KICKOFF_UTC = '2026-06-02T14:30:00.000Z';
const KICKOFF_TEXT_UTC = '02 Jun, 14:30';

const CLOSE_BUTTON_NAME = 'Close match details';
const PANEL_NAME = 'Match details';

const ARGENTINA: Team = { id: 'team-arg', name: 'Argentina', code: 'ARG', flagUrl: null };
const FRANCE: Team = { id: 'team-fra', name: 'France', code: 'FRA', flagUrl: null };

const FINAL_MATCH: Match = {
  id: 'wc2026-final',
  providerMatchId: 'final',
  stage: 'FINAL',
  group: null,
  matchday: null,
  home: teamRef(ARGENTINA),
  away: teamRef(FRANCE),
  score: EMPTY_SCORE,
  kickoff: KICKOFF_UTC,
  status: 'scheduled',
  minute: null,
  venue: { name: 'MetLife Stadium', city: 'East Rutherford' },
};

const EMPTY_BRACKET: Bracket = { rounds: [] };

const META: TournamentMeta = {
  id: 'WC-2026',
  name: 'FIFA World Cup 2026',
  season: 2026,
  provider: 'mock',
  fetchedAt: KICKOFF_UTC,
};

const TOURNAMENT: Tournament = {
  meta: META,
  teams: [ARGENTINA, FRANCE],
  matches: [FINAL_MATCH],
  groups: [] as readonly Group[],
  bracket: EMPTY_BRACKET,
};

// --- Helpers --------------------------------------------------------------

function renderPanel(matchId: string | null, onClose = vi.fn()) {
  const utils = render(
    <MatchDetailPanel tournament={TOURNAMENT} matchId={matchId} onClose={onClose} />,
  );
  return { ...utils, onClose };
}

/** The open panel, queried by its accessible role + name. */
function openPanel(): HTMLElement {
  return screen.getByRole('complementary', { name: PANEL_NAME });
}

/** The close button, queried by its (icon-independent) accessible name. */
function closeButton(): HTMLElement {
  return screen.getByRole('button', { name: CLOSE_BUTTON_NAME });
}

// No shared setupFiles yet → clean up the DOM between tests to avoid leakage.
afterEach(() => cleanup());

describe('MatchDetailPanel — always-mounted accessibility contract (guard, stays green)', () => {
  it('exposes the panel as a complementary region named "Match details"', () => {
    renderPanel(FINAL_MATCH.id);
    expect(openPanel()).toBeInTheDocument();
  });

  it('is aria-hidden=false when a match is selected', () => {
    renderPanel(FINAL_MATCH.id);
    expect(openPanel()).toHaveAttribute('aria-hidden', 'false');
  });

  it('is aria-hidden=true and inert when no match is selected (closed)', () => {
    // Querying by role excludes aria-hidden, so reach for the element by label.
    const { container } = renderPanel(null);
    const panel = container.querySelector('aside[aria-label="Match details"]');
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveAttribute('inert');
  });

  it('keeps the close button out of the accessibility tree while closed (inert)', () => {
    // With the panel inert, no `complementary` role and no reachable button:
    // focus can never land inside a hidden region (WCAG 4.1.2 / axe).
    renderPanel(null);
    expect(screen.queryByRole('complementary', { name: PANEL_NAME })).toBeNull();
    expect(screen.queryByRole('button', { name: CLOSE_BUTTON_NAME })).toBeNull();
  });
});

describe('MatchDetailPanel — close button (guard, stays green)', () => {
  it('exposes a button with the accessible name "Close match details"', () => {
    renderPanel(FINAL_MATCH.id);
    expect(closeButton()).toBeInTheDocument();
  });

  it('invokes onClose exactly once on click (userEvent)', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel(FINAL_MATCH.id);

    await user.click(closeButton());

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('MatchDetailPanel — match metadata (guard, stays green)', () => {
  it('renders the selected match venue from the tournament fixture', () => {
    renderPanel(FINAL_MATCH.id);
    const term = screen.getByText('Venue');
    const row = term.closest('div');
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement).getByText('MetLife Stadium, East Rutherford'),
    ).toBeInTheDocument();
  });
});

describe('MatchDetailPanel — lucide icon + façade kickoff (RED until implemented)', () => {
  it('renders the close glyph as a decorative SVG (lucide X), not a literal text glyph', () => {
    renderPanel(FINAL_MATCH.id);
    const button = closeButton();

    // lucide-react renders an <svg>; the literal "✕" character does not.
    const svg = button.querySelector('svg');
    expect(svg).not.toBeNull();
    // Decorative: the accessible name must come from the button's aria-label,
    // so the icon itself is hidden from the accessibility tree.
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    // The old literal glyph must be gone.
    expect(button.textContent ?? '').not.toContain('✕');
  });

  it('renders the Kick-off row using the deterministic explicit-UTC façade text', () => {
    renderPanel(FINAL_MATCH.id);

    // The "Kick-off" term and its deterministic UTC value, regardless of the
    // runner's machine zone (the property this date refactor establishes). If the
    // panel still routed through the machine-zone Intl path, this would render a
    // locale-dependent string (e.g. "Jun 02, 09:30 PM") and fail.
    const term = screen.getByText('Kick-off');
    const row = term.closest('div');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText(KICKOFF_TEXT_UTC)).toBeInTheDocument();
  });
});
