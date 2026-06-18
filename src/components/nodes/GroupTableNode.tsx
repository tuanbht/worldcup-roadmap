import { memo } from 'react';
import type { GroupTableProps } from '@/features/roadmap/graph-model';
import { Flag } from '@/components/ui/Flag';

function gd(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

/**
 * Standings table for one group. Now a plain panel rendered inside the on-demand
 * `StandingsOverlay` (no React Flow handles / NodeProps shell) — it is no longer
 * a positioned graph node.
 */
function GroupTableNodeImpl({ group }: GroupTableProps) {
  return (
    <section
      aria-label={`Group ${group.name} standings`}
      className="border-edge from-surf-2 to-surf-1 w-[296px] overflow-hidden rounded-[14px] border bg-gradient-to-b shadow-[var(--elevation-card)] [contain:layout_paint]"
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="bg-accent font-display text-deep inline-flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[0.85rem] font-extrabold">
          {group.name}
        </span>
        <h3 className="text-ink text-[0.95rem]">Group {group.name}</h3>
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
          <tr className="[&>th]:border-edge [&>th]:text-dim [&>th]:border-t [&>th]:py-1 [&>th]:text-[0.72rem] [&>th]:font-semibold [&>th]:tracking-[0.08em] [&>th]:uppercase">
            <th scope="col" className="px-3 text-left">
              Team
            </th>
            <th scope="col" className="px-1 text-center">
              P
            </th>
            <th scope="col" className="px-1 text-center">
              GD
            </th>
            <th scope="col" className="px-2 text-center">
              Pts
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {group.table.map((row) => (
            <tr
              key={row.team.id}
              className={`tabular-nums [&>td]:py-[5px] ${row.qualified ? 'bg-accent/15' : ''}`}
            >
              <td className="px-3 text-left">
                <span className="text-ink flex items-center gap-2 font-medium">
                  <Flag code={row.team.code} url={row.team.flagUrl} size={18} />
                  <span className="min-w-0 truncate">{row.team.name}</span>
                </span>
              </td>
              <td data-lod-detail className="text-muted px-1 text-center">
                {row.played}
              </td>
              <td data-lod-detail className="text-muted px-1 text-center">
                {gd(row.goalDifference)}
              </td>
              <td className="text-ink px-2 text-center font-bold">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export const GroupTableNode = memo(GroupTableNodeImpl);
export type { GroupTableProps };
