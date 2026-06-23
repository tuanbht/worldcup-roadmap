import { memo, type ReactElement } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { GroupStandingsFlowNode } from '@/features/roadmap/graph-model';
import { STANDINGS_W } from '@/features/roadmap/layout/layout-constants';
import { GroupTableNode } from './GroupTableNode';

/**
 * Always-on standings table node, rendered directly under each group-header
 * (requirement item 2). Wraps the shared `GroupTableNode` for `data.group` in a
 * fixed-width shell and threads `data.onFocusTeam` through so each resolved row's
 * flag becomes a focus trigger (item 3). A guide node — no React Flow handles.
 */
function GroupStandingsNodeImpl({ data }: NodeProps<GroupStandingsFlowNode>): ReactElement {
  return (
    <div style={{ width: STANDINGS_W }} className="[contain:layout_paint]">
      <GroupTableNode group={data.group} onFocusTeam={data.onFocusTeam} />
    </div>
  );
}

export const GroupStandingsNode = memo(GroupStandingsNodeImpl);
