import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { GroupHeaderFlowNode } from '@/features/roadmap/graph-model';

const HANDLE = '!h-1.5 !w-1.5 !border-0 !bg-edge-strong !opacity-0';

const CARD = [
  'group flex w-[260px] items-center gap-2 rounded-[14px] border px-3 py-2',
  'border-edge bg-gradient-to-b from-surf-2 to-surf-1 shadow-[var(--elevation-card)]',
  '[contain:layout_paint] transition-[transform,border-color,box-shadow] duration-150',
  'ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer text-left',
  'hover:-translate-y-0.5 hover:border-edge-strong hover:shadow-[var(--elevation-hover)]',
  'focus-visible:border-accent focus-visible:shadow-[var(--glow-accent)] focus-visible:outline-none',
].join(' ');

/**
 * Top column header: badge "A".."L" + "Group A". A `<button>` that opens the
 * standings overlay via `data.onOpenStandings(group)`, with ONE bottom source
 * handle (`id="b"`) so feeder edges originate here and flow downward. No top
 * handle — nothing routes INTO a header.
 */
function GroupHeaderNodeImpl({ data }: NodeProps<GroupHeaderFlowNode>) {
  const { group, onOpenStandings } = data;
  return (
    <button
      type="button"
      className={CARD}
      aria-label={`Open Group ${group} standings`}
      onClick={() => onOpenStandings?.(group)}
    >
      <span className="bg-accent font-display text-deep inline-flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[0.85rem] font-extrabold">
        {group}
      </span>
      <span className="text-ink text-[0.95rem] font-semibold">Group {group}</span>
      <Handle id="b" type="source" position={Position.Bottom} className={HANDLE} />
    </button>
  );
}

export const GroupHeaderNode = memo(GroupHeaderNodeImpl);
