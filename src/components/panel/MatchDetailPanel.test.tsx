// @vitest-environment jsdom
//
// Per-file jsdom pragma (matches useTournamentQuery.test.tsx). The panel now
// calls useMatchDetailQuery, so renders are wrapped in a QueryClientProvider and
// the hook is mocked to a deterministic state.
//
// GUARD (stays green): panel role / aria-hidden + inert toggle, close-button
// accessible name + onClose wiring, the lucide <X aria-hidden /> SVG.
// RED (fails until the 3-tab redesign lands): the header tablist, the group
// standing-position string, the façade kickoff text in the header, and the
// "detail unavailable" empty state for a mock match.
import '@testing-library/jest-dom/vitest';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bracket, BracketNode, Tournament, TournamentMeta } from '@/domain/types';
import { EMPTY_MATCH_DETAIL, placeholderRef } from '@/domain/types';
import { formatDateTime } from '@/features/roadmap/format';
import { MatchDetailPanel } from '@/components/panel/MatchDetailPanel';
import {
  ARGENTINA,
  FRANCE,
  KICKOFF_UTC,
  makeGroupA,
  makeGroupMatch,
  makeMockMatch,
} from './match-detail/__test-support__/match-detail-fixtures';

// Mock the detail hook so the panel renders a deterministic state without a real
// fetch. Each test overrides the return via the mocked module.
const useMatchDetailQueryMock = vi.fn();
vi.mock('@/features/roadmap/hooks/useMatchDetailQuery', () => ({
  useMatchDetailQuery: (matchId: string | null, isLive: boolean) =>
    useMatchDetailQueryMock(matchId, isLive),
}));

// --- Fixtures -------------------------------------------------------------

// Computed via the façade so the assertion is independent of the runner's zone
// (the panel renders formatDateTime(kickoff); we expect exactly that text).
const KICKOFF_TEXT = formatDateTime(KICKOFF_UTC);

const CLOSE_BUTTON_NAME = 'Close match details';
const PANEL_NAME = 'Match details';

const GROUP_MATCH = makeGroupMatch();
const MOCK_MATCH = makeMockMatch();

const EMPTY_BRACKET: Bracket = { rounds: [] };

// A synthetic, unscheduled Round-of-16 node (the id `build-bracket` would mint
// for an empty slot). It is a selectable graph node whose id is NOT in
// `tournament.matches`, so the panel must fall back to the bracket header.
const KNOCKOUT_NODE_ID = 'wc2026-ko-r16-1';
const KNOCKOUT_NODE: BracketNode = {
  matchId: KNOCKOUT_NODE_ID,
  stage: 'ROUND_OF_16',
  slotIndex: 0,
  home: {
    side: 'home',
    source: { kind: 'group', position: '1A' },
    team: placeholderRef('Winner 1A'),
  },
  away: {
    side: 'away',
    source: { kind: 'group', position: '2B' },
    team: placeholderRef('Runner-up 2B'),
  },
};
const KNOCKOUT_BRACKET: Bracket = {
  rounds: [{ stage: 'ROUND_OF_16', label: 'Round of 16', nodes: [KNOCKOUT_NODE] }],
};

const META: TournamentMeta = {
  id: 'WC-2026',
  name: 'FIFA World Cup 2026',
  season: 2026,
  provider: 'fifa',
  fetchedAt: KICKOFF_UTC,
};

const TOURNAMENT: Tournament = {
  meta: META,
  teams: [ARGENTINA, FRANCE],
  matches: [GROUP_MATCH, MOCK_MATCH],
  groups: [makeGroupA()],
  bracket: EMPTY_BRACKET,
};

// Same tournament but carrying the unscheduled knockout bracket node above; its
// id is intentionally absent from `matches` so the panel resolves it via the
// bracket rounds.
const TOURNAMENT_WITH_BRACKET: Tournament = { ...TOURNAMENT, bracket: KNOCKOUT_BRACKET };

// --- Helpers --------------------------------------------------------------

function renderPanel(matchId: string | null, onClose = vi.fn(), tournament = TOURNAMENT) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <MatchDetailPanel tournament={tournament} matchId={matchId} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { ...utils, onClose };
}

function openPanel(): HTMLElement {
  return screen.getByRole('complementary', { name: PANEL_NAME });
}

function closeButton(): HTMLElement {
  return screen.getByRole('button', { name: CLOSE_BUTTON_NAME });
}

afterEach(() => {
  cleanup();
  useMatchDetailQueryMock.mockReset();
});

/** Default the hook to a ready state with an empty detail. */
function stubDetailReady(matchId: string) {
  useMatchDetailQueryMock.mockReturnValue({
    detail: EMPTY_MATCH_DETAIL(matchId),
    status: 'ready',
    error: null,
  });
}

