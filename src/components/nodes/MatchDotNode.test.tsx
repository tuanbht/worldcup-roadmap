// @vitest-environment jsdom
//
// Component spec for MatchDotNode — the inner-ring KO match dot of the radial
// circle view (requirement 2026-06-30-1104 base + 2026-06-30-1416 winner/score).
// The dot exposes its status via `data-status` (live/finished/scheduled → the
// live/decided/undecided color), an accessible label, and `data-focus`.
//
// The base motif (status / a11y / focus) is already GREEN — those assertions stay
// passing. The 2026-06-30-1416 block is RED: the current component renders the
// neutral `radial-dot__core` only and has NO winner-roundel / score-caption render
// path, so those assertions fail on the MISSING winner flag + `.radial-dot__score`
// element (an unbuilt render branch), not an import error.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { teamRef } from '@/domain/types';
import type { MatchDotNodeData } from '@/features/roadmap/graph-model';
import { ARG, FRA } from './__test-support__/team-row-fixtures';
import { MatchDotNode } from './MatchDotNode';

function makeData(overrides: Partial<MatchDotNodeData> = {}): MatchDotNodeData {
  return {
    matchId: 'wc2026-r16-1',
    stage: 'ROUND_OF_16',
    roundLabel: 'Round of 16',
    status: 'finished',
    home: teamRef(ARG),
    away: teamRef(FRA),
    // Default: UNDECIDED (no winner / no score) — decided overrides supplied per test.
    winner: null,
    winnerCode: null,
    winnerFlagUrl: null,
    score: null,
    ...overrides,
  };
}

function renderDot(data: MatchDotNodeData) {
  return render(
    <ReactFlowProvider>
      <MatchDotNode
        id={data.matchId}
        type="match-dot"
        data={data}
        dragging={false}
        isConnectable={false}
        selected={false}
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

describe('MatchDotNode — status + a11y [Test 23]', () => {
  it('exposes data-status reflecting the match status', () => {
    const { container } = renderDot(makeData({ status: 'live' }));
    expect(container.querySelector('[data-status="live"]')).not.toBeNull();
    const { container: fin } = renderDot(makeData({ status: 'finished' }));
    expect(fin.querySelector('[data-status="finished"]')).not.toBeNull();
    const { container: sched } = renderDot(makeData({ status: 'scheduled' }));
    expect(sched.querySelector('[data-status="scheduled"]')).not.toBeNull();
  });

  it('exposes an accessible label naming the matchup', () => {
    const { container } = renderDot(makeData());
    // An accessible name on the dot (aria-label) — present for SR users to reach
    // the match. The exact copy is the GREEN stage's; assert a non-empty label.
    const labelled = container.querySelector('[aria-label]');
    expect(labelled, 'the dot must carry an aria-label').not.toBeNull();
    expect(labelled!.getAttribute('aria-label')).not.toBe('');
  });

  it('reflects focusState via data-focus', () => {
    const { container } = renderDot(makeData({ focusState: 'on' }));
    expect(container.querySelector('[data-focus="on"]')).not.toBeNull();
  });
});

describe('MatchDotNode — winner roundel + score caption [Test 14-16 / Acceptance #1, #3, #4, #9] (2026-06-30-1416)', () => {
  const DASH = '–'; // EN DASH (U+2013)

  /**
   * The WINNER roundel is a `Flag shape="round"` (a `.rounded-full` element that is
   * NOT the neutral `.radial-dot__core` — the core is also round but anonymous).
   * Discriminate so the undecided dot's round core is never mistaken for a winner.
   */
  const winnerRoundel = (root: ParentNode): Element | null =>
    [...root.querySelectorAll('.rounded-full')].find(
      (el) => !el.classList.contains('radial-dot__core'),
    ) ?? null;

  it('a DECIDED outer-ring dot renders the winner round flag + the .radial-dot__score caption inline', () => {
    const { container } = renderDot(
      makeData({
        stage: 'QUARTER_FINALS',
        winner: teamRef(ARG),
        winnerCode: 'ARG',
        winnerFlagUrl: null,
        score: `2${DASH}1`,
      }),
    );
    // The winner is rendered via Flag shape="round" → a `.rounded-full` roundel
    // (with flagUrl null, Flag falls back to the round ARG monogram span) — and it
    // is the WINNER's flag, not the anonymous neutral core.
    const roundel = winnerRoundel(container);
    expect(roundel, 'a decided dot must render a round winner flag').not.toBeNull();
    expect(roundel!.textContent, 'the roundel shows the winnerCode monogram').toContain('ARG');
    // The compact score caption shows inline for the outer rings (R32/R16/QF).
    const caption = container.querySelector('.radial-dot__score');
    expect(caption, 'a decided outer-ring dot must render .radial-dot__score').not.toBeNull();
    expect(caption!.textContent).toContain(`2${DASH}1`);
    // The status ring is retained around the roundel (decided coloring, 1104).
    expect(container.querySelector('[data-status="finished"]')).not.toBeNull();
  });

  it('an UNDECIDED (live) dot renders the neutral core and NO winner flag / NO score caption', () => {
    const { container } = renderDot(
      makeData({ status: 'live', winner: null, winnerCode: null, score: null }),
    );
    expect(container.querySelector('.radial-dot__core'), 'neutral TBD core stays').not.toBeNull();
    expect(winnerRoundel(container), 'no winner roundel when undecided').toBeNull();
    expect(
      container.querySelector('.radial-dot__score'),
      'no score caption when undecided',
    ).toBeNull();
    // The live status ring (color) is still exposed.
    expect(container.querySelector('[data-status="live"]')).not.toBeNull();
  });

  it('SF-ring rule (decision 3): a decided SEMI_FINALS dot keeps the score reachable via title/aria, NOT an inline .radial-dot__score', () => {
    const { container } = renderDot(
      makeData({
        stage: 'SEMI_FINALS',
        winner: teamRef(ARG),
        winnerCode: 'ARG',
        score: `1${DASH}0`,
      }),
    );
    // Still shows the WINNER roundel on the tightest ring (flag never suppressed).
    const roundel = winnerRoundel(container);
    expect(roundel, 'SF still renders the winner roundel').not.toBeNull();
    expect(roundel!.textContent).toContain('ARG');
    // But NO always-on inline caption near the dense center.
    expect(
      container.querySelector('.radial-dot__score'),
      'SF suppresses the inline score caption',
    ).toBeNull();
    // The score is still REACHABLE — present in a title or the aria-label so a
    // screen-reader / hover / zoom surfaces it (no information is lost).
    const ariaScores = [...container.querySelectorAll('[aria-label]')].map(
      (el) => el.getAttribute('aria-label') ?? '',
    );
    const titleScores = [...container.querySelectorAll('[title]')].map(
      (el) => el.getAttribute('title') ?? '',
    );
    const reachable = [...ariaScores, ...titleScores].some((s) => s.includes(`1${DASH}0`));
    expect(reachable, 'the SF score must be reachable on focus/hover (title/aria)').toBe(true);
  });
});
