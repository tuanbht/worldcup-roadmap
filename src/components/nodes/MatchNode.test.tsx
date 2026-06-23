// @vitest-environment jsdom
//
// Per-file jsdom pragma (matches MatchDetailPanel.test.tsx / useTournamentQuery
// .test.tsx). Two concerns live here:
//   1. Already-green contract — the header label ("Group A · MD1", or "Group A"
//      when matchday is null, never for a KO card) and the vertical handles (one
//      top target, one bottom source). These pass against the shipped MatchNode.
//   2. RED nearest-match badge work — the on-card flag/pennant badge, the distinct
//      card emphasis, and the appended aria-label suffix. These fail until
//      MatchNode renders `<NearestBadge>` and the emphasis from `data.isNearest`.
//
// Every badge assertion is scoped to the stable `[data-nearest-badge]` hook via
// `within(...)` so the StatusPill's own sr-only "Live" text and `.animate-livepulse`
// dot (present on ANY live card) can never false-positive a badge-variant check.
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ReactFlowProvider, Position } from '@xyflow/react';
import { teamRef, EMPTY_SCORE } from '@/domain/types';
import type { Team } from '@/domain/types';
import type { MatchNodeData } from '@/features/roadmap/graph-model';
import { MatchNode } from './MatchNode';

const ARG: Team = { id: 'team-arg', name: 'Argentina', code: 'ARG', flagUrl: null };
const FRA: Team = { id: 'team-fra', name: 'France', code: 'FRA', flagUrl: null };

function makeData(overrides: Partial<MatchNodeData>): MatchNodeData {
  return {
    matchId: 'm1',
    stage: 'GROUP_STAGE',
    roundLabel: 'Group Stage',
    group: 'A',
    matchday: 1,
    home: teamRef(ARG),
    away: teamRef(FRA),
    score: EMPTY_SCORE,
    status: 'scheduled',
    kickoff: '2026-06-02T14:30:00.000Z',
    minute: null,
    venue: { name: null, city: null },
    isFinal: false,
    isThirdPlace: false,
    ...overrides,
  };
}

