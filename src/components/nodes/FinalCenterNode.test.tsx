// @vitest-environment jsdom
//
// Component spec for FinalCenterNode — the center Final + trophy motif of the
// radial circle view (requirement 2026-06-30-1104 base + 2026-06-30-1416 champion)
// [L1]. It renders the trophy + the two Final teams and carries `data-final="true"`
// (a STRING, matching the e2e center selector).
//
// The base motif (trophy / teams / data-final / focus) is already GREEN — those
// assertions stay passing. The 2026-06-30-1416 block is RED: the current component
// has NO champion-flag render path, so the decided-Final champion-roundel assertion
// fails on the MISSING `.rounded-full` (an unbuilt render branch), not an import
// error. The live-Final negative case (no champion flag) is the regression guard.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { teamRef } from '@/domain/types';
import type { FinalCenterNodeData } from '@/features/roadmap/graph-model';
import { ARG, FRA } from './__test-support__/team-row-fixtures';
import {
  EXPECTED_CAPTION_EDT,
  ISO,
  TBD_CAPTION,
  expectedCaption,
  pinLocalZone,
} from './__test-support__/pinned-zone';
import { FinalCenterNode } from './FinalCenterNode';

function makeData(overrides: Partial<FinalCenterNodeData> = {}): FinalCenterNodeData {
  return {
    matchId: 'wc2026-f-1',
    status: 'live',
    home: teamRef(ARG),
    away: teamRef(FRA),
    // Default: the LIVE Final is undecided → no champion (TBD). Decided override per test.
    winner: null,
    winnerCode: null,
    winnerFlagUrl: null,
    kickoff: ISO,
    ...overrides,
  };
}

