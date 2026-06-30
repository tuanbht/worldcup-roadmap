// @vitest-environment jsdom
//
// Component spec for TeamBadgeNode — the outer-ring circular flag badge of the
// radial circle view (requirement 2026-06-30-1104; plan Test Strategy 21-22 /
// Acceptance #1, #7). Two concerns:
//   - a RESOLVED team renders a ROUND flag (`shape="round"` → `rounded-full`),
//     the focus-team `<button aria-label="Show matches for {team}">`, `data-focus`
//     reflecting `focusState`, and a dim class when eliminated;
//   - a PLACEHOLDER / null-code ref renders the ROUND monogram FALLBACK
//     (`rounded-full`), not a rect chip — most R32 badges are placeholders in the
//     mock [M2].
//
// RED until TeamBadgeNode is implemented (today the stub renders null), so each
// assertion fails on the MISSING element/class, not an import error.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import { teamRef, placeholderRef } from '@/domain/types';
import type { TeamBadgeNodeData } from '@/features/roadmap/graph-model';
import { ARG, focusLabel } from './__test-support__/team-row-fixtures';
import { TeamBadgeNode } from './TeamBadgeNode';

function makeData(overrides: Partial<TeamBadgeNodeData> = {}): TeamBadgeNodeData {
  return {
    matchId: 'wc2026-r32-1',
    teamId: ARG.id,
    team: teamRef(ARG),
    code: ARG.code,
    flagUrl: ARG.flagUrl,
    side: 'home',
    eliminated: false,
    ...overrides,
  };
}

function renderBadge(data: TeamBadgeNodeData) {
  return render(
    <ReactFlowProvider>
      <TeamBadgeNode
        id={`badge-${data.matchId}-${data.side}`}
        type="team-badge"
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

describe('TeamBadgeNode — resolved team [Test 21]', () => {
  it('renders a ROUND flag roundel (rounded-full)', () => {
    const { container } = renderBadge(makeData());
    expect(container.querySelector('.rounded-full')).not.toBeNull();
  });

  it('exposes the focus-team button with the "Show matches for {team}" label', () => {
    renderBadge(makeData({ onFocusTeam: vi.fn() }));
    expect(screen.getByRole('button', { name: focusLabel(ARG) })).toBeInTheDocument();
  });

  it('invokes onFocusTeam with the team id when the badge button is activated', async () => {
    const user = userEvent.setup();
    const onFocusTeam = vi.fn();
    renderBadge(makeData({ onFocusTeam }));
    await user.click(screen.getByRole('button', { name: focusLabel(ARG) }));
    expect(onFocusTeam).toHaveBeenCalledWith(ARG.id);
  });

  it('reflects focusState via data-focus (on / dim)', () => {
    const { container: on } = renderBadge(makeData({ focusState: 'on' }));
    expect(on.querySelector('[data-focus="on"]')).not.toBeNull();
    const { container: dim } = renderBadge(makeData({ focusState: 'dim' }));
    expect(dim.querySelector('[data-focus="dim"]')).not.toBeNull();
  });

  it('applies a dim/eliminated class when the team is eliminated', () => {
    const { container } = renderBadge(makeData({ eliminated: true }));
    // The badge wrapper carries a state hook (a data attribute or class) marking
    // it eliminated. Either signal is acceptable; assert at least one is present.
    const marked =
      container.querySelector('[data-eliminated="true"]') ??
      container.querySelector('[class*="eliminated"]');
    expect(marked, 'an eliminated badge must carry an eliminated marker').not.toBeNull();
  });
});

describe('TeamBadgeNode — placeholder / null-code fallback [Test 22 / M2]', () => {
  it('renders a ROUND monogram fallback (rounded-full), not a rect chip', () => {
    const { container } = renderBadge(
      makeData({
        teamId: null,
        team: placeholderRef('Winner R16-1'),
        code: null,
        flagUrl: null,
      }),
    );
    // The placeholder/TBD badge must still be a round roundel.
    expect(container.querySelector('.rounded-full')).not.toBeNull();
    // ...and NOT the rectangular monogram chip the rect Flag fallback uses.
    expect(container.querySelector('.rounded-\\[3px\\]')).toBeNull();
  });

  it('does not render a focus-team button for an unresolved placeholder slot', () => {
    const { container } = renderBadge(
      makeData({ teamId: null, team: placeholderRef('Winner R16-1'), code: null, flagUrl: null }),
    );
    // Anchor the negative assertion to a POSITIVE one so it is not vacuously true
    // against a component that renders nothing: the placeholder badge DOES render
    // its round roundel, but exposes NO focus-team button (nothing to focus yet).
    expect(container.querySelector('.rounded-full')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Show matches for/ })).toBeNull();
  });
});
