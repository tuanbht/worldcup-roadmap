import { memo, type ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { GroupStandingsFlowNode } from '@/features/roadmap/graph-model';
import { STANDINGS_W } from '@/features/roadmap/layout/layout-constants';
import { GroupTableNode } from './GroupTableNode';

/** Bottom source handle: edges fan out of the table; kept visually invisible. */
const HANDLE = '!h-1.5 !w-1.5 !border-0 !bg-edge-strong !opacity-0';

/**
 * Always-on standings table node — the single per-column header (requirement
 * item 2). Wraps the shared `GroupTableNode` for `data.group` in a fixed-width
 * shell, threads `data.onFocusTeam` so each resolved row's flag becomes a focus
 * trigger (item 3) and `data.onOpenStandings` so the table header opens the
 * overlay, and exposes ONE bottom source handle (`id="b"`) from which the dashed
 * membership edges fan out to this group's matches.
 */
function GroupStandingsNodeImpl({ data }: NodeProps<GroupStandingsFlowNode>): ReactElement {
  return (
    <div style={{ width: STANDINGS_W }} className="relative [contain:layout_paint]">
      <GroupTableNode
        group={data.group}
        onFocusTeam={data.onFocusTeam}
        onOpenStandings={data.onOpenStandings}
      />
      <Handle id="b" type="source" position={Position.Bottom} className={HANDLE} />
    </div>
  );
}

export const GroupStandingsNode = memo(GroupStandingsNodeImpl);