function renderCenter(data: FinalCenterNodeData) {
  return render(
    <ReactFlowProvider>
      <FinalCenterNode
        id={data.matchId}
        type="final-center"
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

describe('FinalCenterNode — center motif [Test 24 / L1]', () => {
  it('carries data-final="true" (string, matching the e2e selector)', () => {
    const { container } = renderCenter(makeData());
    const final = container.querySelector('[data-final="true"]');
    expect(final).not.toBeNull();
    expect(final!.getAttribute('data-final')).toBe('true');
  });

  it('renders the two Final teams', () => {
    renderCenter(makeData());
    expect(screen.getByText(ARG.name)).toBeInTheDocument();
    expect(screen.getByText(FRA.name)).toBeInTheDocument();
  });

  it('renders a trophy glyph (lucide Trophy svg)', () => {
    const { container } = renderCenter(makeData());
    // lucide-react renders an inline <svg>; the trophy is the center's focal motif.
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('reflects focusState via data-focus', () => {
    const { container } = renderCenter(makeData({ focusState: 'on' }));
    expect(container.querySelector('[data-focus="on"]')).not.toBeNull();
  });
});

describe('FinalCenterNode — champion flag vs TBD [Test 17 / Acceptance #1, #2, #4] (2026-06-30-1416)', () => {
  it('a DECIDED Final renders the champion round flag (.rounded-full) beside the trophy', () => {
    const { container } = renderCenter(
      makeData({
        status: 'finished',
        winner: teamRef(ARG),
        winnerCode: 'ARG',
        winnerFlagUrl: null,
      }),
    );
    // Champion rendered via Flag shape="round" → a `.rounded-full` roundel (ARG
    // monogram fallback when flagUrl null).
    const roundel = container.querySelector('.rounded-full');
    expect(roundel, 'a decided Final must render the champion round flag').not.toBeNull();
    expect(roundel!.textContent, 'the roundel shows the champion code monogram').toContain('ARG');
    // The trophy svg is still present beside the champion.
    expect(container.querySelector('svg'), 'trophy svg stays').not.toBeNull();
    // Decision 1: the center never carries a score caption, even when decided.
    expect(container.querySelector('.radial-dot__score')).toBeNull();
  });

  it('the default LIVE Final renders trophy + teams but NO champion flag and NO score (TBD)', () => {
    const { container } = renderCenter(makeData());
    // Trophy + the two teams stay (existing motif).
    expect(container.querySelector('svg')).not.toBeNull();
    // But the live/undecided Final shows no champion roundel and no score caption.
    expect(
      container.querySelector('.rounded-full'),
      'a live Final must NOT render a champion flag',
    ).toBeNull();
    expect(container.querySelector('.radial-dot__score')).toBeNull();
  });
});

describe('FinalCenterNode — kickoff date/time caption [Acceptance #2, #4] (2026-07-01-0900)', () => {
  // Pin the viewer's local zone (see __test-support__/pinned-zone.ts) so the center's
  // `formatDateTime(kickoff)` resolves deterministically to TZ; oracles derive from
  // that SAME pinned zone via `expectedCaption()` — no CI-machine-zone dependence.
  pinLocalZone();

  it('renders the raw ISO Final instant in the <time> `dateTime` attribute (not the formatted text)', () => {
    const { container } = renderCenter(makeData({ kickoff: ISO }));
    const time = container.querySelector('time');
    expect(time, 'a <time> caption must render for the Final kickoff').not.toBeNull();
    // The canonical raw instant lives on the attribute, never the human caption text.
    expect(time!.getAttribute('datetime')).toBe(ISO);
    expect(time!.getAttribute('datetime')).not.toBe(time!.textContent);
  });

  it('renders the Final caption in the browser-local zone, applying the EDT shift (04:00Z → 00:00)', () => {
    const { container } = renderCenter(makeData({ kickoff: ISO }));
    const time = container.querySelector('time');
    expect(time!.textContent).toBe(expectedCaption());
    // Pinned literal: the local zone SHIFTED 04:00Z to 00:00 — browser-local, not UTC.
    expect(time!.textContent).toBe(EXPECTED_CAPTION_EDT);
    expect(time!.textContent).toMatch(/^\d{2} [A-Z][a-z]{2}, \d{2}:\d{2}$/);
    expect(time!.textContent).not.toContain('Invalid');
    // Decision 1: the caption is NOT a score caption and NOT a rounded-full roundel —
    // the champion `.rounded-full` discriminator and score selector stay distinct.
    const when = container.querySelector('.radial-dot__when');
    expect(when, 'the kickoff caption uses the dedicated .radial-dot__when class').not.toBeNull();
    expect(when!.tagName.toLowerCase()).toBe('time');
    expect(when!.classList.contains('radial-dot__score')).toBe(false);
    expect(when!.classList.contains('rounded-full')).toBe(false);
    // Never emit a score caption on the center, even with the new WHEN caption present.
    expect(container.querySelector('.radial-dot__score')).toBeNull();
  });

  it('gives the center an aria-label that includes the formatted date/time', () => {
    const { container } = renderCenter(makeData({ kickoff: ISO }));
    const labelled = container.querySelector('[aria-label]');
    expect(labelled, 'the center must carry an aria-label folding in the kickoff').not.toBeNull();
    expect(labelled!.getAttribute('aria-label')).toContain(expectedCaption());
  });

  it('a null kickoff → the caption shows "Date TBD" and emits NO invalid dateTime attribute', () => {
    const { container } = renderCenter(makeData({ kickoff: null }));
    const time = container.querySelector('time');
    expect(time, 'a <time> caption must still render for a TBD kickoff').not.toBeNull();
    expect(time!.textContent).toBe(TBD_CAPTION);
    // A null kickoff must NOT produce an invalid `dateTime`: absent or empty, never
    // the fallback caption.
    const dt = time!.getAttribute('datetime');
    expect(dt === null || dt === '', 'null kickoff → no invalid dateTime attribute').toBe(true);
    expect(dt).not.toBe(TBD_CAPTION);
  });
});