/** Render a MatchNode inside the RF provider context Handle requires. */
function renderNode(data: MatchNodeData, selected = false) {
  return render(
    <ReactFlowProvider>
      <MatchNode
        id={data.matchId}
        type="match"
        data={data}
        dragging={false}
        isConnectable={false}
        selected={selected}
        zIndex={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        deletable
        selectable
        draggable
      />
    </ReactFlowProvider>,
  );
}

/** The stable badge hook from the plan (H1). All badge assertions scope to it. */
const BADGE = '[data-nearest-badge]';

/** The single nearest-badge element, or null when absent. */
function queryBadge(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(BADGE);
}

/** The nearest badge, asserting it is present — fails loudly when the card omits it. */
function getBadge(container: HTMLElement): HTMLElement {
  const badge = queryBadge(container);
  expect(badge).not.toBeNull();
  return badge!;
}

/** The card root `<article>` for the rendered node. */
function getArticle(container: HTMLElement): HTMLElement {
  return container.querySelector('article')!;
}

describe('MatchNode — group label', () => {
  it('renders "Group A · MD1" for a group card', () => {
    renderNode(makeData({ group: 'A', matchday: 1 }));
    expect(screen.getByText(/Group A.*MD1/)).toBeInTheDocument();
  });

  it('falls back to "Group A" (no MD) when matchday is null, never the stage label', () => {
    // FIFA supplies GroupName but not MatchDay for WC-2026 group matches, so
    // matchday arrives null. The card must still read by group, not "Group Stage".
    renderNode(makeData({ group: 'A', matchday: null, roundLabel: 'Group Stage' }));
    expect(screen.getByText('Group A')).toBeInTheDocument();
    expect(screen.queryByText('Group Stage')).not.toBeInTheDocument();
  });

  it('renders no group label for a knockout card', () => {
    renderNode(makeData({ stage: 'FINAL', roundLabel: 'Final', group: null, matchday: null }));
    expect(screen.queryByText(/Group [A-L].*MD\d/)).not.toBeInTheDocument();
  });
});

describe('MatchNode — vertical handles', () => {
  it('exposes exactly one top target and one bottom source handle', () => {
    const { container } = renderNode(makeData({}));
    const handles = container.querySelectorAll('.react-flow__handle');
    const targets = container.querySelectorAll('.react-flow__handle-top');
    const sources = container.querySelectorAll('.react-flow__handle-bottom');
    expect(handles).toHaveLength(2);
    expect(targets).toHaveLength(1);
    expect(sources).toHaveLength(1);
  });

  it('uses no left/right handle positions', () => {
    const { container } = renderNode(makeData({}));
    expect(container.querySelectorAll('.react-flow__handle-left')).toHaveLength(0);
    expect(container.querySelectorAll('.react-flow__handle-right')).toHaveLength(0);
    // Sanity: Position enum imported so the test fails loudly if RF drops it.
    expect(Position.Top).toBeDefined();
    expect(Position.Bottom).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Nearest-match flag badge + emphasis + aria suffix (Acceptance #1, #3, #4, #5,
// #6, #8). Every badge assertion is scoped to the `[data-nearest-badge]` hook via
// `within(...)` so the StatusPill's own "Live" sr-only text + `.animate-livepulse`
// dot (StatusPill.tsx:31-37, present on ANY live card) can never false-positive
// the badge variant assertions (plan H1). RED until MatchNode renders the badge.
// ---------------------------------------------------------------------------

describe('MatchNode — nearest badge absent (Acceptance #1)', () => {
  it('renders no badge and no data-nearest when isNearest is absent', () => {
    const { container } = renderNode(makeData({}));
    expect(queryBadge(container)).toBeNull();
    expect(getArticle(container).getAttribute('data-nearest')).not.toBe('true');
  });

  it('renders no badge for a live card that is NOT the nearest', () => {
    // A live StatusPill exists, but without isNearest there is no flag badge —
    // proves the badge is keyed on isNearest, not on live status.
    const { container } = renderNode(makeData({ status: 'live', minute: 67 }));
    expect(queryBadge(container)).toBeNull();
  });

  it('leaves the accessible name with no nearest suffix when not nearest', () => {
    renderNode(makeData({ group: 'A', matchday: 1 }));
    const article = screen.getByRole('article');
    expect(article.getAttribute('aria-label')).not.toMatch(/current match|live match/);
  });
});

describe('MatchNode — nearest badge accent variant (Acceptance #3, #6)', () => {
  it('shows the upcoming pennant ("Next") with no pulse and an aria-hidden Flag icon', () => {
    const { container } = renderNode(makeData({ isNearest: true, status: 'scheduled' }));
    const badge = getBadge(container);

    // Variant label is the ACCENT one, scoped to the badge.
    expect(within(badge).getByText('Next')).toBeInTheDocument();
    expect(within(badge).queryByText('Live')).toBeNull();

    // No live pulse inside the badge for an upcoming nearest (scoped — the
    // StatusPill pulse only exists on live cards, never here).
    expect(badge.querySelector('.animate-livepulse')).toBeNull();

    // The lucide Flag icon is decorative.
    const svg = badge.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');

    // The article is marked nearest.
    expect(getArticle(container).getAttribute('data-nearest')).toBe('true');
  });

  it('uses the accent (not live) variant for a nearest card whose status is finished', () => {
    // Defensive: live-ness is derived strictly from status === 'live'. A nearest
    // card with any other status (here finished) must read as the accent pennant —
    // "Next", no pulse — so the badge never mislabels a non-live card as live.
    const { container } = renderNode(makeData({ isNearest: true, status: 'finished' }));
    const badge = getBadge(container);
    expect(within(badge).getByText('Next')).toBeInTheDocument();
    expect(within(badge).queryByText('Live')).toBeNull();
    expect(badge.querySelector('.animate-livepulse')).toBeNull();
  });

  it('appends "— current match" to the accessible name (upcoming nearest)', () => {
    renderNode(makeData({ isNearest: true, status: 'scheduled' }));
    const article = screen.getByRole('article');
    expect(article.getAttribute('aria-label')).toMatch(/— current match$/);
  });

  it('flags a knockout card as nearest: badge + suffix, KO round label preserved', () => {
    // A KO card (group === null) can be the nearest fixture (e.g. the Final). It
    // must still carry the badge and the "— current match" suffix, and the suffix
    // must append to the ROUND label, not a group label that does not exist.
    const { container } = renderNode(
      makeData({
        isNearest: true,
        status: 'scheduled',
        group: null,
        matchday: null,
        roundLabel: 'Final',
      }),
    );
    expect(getBadge(container)).toBeInTheDocument();
    const article = getArticle(container);
    expect(article.getAttribute('data-nearest')).toBe('true');
    const label = article.getAttribute('aria-label')!;
    expect(label).toMatch(/^Final:/);
    expect(label).toMatch(/— current match$/);
    expect(label).not.toMatch(/Group/);
  });
});

describe('MatchNode — nearest badge live variant (Acceptance #3, #6)', () => {
  it('shows the live pennant ("Live") with a pulse INSIDE the badge', () => {
    const { container } = renderNode(makeData({ isNearest: true, status: 'live', minute: 67 }));
    const badge = getBadge(container);

    // Live variant label, scoped to the badge (not the StatusPill's sr-only "Live").
    expect(within(badge).getByText('Live')).toBeInTheDocument();
    expect(within(badge).queryByText('Next')).toBeNull();

    // The badge carries its OWN live pulse affordance, scoped within the badge so
    // the StatusPill pulse on the same card cannot satisfy this on its behalf.
    expect(badge.querySelector('.animate-livepulse')).not.toBeNull();

    const svg = badge.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
  });

  it('appends "— live match" to the accessible name (live nearest)', () => {
    renderNode(makeData({ isNearest: true, status: 'live', minute: 67 }));
    const article = screen.getByRole('article');
    expect(article.getAttribute('aria-label')).toMatch(/— live match$/);
  });
});

describe('MatchNode — aria-label preservation (Acceptance #6)', () => {
  it('keeps the full existing base label and only appends the suffix', () => {
    // Capture the base label from a non-nearest render, then assert the nearest
    // render is exactly base + suffix (no content dropped or reordered).
    const base = makeData({ group: 'A', matchday: 1, status: 'scheduled' });
    const { unmount } = renderNode(base);
    const baseLabel = screen.getByRole('article').getAttribute('aria-label')!;
    expect(baseLabel).toMatch(/Group A.*MD1/);
    unmount();

    renderNode({ ...base, isNearest: true });
    const nearestLabel = screen.getByRole('article').getAttribute('aria-label')!;
    expect(nearestLabel).toBe(`${baseLabel} — current match`);
  });
});

describe('MatchNode — geometry & containment unchanged (Acceptance #5)', () => {
  it('keeps the fixed 260×108 size and the two vertical handles when nearest', () => {
    const { container } = renderNode(makeData({ isNearest: true }));
    const article = getArticle(container);
    expect(article.className).toContain('h-[108px]');
    expect(article.className).toContain('w-[260px]');
    expect(container.querySelectorAll('.react-flow__handle-top')).toHaveLength(1);
    expect(container.querySelectorAll('.react-flow__handle-bottom')).toHaveLength(1);
  });

  it('relaxes containment to [contain:layout] on the nearest card only', () => {
    const { container } = renderNode(makeData({ isNearest: true }));
    const article = getArticle(container);
    // The nearest card drops paint clipping so the pennant can overflow above.
    // Match the exact token so `[contain:layout_paint]` cannot satisfy a loose
    // substring check.
    expect(article.className).toMatch(/(^|\s)\[contain:layout\](\s|$)/);
    expect(article.className).not.toContain('[contain:layout_paint]');
  });

  it('keeps [contain:layout_paint] on a non-nearest card', () => {
    const { container } = renderNode(makeData({}));
    expect(getArticle(container).className).toContain('[contain:layout_paint]');
  });
});

describe('MatchNode — nearest emphasis distinct from selected (Acceptance #4)', () => {
  it('marks data-nearest independently of data-selected', () => {
    // Nearest but NOT selected: data-nearest=true, data-selected!=true.
    const { container } = renderNode(makeData({ isNearest: true }), false);
    const article = getArticle(container);
    expect(article.getAttribute('data-nearest')).toBe('true');
    expect(article.getAttribute('data-selected')).not.toBe('true');
  });

  it('keeps data-nearest and data-selected independent when a card is both', () => {
    // Selected AND nearest: both flags coexist so the two emphasis treatments
    // (selected glow vs. nearest glow + top line) are driven by separate hooks and
    // never collapse into one.
    const { container } = renderNode(makeData({ isNearest: true }), true);
    const article = getArticle(container);
    expect(article.getAttribute('data-nearest')).toBe('true');
    expect(article.getAttribute('data-selected')).toBe('true');
    expect(getBadge(container)).toBeInTheDocument();
  });

  it('a selected-but-not-nearest card shows no badge and no data-nearest', () => {
    const { container } = renderNode(makeData({}), true);
    const article = getArticle(container);
    expect(article.getAttribute('data-selected')).toBe('true');
    expect(article.getAttribute('data-nearest')).not.toBe('true');
    expect(queryBadge(container)).toBeNull();
  });
});

describe('MatchNode — badge above the LOD fade (Acceptance #5, L2)', () => {
  it('does not carry data-lod-detail so it stays visible at low zoom', () => {
    const { container } = renderNode(makeData({ isNearest: true }));
    expect(getBadge(container).hasAttribute('data-lod-detail')).toBe(false);
  });
});
