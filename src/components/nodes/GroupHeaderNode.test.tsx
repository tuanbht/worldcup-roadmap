// @vitest-environment jsdom
//
// Per-file jsdom pragma (matches MatchNode.test.tsx). GroupHeaderNode is the top
// column guide: it shows the group letter + "Group X", originates feeder edges
// from ONE bottom source handle (no top handle), and opens the standings overlay
// when clicked. Plan Test Strategy 25 / Acceptance #6, #13.
//
// RED until GroupHeaderNode exists.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import type { GroupHeaderNodeData } from '@/features/roadmap/graph-model';
import { GroupHeaderNode } from './GroupHeaderNode';

function makeData(overrides: Partial<GroupHeaderNodeData> = {}): GroupHeaderNodeData {
  return { group: 'A', ...overrides } as GroupHeaderNodeData;
}

function renderNode(data: GroupHeaderNodeData) {
  return render(
    <ReactFlowProvider>
      <GroupHeaderNode
        id={`group-header-${data.group}`}
        type="group-header"
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

describe('GroupHeaderNode — label', () => {
  it('renders the group letter and "Group X"', () => {
    renderNode(makeData({ group: 'C' }));
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('Group C')).toBeInTheDocument();
  });
});

describe('GroupHeaderNode — feeder handle', () => {
  it('exposes exactly one bottom source handle and no top handle', () => {
    const { container } = renderNode(makeData());
    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(1);
    expect(container.querySelectorAll('.react-flow__handle-bottom')).toHaveLength(1);
    expect(container.querySelectorAll('.react-flow__handle-top')).toHaveLength(0);
  });
});

describe('GroupHeaderNode — open standings', () => {
  it('invokes onOpenStandings with its group when clicked', async () => {
    const onOpenStandings = vi.fn();
    const user = userEvent.setup();
    renderNode(makeData({ group: 'D', onOpenStandings }));
    await user.click(screen.getByRole('button'));
    expect(onOpenStandings).toHaveBeenCalledWith('D');
  });
});