function stubDetailLoading() {
  useMatchDetailQueryMock.mockReturnValue({ detail: null, status: 'loading', error: null });
}

function stubDetailUnavailable() {
  useMatchDetailQueryMock.mockReturnValue({ detail: null, status: 'unavailable', error: null });
}

// --- Accessibility contract (guard, stays green) --------------------------

describe('MatchDetailPanel — always-mounted accessibility contract (guard)', () => {
  it('exposes the panel as a complementary region named "Match details"', () => {
    stubDetailReady(GROUP_MATCH.id);
    renderPanel(GROUP_MATCH.id);
    expect(openPanel()).toBeInTheDocument();
  });

  it('is aria-hidden=false when a match is selected', () => {
    stubDetailReady(GROUP_MATCH.id);
    renderPanel(GROUP_MATCH.id);
    expect(openPanel()).toHaveAttribute('aria-hidden', 'false');
  });

  it('is aria-hidden=true and inert when no match is selected (closed)', () => {
    stubDetailLoading();
    const { container } = renderPanel(null);
    const panel = container.querySelector('aside[aria-label="Match details"]');
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveAttribute('inert');
  });

  it('keeps the close button out of the accessibility tree while closed (inert)', () => {
    stubDetailLoading();
    renderPanel(null);
    expect(screen.queryByRole('complementary', { name: PANEL_NAME })).toBeNull();
    expect(screen.queryByRole('button', { name: CLOSE_BUTTON_NAME })).toBeNull();
  });
});

describe('MatchDetailPanel — close button (guard)', () => {
  it('exposes a button with the accessible name "Close match details"', () => {
    stubDetailReady(GROUP_MATCH.id);
    renderPanel(GROUP_MATCH.id);
    expect(closeButton()).toBeInTheDocument();
  });

  it('invokes onClose exactly once on click', async () => {
    stubDetailReady(GROUP_MATCH.id);
    const user = userEvent.setup();
    const { onClose } = renderPanel(GROUP_MATCH.id);
    await user.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the close glyph as a decorative lucide SVG, not a literal text glyph', () => {
    stubDetailReady(GROUP_MATCH.id);
    renderPanel(GROUP_MATCH.id);
    const svg = closeButton().querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(closeButton().textContent ?? '').not.toContain('✕');
  });
});

// --- Redesigned header + tabs (RED until implemented) ---------------------

