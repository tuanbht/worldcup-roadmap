'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { GroupFlowNode } from '@/features/roadmap/graph-model';
import { Flag } from '@/components/ui/Flag';

const HANDLE = '!h-1.5 !w-1.5 !border-0 !bg-edge-strong !opacity-0';

function gd(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function GroupTableNodeImpl({ data }: NodeProps<GroupFlowNode>) {
  const { group } = data;
  return (
    <section
      aria-label={`Group ${group.name} standings`}
      className="w-[296px] overflow-hidden rounded-[14px] border border-edge bg-gradient-to-b from-surf-2 to-surf-1 shadow-[var(--elevation-card)] transition-[transform,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-edge-strong hover:shadow-[var(--elevation-hover)] [contain:layout_paint]"
    >
      <Handle id="sr" type="source" position={Position.Right} className={HANDLE} />
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-accent font-display text-[0.85rem] font-extrabold text-deep">
          {group.name}
        </span>
        <h3 className="text-[0.95rem] text-ink">Group {group.name}</h3>
      </header>
      {/* table-fixed + fixed numeric-column widths so a long team name (e.g. "Bosnia and
          Herzegovina") truncates instead of pushing the P / GD / Pts columns past the
          296px card edge, where overflow-hidden would clip them. */}
      <table className="w-full table-fixed border-collapse text-[0.82rem]">
        <colgroup>
          <col />
          <col className="w-9" />
          <col className="w-11" />
          <col className="w-11" />
        </colgroup>
        <thead>
          <tr className="[&>th]:border-t [&>th]:border-edge [&>th]:py-1 [&>th]:text-[0.72rem] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-[0.08em] [&>th]:text-dim">
            <th scope="col" className="px-3 text-left">Team</th>
            <th scope="col" className="px-1 text-center">P</th>
            <th scope="col" className="px-1 text-center">GD</th>
            <th scope="col" className="px-2 text-center">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {group.table.map((row) => (
            <tr
              key={row.team.id}
              className={`tabular-nums [&>td]:py-[5px] ${row.qualified ? 'bg-accent/15' : ''}`}
            >
              <td className="px-3 text-left">
                <span className="flex items-center gap-2 font-medium text-ink">
                  <Flag code={row.team.code} url={row.team.flagUrl} size={18} />
                  <span className="min-w-0 truncate">{row.team.name}</span>
                </span>
              </td>
              <td data-lod-detail className="px-1 text-center text-muted">{row.played}</td>
              <td data-lod-detail className="px-1 text-center text-muted">{gd(row.goalDifference)}</td>
              <td className="px-2 text-center font-bold text-ink">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export const GroupTableNode = memo(GroupTableNodeImpl);
