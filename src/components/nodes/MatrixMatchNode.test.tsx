// @vitest-environment jsdom
//
// Component spec for `MatrixMatchNode` — the `matrix-match` STATION node of the
// matrix journey-lanes view (requirement 2026-07-01-1030; plan Test Strategy 12 /
// Acceptance #6). A station renders its TWO teams (via `Flag`/`refLabel`) + its
// score/status; a scheduled match with an unresolved side shows the placeholder
// label (via `refLabel`) and no score; `data-status` reflects the match status.
//
// RED until `MatrixMatchNode.tsx` implements the station render path: the stub
// returns `null`, so the team labels, score caption and `data-status` are ALL
// missing — the assertions fail on the un-built render path, not an import error.
// The node renders inside `ReactFlowProvider` (its `Handle`s require the context),
// mirroring `MatchDotNode.test.tsx`.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { placeholderRef, teamRef } from '@/domain/types';
import type { MatrixMatchNodeData } from '@/features/roadmap/graph-model';
import { ARG, FRA } from './__test-support__/team-row-fixtures';
import { MatrixMatchNode } from './MatrixMatchNode';

const DASH = '–'; // EN DASH (U+2013) — the shared score glyph.

function makeData(overrides: Partial<MatrixMatchNodeData> = {}): MatrixMatchNodeData {
  return {
    matchId: 'wc2026-r32-1',
    stage: 'ROUND_OF_32',
    roundLabel: 'Round of 32',
    group: null,
    matchday: null,
    home: teamRef(ARG),
    away: teamRef(FRA),
    score: `2${DASH}1`,
    status: 'finished',
    isFinal: false,
    isThirdPlace: false,
    kickoff: '2026-07-04T18:00:00Z',
    ...overrides,
  };
}

function renderStation(data: MatrixMatchNodeData) {
  return render(
    <ReactFlowProvider>
      <MatrixMatchNode
        id={data.matchId}
        type="matrix-match"
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

describe('MatrixMatchNode — decided station [Test 12 / Acceptance #6]', () => {
  it('renders BOTH teams’ labels (via refLabel) for a decided match', () => {
    const { container } = renderStation(makeData());
    const text = container.textContent ?? '';
    // Distinct home/away labels — a transposed/omitted side is caught. RED: null render.
    expect(text).toContain('Argentina');
    expect(text).toContain('France');
  });

  it('renders the score caption for a decided match', () => {
    const { container } = renderStation(makeData({ score: `2${DASH}1` }));
    expect(container.textContent ?? '').toContain(`2${DASH}1`);
  });

  it('renders a flag element per side (2 teams shown)', () => {
    const { container } = renderStation(makeData());
    // Flag falls back to a code monogram span (flagUrl null) — one per resolved side.
    const monograms = container.textContent ?? '';
    expect(monograms).toContain('ARG');
    expect(monograms).toContain('FRA');
  });

  it('exposes data-status reflecting the match status', () => {
    const { container } = renderStation(makeData({ status: 'finished' }));
    expect(container.querySelector('[data-status="finished"]')).not.toBeNull();
    const { container: live } = renderStation(makeData({ status: 'live' }));
    expect(live.querySelector('[data-status="live"]')).not.toBeNull();
  });

  it('carries an accessible label naming the matchup', () => {
    const { container } = renderStation(makeData());
    const labelled = container.querySelector('[aria-label]');
    expect(labelled, 'the station must carry an aria-label').not.toBeNull();
    expect(labelled!.getAttribute('aria-label')).not.toBe('');
  });
});

describe('MatrixMatchNode — unresolved / scheduled side [Test 12 / Acceptance #6]', () => {
  it('shows the placeholder label (via refLabel) for a scheduled match with an unresolved side', () => {
    const { container } = renderStation(
      makeData({
        status: 'scheduled',
        away: placeholderRef('Winner M50'),
        score: null,
      }),
    );
    const text = container.textContent ?? '';
    // The resolved side still names its team; the unresolved side shows the label.
    expect(text).toContain('Argentina');
    expect(text).toContain('Winner M50');
  });

  it('renders NO score caption for a scheduled (undecided) match', () => {
    const { container } = renderStation(
      makeData({ status: 'scheduled', away: placeholderRef('Winner M50'), score: null }),
    );
    // No en-dash score glyph when the match has no score.
    expect(container.textContent ?? '').not.toContain(`0${DASH}0`);
    expect(container.querySelector('[data-status="scheduled"]')).not.toBeNull();
  });
});

describe('MatrixMatchNode — final-band accents [Acceptance #6]', () => {
  it('flags the FINAL station via data-final', () => {
    const { container } = renderStation(
      makeData({ stage: 'FINAL', roundLabel: 'Final', isFinal: true }),
    );
    // A distinct accent hook for the final band (gold/accent) — RED: null render.
    expect(container.querySelector('[data-final="true"]')).not.toBeNull();
  });

  it('flags the THIRD_PLACE station via data-third', () => {
    const { container } = renderStation(
      makeData({ stage: 'THIRD_PLACE', roundLabel: 'Third place', isThirdPlace: true }),
    );
    expect(container.querySelector('[data-third="true"]')).not.toBeNull();
  });
});
