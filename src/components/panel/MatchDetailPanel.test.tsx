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