describe('MatchDetailPanel — 3-tab redesign (RED until implemented)', () => {
  it('passes the selected matchId through to the detail hook', () => {
    stubDetailReady(GROUP_MATCH.id);
    renderPanel(GROUP_MATCH.id);
    expect(useMatchDetailQueryMock).toHaveBeenCalledWith(GROUP_MATCH.id, expect.any(Boolean));
  });

  it('renders the tabs as a tablist (Timeline / Lineups / Stats)', () => {
    stubDetailReady(GROUP_MATCH.id);
    renderPanel(GROUP_MATCH.id);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('shows the group standing position for each team in the header', () => {
    stubDetailReady(GROUP_MATCH.id);
    renderPanel(GROUP_MATCH.id);
    // Argentina is 1st, France 4th in group A.
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.getByText('4th')).toBeInTheDocument();
  });

  it('renders the kickoff via the date façade in the header', () => {
    stubDetailReady(GROUP_MATCH.id);
    renderPanel(GROUP_MATCH.id);
    expect(screen.getByText(KICKOFF_TEXT)).toBeInTheDocument();
  });

  it('renders the "detail unavailable" empty state for a mock match (null providerRef)', () => {
    stubDetailUnavailable();
    renderPanel(MOCK_MATCH.id);
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
  });
});

// --- CR-5: focus management on open/close ---------------------------------
//
// RED until MatchDetailPanel moves focus to the close button when it opens
// (matchId null->set) and restores focus to the element that was focused at
// open time when it closes (matchId set->null), guarding for a still-connected
// element. Escape-to-close and the inert/aria-hidden contract must be preserved.

/**
 * Render the panel with `matchId` controllable across rerenders, plus a real
 * attached trigger <button> so jsdom focus semantics behave (focus only lands
 * on connected focusable elements). Returns the trigger and a `setMatchId`
 * helper that rerenders the same tree (so the open/close transition fires).
 */
function renderWithTrigger(initialMatchId: string | null, onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const trigger = document.createElement('button');
  trigger.textContent = 'Open match';
  document.body.appendChild(trigger);

  const tree = (matchId: string | null) => (
    <QueryClientProvider client={client}>
      <MatchDetailPanel tournament={TOURNAMENT} matchId={matchId} onClose={onClose} />
    </QueryClientProvider>
  );
  const utils = render(tree(initialMatchId));
  const setMatchId = (matchId: string | null) => utils.rerender(tree(matchId));
  return { ...utils, trigger, setMatchId, onClose };
}

/**
 * The canonical AC7/AC8 setup recipe (review M-1): mount closed with a real,
 * attached trigger, focus the trigger, then open via rerender so the
 * null->set transition fires AFTER a known element holds focus. Returns the
 * harness so each test drives the close transition itself.
 *
 * jsdom focus only lands on connected focusable elements, so capturing the
 * trigger via document.activeElement is only meaningful once it is focused —
 * hence the strict ordering enforced here.
 */
function openWithFocusedTrigger(onClose = vi.fn()) {
  stubDetailReady(GROUP_MATCH.id);
  const harness = renderWithTrigger(null, onClose);
  harness.trigger.focus();
  expect(harness.trigger).toHaveFocus(); // precondition: trigger holds focus
  harness.setMatchId(GROUP_MATCH.id); // null -> set: panel opens
  return harness;
}

describe('MatchDetailPanel — CR-5 focus management', () => {
  it('moves focus to the close button when the panel opens (matchId null -> set)', () => {
    const { trigger } = openWithFocusedTrigger();
    expect(trigger).not.toHaveFocus();
    expect(closeButton()).toHaveFocus();
  });

  it('restores focus to the trigger that was focused at open when the panel closes (set -> null)', () => {
    const { setMatchId, trigger } = openWithFocusedTrigger();
    expect(closeButton()).toHaveFocus();

    setMatchId(null); // set -> null: panel closes
    expect(trigger).toHaveFocus();
  });

  it('round-trips focus across a reopen: trigger -> close button -> trigger -> close button', () => {
    // Determinism check: the capture/restore is not a one-shot — a second
    // open/close cycle must behave identically (no stale ref leaking through).
    const { setMatchId, trigger } = openWithFocusedTrigger();
    expect(closeButton()).toHaveFocus();

    setMatchId(null);
    expect(trigger).toHaveFocus();

    setMatchId(GROUP_MATCH.id);
    expect(closeButton()).toHaveFocus();

    setMatchId(null);
    expect(trigger).toHaveFocus();
  });

  it('does not throw, and keeps focus on the close button, when the trigger is gone before close', () => {
    const { setMatchId, trigger } = openWithFocusedTrigger();
    expect(closeButton()).toHaveFocus();

    // Remove the trigger from the DOM before closing (e.g. its match node was
    // filtered out of the canvas). The isConnected guard must skip restore.
    trigger.remove();
    expect(() => setMatchId(null)).not.toThrow();
    // Focus must NOT be thrown onto the detached node...
    expect(document.activeElement).not.toBe(trigger);
    // ...and must not have jumped to some unrelated element: it stays where it
    // was (the close button, which is inert-but-still-mounted post-close — so it
    // is now aria-hidden/inert and only reachable via the hidden:true query).
    expect(screen.getByRole('button', { name: CLOSE_BUTTON_NAME, hidden: true })).toHaveFocus();
  });

  it('still closes on Escape after opening (Escape-to-close preserved)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    openWithFocusedTrigger(onClose);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape while the panel is closed', async () => {
    // The Escape listener is gated on an open panel; pressing Escape with no
    // match selected must be a no-op (no spurious close callbacks).
    stubDetailLoading();
    const user = userEvent.setup();
    const { onClose } = renderWithTrigger(null);

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the closed panel inert + aria-hidden after a close transition', () => {
    const { setMatchId, container } = openWithFocusedTrigger();
    setMatchId(null);

    const panel = container.querySelector('aside[aria-label="Match details"]');
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveAttribute('inert');
  });
});

// --- Unscheduled knockout bracket node (H-1 regression) -------------------

describe('MatchDetailPanel — unscheduled knockout bracket node', () => {
  it('resolves a synthetic knockout id via the bracket and shows the round label + placeholder teams', () => {
    // The hook must stay disabled (null id) for a non-match node.
    useMatchDetailQueryMock.mockReturnValue({ detail: null, status: 'loading', error: null });
    renderPanel(KNOCKOUT_NODE_ID, vi.fn(), TOURNAMENT_WITH_BRACKET);

    expect(useMatchDetailQueryMock).toHaveBeenCalledWith(null, expect.any(Boolean));
    expect(screen.getByText('Round of 16')).toBeInTheDocument();
    expect(screen.getByText('Winner 1A')).toBeInTheDocument();
    expect(screen.getByText('Runner-up 2B')).toBeInTheDocument();
    // Not the generic content-free fallback card.
    expect(screen.queryByText('Fixture to be confirmed')).toBeNull();
  });
});
